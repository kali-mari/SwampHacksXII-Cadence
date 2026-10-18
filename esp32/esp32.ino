#include <Arduino.h>
#include <Wire.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLE2902.h>
#include <Adafruit_MPU6050.h>
#include <atomic>
#include <math.h>
#include <esp_system.h>
#include "config.h"
#include "flex_sensor.h"
#include "protocol.h"
#include "dummy_data.h"
#include "elbow_estimator.h"

ElbowEstimator elbows[2];

FlexSensor flex[FLEX_COUNT] = {FlexSensor(FLEX_PINS[0]), FlexSensor(FLEX_PINS[1])};
TwoWire secondBus(1);
TwoWire* buses[2] = {&Wire, &secondBus};
bool busReady[2] = {};
Adafruit_MPU6050 imus[IMU_COUNT];
bool imuReady[IMU_COUNT] = {};
BLECharacteristic* dataCharacteristic = nullptr;
BLE2902* notificationSettings = nullptr;
std::atomic<bool> connected{false}, restartAdvertising{false};
uint32_t lastNotificationMs = 0;
constexpr bool BLE_STATUS_LED_AVAILABLE = SEND_DUMMY_DATA ||
  !FLEX_ENABLED[0] || FLEX_PINS[0] != LED_BUILTIN;

class ConnectionCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer*) override {
    connected = true;
    Serial.println("BLE CONNECTED: phone connected; enable notifications in app.");
  }
  void onDisconnect(BLEServer*) override {
    connected = false;
    Serial.println("BLE DISCONNECTED: restarting advertising.");
    restartAdvertising = true;
  }
};

void publish(uint8_t* packet) {
  if (connected.load() && notificationSettings && notificationSettings->getNotifications()) {
    dataCharacteristic->setValue(packet, 20);
    dataCharacteristic->notify();
    lastNotificationMs = millis();
  }
}

// Debug function to ensure bluetooth transmission working
void updateBleLed() {
  if (!BLE_STATUS_LED_AVAILABLE) return;
  static uint32_t lastToggle = 0;
  static bool active = false, ledOn = false;
  const uint32_t now = millis();
  const bool transmitting = connected.load() &&
      static_cast<uint32_t>(now - lastNotificationMs) < 1000;
  if (!transmitting) {
    // Visible proof that loop() is running even before a phone connects.
    active = false;
    digitalWrite(LED_BUILTIN, (now / 500) % 2 ? HIGH : LOW);
    return;
  }
  if (!active) {
    active = true;
    ledOn = true;
    lastToggle = now;
  } else if (static_cast<uint32_t>(now - lastToggle) >= 1000) {
    ledOn = !ledOn;
    lastToggle = now;
  }
  digitalWrite(LED_BUILTIN, ledOn ? HIGH : LOW);
}

int16_t quantize(float value, float scale) {
  return static_cast<int16_t>(lroundf(constrain(value * scale, -32768.0f, 32767.0f)));
}

void setup() {
  Serial.begin(115200);
  // Bounded wait for native USB enumeration, never require a monitor to run BLE.
  const uint32_t usbStart = millis();
  while (!Serial && millis() - usbStart < 2000) delay(10);
  Serial.println("\nPOSTURE BOOT: two elbow flex sensors + four IMUs.");
  Serial.printf("Reset reason: %d; free heap: %u\n", static_cast<int>(esp_reset_reason()), ESP.getFreeHeap());
  if (BLE_STATUS_LED_AVAILABLE) {
    pinMode(LED_BUILTIN, OUTPUT);
    digitalWrite(LED_BUILTIN, LOW);
  } else {
    Serial.println("BLE LED disabled: onboard LED shares enabled flex input GPIO13.");
  }
  if (!SEND_DUMMY_DATA) for (uint8_t i = 0; i < FLEX_COUNT; ++i)
    if (FLEX_ENABLED[i]) {
      flex[i].begin();
      Serial.printf("Flex %u: ADC GPIO%u configured (validate divider in Serial Monitor)\n", i, FLEX_PINS[i]);
    }
  if (!SEND_DUMMY_DATA && ENABLE_I2C_SENSORS) {
    for (uint8_t bus = 0; bus < 2; ++bus) {
      busReady[bus] = buses[bus]->begin(I2C_SDA[bus], I2C_SCL[bus], 100000);
      buses[bus]->setTimeOut(25);
      Serial.printf("I2C bus %u: %s (SDA=%u SCL=%u)\n", bus,
                    busReady[bus] ? "OK" : "failed", I2C_SDA[bus], I2C_SCL[bus]);
    }
    for (uint8_t i = 0; i < IMU_COUNT; ++i) {
      imuReady[i] = busReady[IMU_BUS[i]] &&
          imus[i].begin(IMU_ADDRESS[i], buses[IMU_BUS[i]]);
      if (ENABLE_I2C_SENSORS && imuReady[i]) {
        imus[i].setAccelerometerRange(MPU6050_RANGE_8_G);
        imus[i].setGyroRange(MPU6050_RANGE_500_DEG);
        imus[i].setFilterBandwidth(MPU6050_BAND_21_HZ);
      }
      Serial.printf("IMU %u bus %u address 0x%02X: %s\n", i, IMU_BUS[i], IMU_ADDRESS[i], imuReady[i] ? "OK" : "MISSING - check wiring/AD0, then reset");
    }
  }
  Serial.println("Hold arms STRAIGHT and STILL for 2 seconds to calibrate IMU fallback. Reset to recalibrate.");
  Serial.println("Starting BLE as PostureShirt...");
  BLEDevice::init("PostureShirt");
  auto* server = BLEDevice::createServer();
  server->setCallbacks(new ConnectionCallbacks());
  auto* service = server->createService(SERVICE_UUID);
  dataCharacteristic = service->createCharacteristic(
      DATA_UUID, BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  notificationSettings = new BLE2902();
  dataCharacteristic->addDescriptor(notificationSettings);
  service->start();
  auto* advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->setScanResponse(true);
  advertising->start();
  Serial.printf("BLE advertising service: %s\n", SERVICE_UUID);
  if (SEND_DUMMY_DATA) Serial.println("DUMMY MODE: simulated readings over real Bluetooth; sensors are not read.");
  Serial.println("PostureShirt ready; flex_id,raw,mV,ohms CSV follows at 5 Hz");
}

void loop() {
  updateBleLed();
  if (restartAdvertising.exchange(false)) BLEDevice::startAdvertising();
  if (SEND_DUMMY_DATA) {
    static uint32_t lastDummy = 0, lastStatus = 0;
    static uint8_t slot = 0;
    const uint32_t now = millis();
    if (static_cast<uint32_t>(now - lastStatus) >= 1000) {
      lastStatus = now;
      Serial.printf("DUMMY BLE: %s\n", connected.load() ? "connected; sending" : "advertising; waiting for app");
    }
    if (connected.load() && static_cast<uint32_t>(now - lastDummy) >= 20) {
      lastDummy = now;
      uint8_t packet[20];
      makeDummyPacket(packet, slot, now);
      publish(packet);
      slot = (slot + 1) % (FLEX_COUNT + IMU_COUNT);
    }
    delay(1);
    return;
  }
  static uint32_t lastSample = 0, lastLog = 0;
  uint32_t now = millis();
  if (static_cast<uint32_t>(now - lastSample) < SAMPLE_PERIOD_MS) {
    delay(1);
    return;
  }
  lastSample = now;
  uint8_t packet[20];
  const bool logFlex = static_cast<uint32_t>(now - lastLog) >= 200;
  if (logFlex) lastLog = now;
  bool fresh[4] = {};
  float accel[4][3] = {}, gyro[4][3] = {};
  for (uint8_t i = 0; i < IMU_COUNT; ++i) {
    sensors_event_t a{}, g{}, t{};
    // Verify an ACK before using the library's event conversion.
    bool ok = false;
    if (ENABLE_I2C_SENSORS && imuReady[i]) {
      buses[IMU_BUS[i]]->beginTransmission(IMU_ADDRESS[i]);
      ok = buses[IMU_BUS[i]]->endTransmission() == 0 && imus[i].getEvent(&a, &g, &t);
    }
    ok = ok && isfinite(a.acceleration.x) && isfinite(a.acceleration.y) &&
        isfinite(a.acceleration.z) && isfinite(g.gyro.x) && isfinite(g.gyro.y) && isfinite(g.gyro.z);
    fresh[i] = ok;
    if (ok) {
      accel[i][0] = a.acceleration.x; accel[i][1] = a.acceleration.y; accel[i][2] = a.acceleration.z;
      gyro[i][0] = g.gyro.x; gyro[i][1] = g.gyro.y; gyro[i][2] = g.gyro.z;
    }
    header(packet, 2, i, ok, millis());
    if (ok) {
      float values[] = {a.acceleration.x, a.acceleration.y, a.acceleration.z,
                        g.gyro.x, g.gyro.y, g.gyro.z};
      for (uint8_t j = 0; j < 6; ++j)
        put16(packet + 8 + 2 * j, static_cast<uint16_t>(quantize(values[j], j < 3 ? 100 : 1000)));
    }
    publish(packet);
  }
  for (int arm = 0; arm < 2; ++arm) {
    const bool wasReady = elbows[arm].ready;
    elbows[arm].update(fresh[2*arm] && fresh[2*arm+1], &accel[2*arm], &gyro[2*arm], millis());
    if (!wasReady && elbows[arm].ready) Serial.printf("Arm %d IMU fallback calibrated\n", arm);
    if (wasReady && !elbows[arm].ready) Serial.printf("Arm %d tracking lost; reset with arms straight to recalibrate\n", arm);
  }
  for (uint8_t i = 0; i < FLEX_COUNT; ++i) {
    if (!FLEX_ENABLED[i]) continue;
    auto r = flex[i].read();
    const bool fallback = !isfinite(r.resistanceOhms) && elbows[i].ready;
    header(packet, 1, i, isfinite(r.resistanceOhms) || fallback, millis());
    if (fallback) {
      packet[0] = 2; // Older apps reject this rather than interpreting an angle as resistance.
      packet[3] |= 4; // IMU estimate: bytes 16-17 are centidegrees, NOT ohms.
      put16(packet + 16, static_cast<uint16_t>(lroundf(elbows[i].angleDegrees * 100)));
    }
    put16(packet + 8, r.raw);
    put16(packet + 10, r.millivolts);
    put32(packet + 12, isfinite(r.resistanceOhms) ?
        static_cast<uint32_t>(lroundf(r.resistanceOhms)) : 0);
    publish(packet);
    if (logFlex) {
      Serial.printf("%u,%u,%u,%.0f\n", i, r.raw, r.millivolts, r.resistanceOhms);
    }
  }

}
