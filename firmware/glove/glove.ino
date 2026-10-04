/*
 * Aloft glove firmware — ESP32 + MPU-6050 (GY-521) + up to 6 buttons, BLE Nordic UART.
 *
 * Streams one ASCII line at 50 Hz over the NUS TX (notify) characteristic:
 *     roll,pitch,yaw,buttonsBitmask\n
 * e.g. "12.3,-4.8,91.0,5\n"   (degrees; bitmask bit n = BUTTON_PINS[n] pressed)
 *
 * Wiring
 *   GY-521  VCC -> 3V3, GND -> GND, SDA -> GPIO 21, SCL -> GPIO 22 (default ESP32 I2C pins)
 *   Buttons: GPIO 13, 14, 27, 26, 25, 32, 35 (bits 0-6), each to GND. GPIO 35 is input-only with
 *   NO internal pull-up: give it an external 10k resistor to 3V3 or it floats. What each one does is chosen
 *   in the app (glove panel), so any button can be any job.
 *   INPUT_PULLUP, pressed = LOW.
 *   (Unwired buttons simply read "not pressed" thanks to the pull-ups. GPIO 12 is a boot strapping pin, so it is not used.)
 *
 * Libraries to install (Arduino IDE -> Library Manager)
 *   - "NimBLE-Arduino" by h2zero (tested with 1.4.x / 2.x)
 *   - Wire (bundled with the ESP32 core)
 *   The MPU-6050 is read with raw register access, so no IMU library is needed.
 *
 * Board: "ESP32 Dev Module" (Arduino-ESP32 core 2.x or 3.x).
 *
 * Orientation convention (matches the web app's defaults):
 *   roll  = rotation about the forward (X) axis, right side down = positive
 *   pitch = rotation about the side (Y) axis, nose up = positive
 *   yaw   = integrated gyro Z, counter-clockwise viewed from above = positive; it drifts
 *           slowly, which is why the app has a Recenter button.
 * If the signs feel wrong with your mounting, flip them in the SIGN_* constants below
 * (or set invertRoll/invertPitch in the app's src/config.ts).
 */

#include <Wire.h>
#include <NimBLEDevice.h>

// ---------------- Config ----------------
static const char*   DEVICE_NAME   = "Aloft-Glove";
static const uint8_t MPU_ADDR      = 0x68;   // AD0 low. Use 0x69 if AD0 is tied high.
static const int     PIN_SDA       = 21;   // default wiring; if the sensor does not answer there,
static const int     PIN_SCL       = 22;   // setup() tries SDA/SCL swapped (the 6-button glove has them swapped)
static const uint32_t I2C_HZ        = 100000;
static const int     NUM_BUTTONS   = 7;
static const int     BUTTON_PINS[NUM_BUTTONS] = {13, 14, 27, 26, 25, 32, 35};   // bit order of the bitmask; must match GLOVE_PINS in the app. Avoid GPIO 0/2/12/15 (strapping); 34-39 need an external pull-up.
static const uint32_t SAMPLE_HZ    = 50;
static const float   ALPHA         = 0.98f;  // complementary filter: gyro weight
static const float   SIGN_ROLL     = -1.0f;  // sensor mounted mirrored: flip so rolling right reads positive
static const float   SIGN_PITCH    = 1.0f;
static const float   SIGN_YAW      = 1.0f;
static const uint8_t DEBOUNCE_MS   = 15;

// Diagnostics (USB serial only; the BLE stream is unchanged). Set BUTTON_DEBUG to 1 to add
// timestamped lines: every raw button edge from a GPIO interrupt (R), every debounced edge (D),
// every frame (F), once-a-second loop statistics (L) and BLE connection parameters (B).
// Decode with firmware/tools/button_diag.py. Leave at 0 for normal use, or build with
//   arduino-cli compile --build-property "compiler.cpp.extra_flags=-DBUTTON_DEBUG=1" ...
#ifndef BUTTON_DEBUG
#define BUTTON_DEBUG 0
#endif

// Gyro bias handling. Yaw is pure gyro integration, so any bias error becomes a steady drift.
static const int   CALIB_SAMPLES        = 400;    // ~1.2 s at 3 ms/sample
static const float CALIB_MAX_SPREAD_LSB = 200.0f; // reject a calibration pass if any axis moved more than this (~3 °/s)
static const int   CALIB_MAX_TRIES      = 8;
// At-rest bias re-learning works on 1 s blocks and judges stillness by how much the RAW
// readings varied over the block (spread), never by their mean, so a slow steady turn is
// not mistaken for rest and swallowed into the bias.
static const uint32_t STILL_BLOCK_MS    = 1000;   // length of one observation block
static const int16_t  STILL_GYRO_SPREAD = 40;     // max raw gyro (max-min) per axis over the block, ~0.6 °/s
static const float    STILL_ACC_SPREAD  = 0.03f;  // max |accel| (max-min) over the block, in g
static const float    BIAS_BLOCK_BLEND  = 0.3f;   // move the bias this fraction toward the block mean when still

// Nordic UART Service UUIDs
#define NUS_SERVICE_UUID "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define NUS_RX_UUID      "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"  // write  (app -> glove), unused
#define NUS_TX_UUID      "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"  // notify (glove -> app)

// ---------------- State ----------------
NimBLECharacteristic* txChar = nullptr;
volatile bool clientConnected = false;

float roll = 0, pitch = 0, yaw = 0;
float gyroBiasX = 0, gyroBiasY = 0, gyroBiasZ = 0;
uint32_t lastMicros = 0;

bool     btnState[NUM_BUTTONS]    = {};
bool     btnRaw[NUM_BUTTONS]      = {};
uint32_t btnChangedAt[NUM_BUTTONS] = {};

#if BUTTON_DEBUG
#include "soc/gpio_struct.h"
// Raw edges are captured by GPIO interrupts into a ring buffer so contact bounce is seen even
// while loop() is busy with I2C or BLE. loop() drains the ring and prints each edge.
struct RawEdge { uint32_t us; uint8_t idx; uint8_t level; };
static const uint16_t RAW_RING = 1024;
static DRAM_ATTR volatile RawEdge rawRing[RAW_RING];
static volatile uint16_t rawHead = 0, rawTail = 0;
static volatile uint32_t rawDropped = 0;
static DRAM_ATTR int dbgPins[NUM_BUTTONS] = {BUTTON_PINS[0], BUTTON_PINS[1], BUTTON_PINS[2], BUTTON_PINS[3], BUTTON_PINS[4], BUTTON_PINS[5], BUTTON_PINS[6]};
static uint32_t dbgI2cFail = 0, dbgNotifyFail = 0, dbgLoops = 0, dbgLoopSumUs = 0, dbgLoopMaxUs = 0, dbgLastStats = 0;

void IRAM_ATTR onButtonEdge(void* arg) {
  const uint8_t idx = (uint8_t)(uintptr_t)arg;
  const int pin = dbgPins[idx];
  const uint8_t level = pin < 32 ? ((GPIO.in >> pin) & 1) : ((GPIO.in1.val >> (pin - 32)) & 1);
  const uint16_t next = (uint16_t)((rawHead + 1) % RAW_RING);
  if (next == rawTail) { rawDropped++; return; }
  rawRing[rawHead].us = (uint32_t)esp_timer_get_time();
  rawRing[rawHead].idx = idx;
  rawRing[rawHead].level = level;
  rawHead = next;
}

void drainRawEdges() {
  while (rawTail != rawHead) {
    const RawEdge e = { rawRing[rawTail].us, rawRing[rawTail].idx, rawRing[rawTail].level };
    rawTail = (uint16_t)((rawTail + 1) % RAW_RING);
    Serial.printf("R%u %u %lu\n", e.idx, e.level, (unsigned long)e.us);
  }
}
#define DBG_US() ((unsigned long)esp_timer_get_time())
#endif

// ---------------- BLE callbacks ----------------
class ServerCallbacks : public NimBLEServerCallbacks {
#if defined(NIMBLE_CPP_VERSION) || (defined(CONFIG_BT_NIMBLE_ENABLED) && __has_include(<NimBLEConnInfo.h>))
  // NimBLE-Arduino 2.x signatures
  void onConnect(NimBLEServer* s, NimBLEConnInfo& info) override {
    clientConnected = true;
#if BUTTON_DEBUG
    Serial.printf("B connect itvl=%.2fms latency=%u timeout=%ums mtu=%u %lu\n", info.getConnInterval() * 1.25f,
                  info.getConnLatency(), info.getConnTimeout() * 10, info.getMTU(), DBG_US());
#endif
    // Ask for a fast connection interval (7.5–15 ms) so 50 Hz notifies are not throttled.
    s->updateConnParams(info.getConnHandle(), 6, 12, 0, 200);
  }
  void onDisconnect(NimBLEServer* s, NimBLEConnInfo& info, int reason) override {
    clientConnected = false;
#if BUTTON_DEBUG
    Serial.printf("B disconnect reason=%d %lu\n", reason, DBG_US());
#endif
    NimBLEDevice::startAdvertising();
  }
#if BUTTON_DEBUG
  void onMTUChange(uint16_t mtu, NimBLEConnInfo& info) override {
    Serial.printf("B mtu=%u %lu\n", mtu, DBG_US());
  }
  void onConnParamsUpdate(NimBLEConnInfo& info) override {
    Serial.printf("B params itvl=%.2fms latency=%u timeout=%ums %lu\n", info.getConnInterval() * 1.25f,
                  info.getConnLatency(), info.getConnTimeout() * 10, DBG_US());
  }
#endif
#else
  // NimBLE-Arduino 1.x signatures
  void onConnect(NimBLEServer* s, ble_gap_conn_desc* desc) override {
    clientConnected = true;
    s->updateConnParams(desc->conn_handle, 6, 12, 0, 200);
  }
  void onDisconnect(NimBLEServer* s) override {
    clientConnected = false;
    NimBLEDevice::startAdvertising();
  }
#endif
};

// ---------------- MPU-6050 ----------------
void mpuWrite(uint8_t reg, uint8_t val) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(reg); Wire.write(val);
  Wire.endTransmission();
}

bool mpuRead(int16_t* ax, int16_t* ay, int16_t* az, int16_t* gx, int16_t* gy, int16_t* gz) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);                       // ACCEL_XOUT_H
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom((int)MPU_ADDR, 14) != 14) return false;
  *ax = (Wire.read() << 8) | Wire.read();
  *ay = (Wire.read() << 8) | Wire.read();
  *az = (Wire.read() << 8) | Wire.read();
  Wire.read(); Wire.read();               // temperature, ignored
  *gx = (Wire.read() << 8) | Wire.read();
  *gy = (Wire.read() << 8) | Wire.read();
  *gz = (Wire.read() << 8) | Wire.read();
  return true;
}

void mpuInit() {
  mpuWrite(0x6B, 0x00);   // PWR_MGMT_1: wake up, internal 8 MHz clock
  delay(50);
  mpuWrite(0x6B, 0x01);   // clock = PLL with X gyro (more stable)
  mpuWrite(0x1A, 0x03);   // CONFIG: DLPF 44 Hz accel / 42 Hz gyro
  mpuWrite(0x1B, 0x08);   // GYRO_CONFIG: ±500 °/s  -> 65.5 LSB/(°/s)
  mpuWrite(0x1C, 0x00);   // ACCEL_CONFIG: ±2 g     -> 16384 LSB/g
  mpuWrite(0x19, 0x04);   // SMPLRT_DIV: 1 kHz / (1+4) = 200 Hz internal rate
}

// Average gyro samples at rest to remove bias. A pass is accepted only if the glove held
// still for the whole window (small min/max spread on every axis); otherwise it retries.
bool calibratePass() {
  long sx = 0, sy = 0, sz = 0; int n = 0;
  int16_t mn[3] = {32767, 32767, 32767}, mx[3] = {-32768, -32768, -32768};
  int16_t ax, ay, az, gx, gy, gz;
  for (int i = 0; i < CALIB_SAMPLES; i++) {
    if (mpuRead(&ax, &ay, &az, &gx, &gy, &gz)) {
      sx += gx; sy += gy; sz += gz; n++;
      const int16_t g[3] = {gx, gy, gz};
      for (int k = 0; k < 3; k++) { if (g[k] < mn[k]) mn[k] = g[k]; if (g[k] > mx[k]) mx[k] = g[k]; }
    }
    delay(3);
  }
  if (n < CALIB_SAMPLES / 2) return false;
  for (int k = 0; k < 3; k++) if (mx[k] - mn[k] > CALIB_MAX_SPREAD_LSB) return false;
  gyroBiasX = (float)sx / n;
  gyroBiasY = (float)sy / n;
  gyroBiasZ = (float)sz / n;
  return true;
}

void calibrateGyro() {
  for (int t = 1; t <= CALIB_MAX_TRIES; t++) {
    if (calibratePass()) {
      Serial.printf("Gyro bias: %.1f %.1f %.1f (pass %d)\n", gyroBiasX, gyroBiasY, gyroBiasZ, t);
      return;
    }
    Serial.println("Glove moved during calibration, retrying... hold still");
  }
  Serial.println("Calibration never settled; using last pass. Bias will self-correct once the glove rests.");
}

// Observe raw gyro/accel over 1 s blocks. If the glove was genuinely at rest for the whole
// block (tiny spread on every axis), nudge the bias toward the block's mean gyro reading.
// This removes temperature drift and fixes an imperfect boot calibration without ever
// eating real (even slow) motion.
struct StillBlock {
  uint32_t start = 0; int n = 0;
  long sum[3] = {0, 0, 0};
  int16_t mn[3] = {32767, 32767, 32767}, mx[3] = {-32768, -32768, -32768};
  float accMin = 1e9f, accMax = -1e9f;
  void reset(uint32_t now) { start = now; n = 0; for (int k = 0; k < 3; k++) { sum[k] = 0; mn[k] = 32767; mx[k] = -32768; } accMin = 1e9f; accMax = -1e9f; }
} stillBlock;

void adaptBiasIfStill(int16_t ax, int16_t ay, int16_t az, int16_t gx, int16_t gy, int16_t gz) {
  const uint32_t now = millis();
  if (stillBlock.start == 0) stillBlock.reset(now);
  const int16_t g[3] = {gx, gy, gz};
  for (int k = 0; k < 3; k++) { stillBlock.sum[k] += g[k]; if (g[k] < stillBlock.mn[k]) stillBlock.mn[k] = g[k]; if (g[k] > stillBlock.mx[k]) stillBlock.mx[k] = g[k]; }
  const float accG = sqrtf((float)ax * ax + (float)ay * ay + (float)az * az) / 16384.0f;
  if (accG < stillBlock.accMin) stillBlock.accMin = accG;
  if (accG > stillBlock.accMax) stillBlock.accMax = accG;
  stillBlock.n++;
  if (now - stillBlock.start < STILL_BLOCK_MS) return;

  bool still = stillBlock.n >= 50 && (stillBlock.accMax - stillBlock.accMin) < STILL_ACC_SPREAD;
  for (int k = 0; k < 3 && still; k++) if (stillBlock.mx[k] - stillBlock.mn[k] > STILL_GYRO_SPREAD) still = false;
  if (still) {
    gyroBiasX += ((float)stillBlock.sum[0] / stillBlock.n - gyroBiasX) * BIAS_BLOCK_BLEND;
    gyroBiasY += ((float)stillBlock.sum[1] / stillBlock.n - gyroBiasY) * BIAS_BLOCK_BLEND;
    gyroBiasZ += ((float)stillBlock.sum[2] / stillBlock.n - gyroBiasZ) * BIAS_BLOCK_BLEND;
  }
  stillBlock.reset(now);
}

void updateOrientation(float dt) {
  int16_t ax, ay, az, gx, gy, gz;
  if (!mpuRead(&ax, &ay, &az, &gx, &gy, &gz)) {
#if BUTTON_DEBUG
    dbgI2cFail++;
#endif
    return;
  }
  adaptBiasIfStill(ax, ay, az, gx, gy, gz);

  const float gxd = (gx - gyroBiasX) / 65.5f;   // °/s
  const float gyd = (gy - gyroBiasY) / 65.5f;
  const float gzd = (gz - gyroBiasZ) / 65.5f;

  // Accelerometer-only angles (noisy, no drift).
  const float accRoll  = atan2f((float)ay, (float)az) * 57.2958f;
  const float accPitch = atan2f(-(float)ax, sqrtf((float)ay * ay + (float)az * az)) * 57.2958f;

  // Complementary filter: trust the gyro short-term, the accelerometer long-term.
  roll  = ALPHA * (roll  + gxd * dt) + (1.0f - ALPHA) * accRoll;
  pitch = ALPHA * (pitch + gyd * dt) + (1.0f - ALPHA) * accPitch;

  // Yaw: gravity gives no heading reference, so integrate the gyro and wrap to ±180.
  // Ignore tiny residual rates so noise cannot creep in while resting (0.15 °/s = 9 °/min).
  if (fabsf(gzd) > 0.15f) yaw += gzd * dt;
  if (yaw > 180.0f) yaw -= 360.0f;
  if (yaw < -180.0f) yaw += 360.0f;
}

// ---------------- Buttons ----------------
// Polled every loop pass (~200+ Hz) with debouncing. Each debounced press sets a latch bit so
// that even a press shorter than one 50 Hz frame is reported in the next frame's bitmask.
uint8_t btnLatch = 0;
// Level that means "released" per pin. Pull-up pins rest HIGH. Pins without a pull-up (34-39)
// have their resting level learned at boot, so a button to GND (with an external pull-up) or to
// 3V3 (resting low) both work: whichever level the pin sits at untouched is "released".
bool btnIdleLevel[NUM_BUTTONS];

void pollButtons() {
  const uint32_t now = millis();
  for (int i = 0; i < NUM_BUTTONS; i++) {
    const bool raw = digitalRead(BUTTON_PINS[i]) != btnIdleLevel[i];   // pressed = away from the resting level
    if (raw != btnRaw[i]) { btnRaw[i] = raw; btnChangedAt[i] = now; }
    if (now - btnChangedAt[i] >= DEBOUNCE_MS && btnState[i] != btnRaw[i]) {
      btnState[i] = btnRaw[i];
      if (btnState[i]) btnLatch |= (1 << i);
#if BUTTON_DEBUG
      Serial.printf("D%d %d %lu\n", i, btnState[i] ? 0 : 1, DBG_US());   // same level convention as R: 0 = pressed
#endif
    }
  }
}

uint8_t readButtons() {
  uint8_t mask = btnLatch;          // presses seen since the last frame, even if already released
  btnLatch = 0;
  for (int i = 0; i < NUM_BUTTONS; i++) if (btnState[i]) mask |= (1 << i);
  return mask;
}

// Free a stuck I2C bus: clock each of the two lines 10 times while the other floats high, so a
// sensor left mid-byte (e.g. after probing with SDA/SCL the wrong way round) releases SDA.
void i2cBusRecover(int a, int b) {
  for (int k = 0; k < 2; k++) {
    const int clk = k ? b : a, dat = k ? a : b;
    pinMode(dat, INPUT_PULLUP);
    pinMode(clk, OUTPUT_OPEN_DRAIN);
    for (int i = 0; i < 10; i++) { digitalWrite(clk, LOW); delayMicroseconds(5); digitalWrite(clk, HIGH); delayMicroseconds(5); }
  }
  pinMode(a, INPUT_PULLUP);
  pinMode(b, INPUT_PULLUP);
  delayMicroseconds(20);
}

// ---------------- Arduino ----------------
void setup() {
#if BUTTON_DEBUG
  Serial.setTxBufferSize(8192);   // bursts of edge lines must not block loop()
#endif
  Serial.begin(115200);
  // GPIO 34-39 have no internal pull-up (input only): plain INPUT, needs an external pull-up.
  for (int i = 0; i < NUM_BUTTONS; i++) pinMode(BUTTON_PINS[i], BUTTON_PINS[i] >= 34 ? INPUT : INPUT_PULLUP);
  delay(20);
  for (int i = 0; i < NUM_BUTTONS; i++) {
    if (BUTTON_PINS[i] < 34) { btnIdleLevel[i] = HIGH; continue; }
    int highs = 0;
    for (int k = 0; k < 50; k++) { highs += digitalRead(BUTTON_PINS[i]); delay(1); }
    btnIdleLevel[i] = highs > 25;
    Serial.printf("GPIO %d rests %s: pressed = %s\n", BUTTON_PINS[i], highs > 25 ? "HIGH" : "LOW", highs > 25 ? "LOW" : "HIGH");
  }
#if BUTTON_DEBUG
  for (int i = 0; i < NUM_BUTTONS; i++) attachInterruptArg(BUTTON_PINS[i], onButtonEdge, (void*)(uintptr_t)i, CHANGE);
  Serial.println("BUTTON_DEBUG on: R<idx> <level> <us> raw edge | D<idx> <level> <us> debounced | F <us> <mask> | L loop stats | B ble");
#endif

  // Find the MPU: normal wiring first, then SDA/SCL swapped.
  bool mpuFound = false;
  // 100 kHz: the 6-button glove's longer wires do not work at 400 kHz, and 100 kHz is plenty for 200 Hz reads.
  delay(100);   // let the MPU power up
  for (int attempt = 0; attempt < 6 && !mpuFound; attempt++) {
    const bool swapped = attempt % 2 == 1;
    const int sda = swapped ? PIN_SCL : PIN_SDA, scl = swapped ? PIN_SDA : PIN_SCL;
    Wire.end();
    i2cBusRecover(PIN_SDA, PIN_SCL);
    Wire.begin(sda, scl, I2C_HZ);
    Wire.setTimeOut(20);
    delay(10);
    Wire.beginTransmission(MPU_ADDR);
    mpuFound = Wire.endTransmission() == 0;
    Serial.printf("MPU on SDA=%d SCL=%d: %s\n", sda, scl, mpuFound ? "found" : "no answer");
    if (!mpuFound) delay(50);
  }
  if (!mpuFound) { Wire.end(); Wire.begin(PIN_SDA, PIN_SCL, I2C_HZ); Serial.println("MPU not found: check VCC / GND / SDA / SCL wiring"); }
  mpuInit();
  Serial.println("Calibrating gyro, hold still...");
  calibrateGyro();
  Serial.println("Done.");

  NimBLEDevice::init(DEVICE_NAME);
  NimBLEDevice::setPower(ESP_PWR_LVL_P9);
  NimBLEServer* server = NimBLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());

  NimBLEService* nus = server->createService(NUS_SERVICE_UUID);
  txChar = nus->createCharacteristic(NUS_TX_UUID, NIMBLE_PROPERTY::NOTIFY);
  nus->createCharacteristic(NUS_RX_UUID, NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR);
  nus->start();

  NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
  adv->addServiceUUID(NUS_SERVICE_UUID);
#if defined(NIMBLE_CPP_VERSION)
  adv->setName(DEVICE_NAME);
#else
  adv->setScanResponse(true);
#endif
  adv->start();
  Serial.println("Advertising as Aloft-Glove");
  lastMicros = micros();
}

void loop() {
  static uint32_t lastSend = 0;
  const uint32_t nowMicros = micros();
  const float dt = (nowMicros - lastMicros) * 1e-6f;
  lastMicros = nowMicros;
#if BUTTON_DEBUG
  {
    const uint32_t loopUs = (uint32_t)(dt * 1e6f);
    dbgLoops++; dbgLoopSumUs += loopUs; if (loopUs > dbgLoopMaxUs) dbgLoopMaxUs = loopUs;
  }
#endif
  updateOrientation(dt);            // run the filter as fast as the loop goes (~200 Hz)
  pollButtons();

  const uint32_t nowMs = millis();
  if (nowMs - lastSend >= 1000 / SAMPLE_HZ) {
    lastSend = nowMs;
    const uint8_t buttons = readButtons();
    char line[48];
    const int n = snprintf(line, sizeof(line), "%.1f,%.1f,%.1f,%u\n",
                           SIGN_ROLL * roll, SIGN_PITCH * pitch, SIGN_YAW * yaw, buttons);
    if (clientConnected && txChar) {
      txChar->setValue((uint8_t*)line, n);
#if BUTTON_DEBUG
      if (!txChar->notify()) dbgNotifyFail++;
#else
      txChar->notify();
#endif
    }
#if BUTTON_DEBUG
    Serial.printf("F %lu %u\n", DBG_US(), buttons);
#endif
    Serial.write(line, n);          // same stream on USB serial for debugging
  }

#if BUTTON_DEBUG
  drainRawEdges();
  if (nowMs - dbgLastStats >= 1000) {
    dbgLastStats = nowMs;
    Serial.printf("L loops=%lu mean_us=%lu max_us=%lu i2c_fail=%lu notify_fail=%lu raw_dropped=%lu ble=%d %lu\n",
                  (unsigned long)dbgLoops, (unsigned long)(dbgLoops ? dbgLoopSumUs / dbgLoops : 0), (unsigned long)dbgLoopMaxUs,
                  (unsigned long)dbgI2cFail, (unsigned long)dbgNotifyFail, (unsigned long)rawDropped, clientConnected ? 1 : 0, DBG_US());
    dbgLoops = 0; dbgLoopSumUs = 0; dbgLoopMaxUs = 0;
  }
#endif
}
