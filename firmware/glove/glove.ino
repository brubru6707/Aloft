/*
 * Aloft glove firmware — ESP32 + MPU-6050 (GY-521) + 4 buttons, BLE Nordic UART.
 *
 * Streams one ASCII line at 50 Hz over the NUS TX (notify) characteristic:
 *     roll,pitch,yaw,buttonsBitmask\n
 * e.g. "12.3,-4.8,91.0,5\n"   (degrees; bitmask bit n = button n pressed)
 *
 * Wiring
 *   GY-521  VCC -> 3V3, GND -> GND, SDA -> GPIO 21, SCL -> GPIO 22 (default ESP32 I2C pins)
 *   Buttons: GPIO 13 (B0), 12 (B1), 14 (B2), 27 (B3) each to GND. INPUT_PULLUP, pressed = LOW.
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
static const int     PIN_SDA       = 21;
static const int     PIN_SCL       = 22;
static const int     BUTTON_PINS[4] = {13, 12, 14, 27};
static const uint32_t SAMPLE_HZ    = 50;
static const float   ALPHA         = 0.98f;  // complementary filter: gyro weight
static const float   SIGN_ROLL     = 1.0f;
static const float   SIGN_PITCH    = 1.0f;
static const float   SIGN_YAW      = 1.0f;
static const uint8_t DEBOUNCE_MS   = 15;

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

bool     btnState[4]    = {false, false, false, false};
bool     btnRaw[4]      = {false, false, false, false};
uint32_t btnChangedAt[4] = {0, 0, 0, 0};

// ---------------- BLE callbacks ----------------
class ServerCallbacks : public NimBLEServerCallbacks {
#if defined(NIMBLE_CPP_VERSION) || (defined(CONFIG_BT_NIMBLE_ENABLED) && __has_include(<NimBLEConnInfo.h>))
  // NimBLE-Arduino 2.x signatures
  void onConnect(NimBLEServer* s, NimBLEConnInfo& info) override {
    clientConnected = true;
    // Ask for a fast connection interval (7.5–15 ms) so 50 Hz notifies are not throttled.
    s->updateConnParams(info.getConnHandle(), 6, 12, 0, 200);
  }
  void onDisconnect(NimBLEServer* s, NimBLEConnInfo& info, int reason) override {
    clientConnected = false;
    NimBLEDevice::startAdvertising();
  }
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

// Average a few hundred gyro samples at rest to remove bias. Keep the glove still at boot.
void calibrateGyro() {
  const int N = 300;
  long sx = 0, sy = 0, sz = 0;
  int16_t ax, ay, az, gx, gy, gz;
  for (int i = 0; i < N; i++) {
    if (mpuRead(&ax, &ay, &az, &gx, &gy, &gz)) { sx += gx; sy += gy; sz += gz; }
    delay(3);
  }
  gyroBiasX = (float)sx / N;
  gyroBiasY = (float)sy / N;
  gyroBiasZ = (float)sz / N;
}

void updateOrientation(float dt) {
  int16_t ax, ay, az, gx, gy, gz;
  if (!mpuRead(&ax, &ay, &az, &gx, &gy, &gz)) return;

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
  yaw += gzd * dt;
  if (yaw > 180.0f) yaw -= 360.0f;
  if (yaw < -180.0f) yaw += 360.0f;
}

// ---------------- Buttons ----------------
uint8_t readButtons() {
  const uint32_t now = millis();
  uint8_t mask = 0;
  for (int i = 0; i < 4; i++) {
    const bool raw = digitalRead(BUTTON_PINS[i]) == LOW;   // pressed = LOW (pull-up)
    if (raw != btnRaw[i]) { btnRaw[i] = raw; btnChangedAt[i] = now; }
    if (now - btnChangedAt[i] >= DEBOUNCE_MS) btnState[i] = btnRaw[i];
    if (btnState[i]) mask |= (1 << i);
  }
  return mask;
}

// ---------------- Arduino ----------------
void setup() {
  Serial.begin(115200);
  for (int i = 0; i < 4; i++) pinMode(BUTTON_PINS[i], INPUT_PULLUP);

  Wire.begin(PIN_SDA, PIN_SCL, 400000);
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
  updateOrientation(dt);            // run the filter as fast as the loop goes (~200 Hz)

  const uint32_t nowMs = millis();
  if (nowMs - lastSend >= 1000 / SAMPLE_HZ) {
    lastSend = nowMs;
    const uint8_t buttons = readButtons();
    char line[48];
    const int n = snprintf(line, sizeof(line), "%.1f,%.1f,%.1f,%u\n",
                           SIGN_ROLL * roll, SIGN_PITCH * pitch, SIGN_YAW * yaw, buttons);
    if (clientConnected && txChar) {
      txChar->setValue((uint8_t*)line, n);
      txChar->notify();
    }
    Serial.write(line, n);          // same stream on USB serial for debugging
  }
}
