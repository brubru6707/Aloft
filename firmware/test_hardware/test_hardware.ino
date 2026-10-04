// Aloft hardware diagnostic sketch.
// Wiring: MPU-6050/6500 (GY-521) SDA -> GPIO21, SCL -> GPIO22, VCC -> 3.3V.
// Buttons: GPIO13 and GPIO14 to GND, INPUT_PULLUP (pressed = LOW).
// Uses raw Wire register access so MPU-6500 clones (WHO_AM_I 0x70) work too.

#include <Wire.h>
#include <math.h>

static const int PIN_SDA = 21;
static const int PIN_SCL = 22;
static const int PIN_BTN_A = 13;
static const int PIN_BTN_B = 14;

static const uint8_t REG_PWR_MGMT_1 = 0x6B;
static const uint8_t REG_WHO_AM_I = 0x75;
static const uint8_t REG_ACCEL_XOUT_H = 0x3B;

uint8_t mpuAddr = 0;  // 0 = not found

bool writeReg(uint8_t addr, uint8_t reg, uint8_t val) {
  Wire.beginTransmission(addr);
  Wire.write(reg);
  Wire.write(val);
  return Wire.endTransmission() == 0;
}

bool readRegs(uint8_t addr, uint8_t reg, uint8_t *buf, size_t n) {
  Wire.beginTransmission(addr);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return false;
  size_t got = Wire.requestFrom((int)addr, (int)n);
  if (got != n) return false;
  for (size_t i = 0; i < n; i++) buf[i] = Wire.read();
  return true;
}

void i2cScan() {
  Serial.println("I2C scan (SDA=21, SCL=22):");
  int found = 0;
  for (uint8_t a = 1; a < 127; a++) {
    Wire.beginTransmission(a);
    if (Wire.endTransmission() == 0) {
      Serial.printf("  found device at 0x%02X\n", a);
      found++;
      if (mpuAddr == 0 && (a == 0x68 || a == 0x69)) mpuAddr = a;
    }
  }
  if (found == 0) Serial.println("  no I2C devices found");
  Serial.printf("I2C scan done, %d device(s)\n", found);
}

void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println();
  Serial.println("=== Aloft test_hardware ===");

  pinMode(PIN_BTN_A, INPUT_PULLUP);
  pinMode(PIN_BTN_B, INPUT_PULLUP);

  Wire.begin(PIN_SDA, PIN_SCL);
  Wire.setClock(100000);

  i2cScan();

  if (mpuAddr == 0) {
    Serial.println("MPU not found at 0x68 or 0x69. Check VCC/GND/SDA/SCL wiring.");
  } else {
    uint8_t who = 0;
    if (readRegs(mpuAddr, REG_WHO_AM_I, &who, 1)) {
      Serial.printf("WHO_AM_I (0x75) at 0x%02X = 0x%02X", mpuAddr, who);
      if (who == 0x68) Serial.println("  -> MPU-6050");
      else if (who == 0x70) Serial.println("  -> MPU-6500");
      else if (who == 0x71) Serial.println("  -> MPU-9250");
      else if (who == 0x73) Serial.println("  -> MPU-9255");
      else Serial.println("  -> unknown/clone");
    } else {
      Serial.println("WHO_AM_I read failed");
    }
    // Wake the sensor: clear sleep bit, use internal 8 MHz clock.
    if (writeReg(mpuAddr, REG_PWR_MGMT_1, 0x00)) {
      Serial.println("Sensor woken (PWR_MGMT_1 = 0x00)");
    } else {
      Serial.println("Failed to write PWR_MGMT_1");
    }
    delay(100);
  }
  Serial.println("Streaming at 10 Hz...");
}

void loop() {
  static uint32_t last = 0;
  uint32_t now = millis();
  if (now - last < 100) return;
  last = now;

  bool btnA = digitalRead(PIN_BTN_A) == LOW;
  bool btnB = digitalRead(PIN_BTN_B) == LOW;

  if (mpuAddr == 0) {
    Serial.printf("MPU missing  b13=%s b14=%s\n", btnA ? "PRESSED" : "up", btnB ? "PRESSED" : "up");
    return;
  }

  uint8_t raw[14];
  if (!readRegs(mpuAddr, REG_ACCEL_XOUT_H, raw, 14)) {
    Serial.printf("MPU read error  b13=%s b14=%s\n", btnA ? "PRESSED" : "up", btnB ? "PRESSED" : "up");
    return;
  }

  int16_t ax = (int16_t)((raw[0] << 8) | raw[1]);
  int16_t ay = (int16_t)((raw[2] << 8) | raw[3]);
  int16_t az = (int16_t)((raw[4] << 8) | raw[5]);
  // raw[6..7] = temperature
  int16_t gx = (int16_t)((raw[8] << 8) | raw[9]);
  int16_t gy = (int16_t)((raw[10] << 8) | raw[11]);
  int16_t gz = (int16_t)((raw[12] << 8) | raw[13]);

  float fx = ax, fy = ay, fz = az;
  float roll = atan2f(fy, fz) * 180.0f / (float)M_PI;
  float pitch = atan2f(-fx, sqrtf(fy * fy + fz * fz)) * 180.0f / (float)M_PI;

  Serial.printf("roll=%7.2f pitch=%7.2f ax=%6d ay=%6d az=%6d gx=%6d gy=%6d gz=%6d b13=%s b14=%s\n",
                roll, pitch, ax, ay, az, gx, gy, gz,
                btnA ? "PRESSED" : "up", btnB ? "PRESSED" : "up");
}
