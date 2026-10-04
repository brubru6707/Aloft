/*
 * Aloft pin finder. Flash this when a button "does nothing": it pulls up every usable GPIO
 * and prints which pin goes LOW when you press, so you learn where the wire really lands.
 *
 *   arduino-cli compile --fqbn esp32:esp32:esp32 firmware/pin_finder
 *   arduino-cli upload  --fqbn esp32:esp32:esp32:UploadSpeed=115200 -p /dev/cu.usbserial-0001 firmware/pin_finder
 *
 * Output on USB serial at 115200:
 *   idle: GPIO nn=H ...           level of every candidate pin at boot (a pin LOW here is tied low on
 *                                 the board or shorted to GND; e.g. GPIO 2 on boards with an LED)
 *   GPIO nn -> LOW  <us>          pin went low (pressed, pull-up)
 *   GPIO nn -> HIGH <us>          pin released
 *   now LOW: ...                  every 2 s, pins currently low (or "none")
 * Skipped: 1/3 (UART), 6-11 (flash), 34-39 (no internal pull-ups).
 * Note: GPIO 21/22 carry the MPU-6050 and read HIGH from its own pull-ups.
 */
static const int PINS[] = {0, 2, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33};
static const int N = sizeof(PINS) / sizeof(PINS[0]);
int last[N];

void setup() {
  Serial.begin(115200);
  delay(300);
  for (int i = 0; i < N; i++) pinMode(PINS[i], INPUT_PULLUP);
  delay(50);
  Serial.print("pin_finder idle:");
  for (int i = 0; i < N; i++) { last[i] = digitalRead(PINS[i]); Serial.printf(" %d=%c", PINS[i], last[i] ? 'H' : 'L'); }
  Serial.println();
}

void loop() {
  static uint32_t lastSummary = 0;
  for (int i = 0; i < N; i++) {
    const int v = digitalRead(PINS[i]);
    if (v != last[i]) {
      last[i] = v;
      Serial.printf("GPIO %d -> %s %lu\n", PINS[i], v ? "HIGH" : "LOW", (unsigned long)micros());
    }
  }
  if (millis() - lastSummary >= 2000) {
    lastSummary = millis();
    Serial.print("now LOW:");
    bool any = false;
    for (int i = 0; i < N; i++) if (!last[i]) { Serial.printf(" %d", PINS[i]); any = true; }
    Serial.println(any ? "" : " none");
  }
  delayMicroseconds(200);   // ~5 kHz scan
}
