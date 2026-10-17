#include <Arduino.h>
#include <Wire.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLE2902.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_SHT4x.h>
#include <atomic>
#include <math.h>
#include "config.h"
#include "flex_sensor.h"
#include "protocol.h"

FlexSensor flex[FLEX_COUNT] = {FlexSensor(FLEX_PINS[0]), FlexSensor(FLEX_PINS[1]),
                               FlexSensor(FLEX_PINS[2])};
TwoWire secondBus(1);
TwoWire* buses[2] = {&Wire, &secondBus};
bool busReady[2] = {};
Adafruit_MPU6050 imus[IMU_COUNT];
Adafruit_SHT4x humidity[HUMIDITY_COUNT];
bool imuReady[IMU_COUNT] = {}, humidityReady[HUMIDITY_COUNT] = {};
BLECharacteristic* dataCharacteristic = nullptr;
std::atomic<bool> connected{false}, restartAdvertising{false};

class ConnectionCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer*) override { connected = true; }
  void onDisconnect(BLEServer*) override {
    connected = false;
    restartAdvertising = true;
  }
};

void publish(uint8_t* packet) {
  if (connected.load()) {
    dataCharacteristic->setValue(packet, 20);
    dataCharacteristic->notify();
  }
}

int16_t quantize(float value, float scale) {
  return static_cast<int16_t>(lroundf(constrain(value * scale, -32768.0f, 32767.0f)));
}

void setup() {
  Serial.begin(115200);  // Do not wait for USB: also runs from a battery.
  for (uint8_t i = 0; i < FLEX_COUNT; ++i)
    if (FLEX_ENABLED[i]) flex[i].begin();
  if (ENABLE_I2C_SENSORS) {
    for (uint8_t bus = 0; bus < 2; ++bus) {
      busReady[bus] = buses[bus]->begin(I2C_SDA[bus], I2C_SCL[bus], 100000);
      buses[bus]->setTimeOut(25);
      Serial.printf("I2C bus %u: %s (SDA=%u SCL=%u)\n", bus,
                    busReady[bus] ? "OK" : "failed", I2C_SDA[bus], I2C_SCL[bus]);
    }
    for (uint8_t i = 0; i < IMU_COUNT; ++i) {
      imuReady[i] = busReady[IMU_BUS[i]] &&
          imus[i].begin(IMU_ADDRESS[i], buses[IMU_BUS[i]]);
      if (imuReady[i]) {
        imus[i].setAccelerometerRange(MPU6050_RANGE_8_G);
        imus[i].setGyroRange(MPU6050_RANGE_500_DEG);
        imus[i].setFilterBandwidth(MPU6050_BAND_21_HZ);
      }
      Serial.printf("IMU %u: %s\n", i, imuReady[i] ? "OK" : "missing");
    }
    for (uint8_t i = 0; i < HUMIDITY_COUNT; ++i) {
      humidityReady[i] = busReady[i] && humidity[i].begin(buses[i]);
      if (humidityReady[i]) humidity[i].setHeater(SHT4X_NO_HEATER);
      Serial.printf("SHT40 %u: %s\n", i, humidityReady[i] ? "OK" : "missing");
    }
  }
  BLEDevice::init("PostureShirt");
  auto* server = BLEDevice::createServer();
  server->setCallbacks(new ConnectionCallbacks());
  auto* service = server->createService(SERVICE_UUID);
  dataCharacteristic = service->createCharacteristic(
      DATA_UUID, BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  dataCharacteristic->addDescriptor(new BLE2902());
  service->start();
  auto* advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->setScanResponse(true);
  advertising->start();
  Serial.println("PostureShirt ready; flex_id,raw,mV,ohms CSV follows at 5 Hz");
}

void loop() {
  if (restartAdvertising.exchange(false)) BLEDevice::startAdvertising();
  static uint32_t lastSample = 0, lastHumidity = 0, lastLog = 0;
  uint32_t now = millis();
  if (static_cast<uint32_t>(now - lastSample) < SAMPLE_PERIOD_MS) {
    delay(1);
    return;
  }
  lastSample = now;
  uint8_t packet[20];
  const bool logFlex = static_cast<uint32_t>(now - lastLog) >= 200;
  if (logFlex) lastLog = now;
  for (uint8_t i = 0; i < FLEX_COUNT; ++i) {
    if (!FLEX_ENABLED[i]) continue;
    auto r = flex[i].read();
    header(packet, 1, i, isfinite(r.resistanceOhms), millis());
    put16(packet + 8, r.raw);
    put16(packet + 10, r.millivolts);
    put32(packet + 12, isfinite(r.resistanceOhms) ?
        static_cast<uint32_t>(lroundf(r.resistanceOhms)) : 0);
    publish(packet);
    if (logFlex) {
      Serial.printf("%u,%u,%u,%.0f\n", i, r.raw, r.millivolts, r.resistanceOhms);
    }
  }
  if (!ENABLE_I2C_SENSORS) return;
  for (uint8_t i = 0; i < IMU_COUNT; ++i) {
    sensors_event_t a{}, g{}, t{};
    bool ok = imuReady[i] && imus[i].getEvent(&a, &g, &t);
    header(packet, 2, i, ok, millis());
    if (ok) {
      float values[] = {a.acceleration.x, a.acceleration.y, a.acceleration.z,
                        g.gyro.x, g.gyro.y, g.gyro.z};
      for (uint8_t j = 0; j < 6; ++j)
        put16(packet + 8 + 2 * j, static_cast<uint16_t>(quantize(values[j], j < 3 ? 100 : 1000)));
    }
    publish(packet);
  }
  if (static_cast<uint32_t>(now - lastHumidity) >= HUMIDITY_PERIOD_MS) {
    lastHumidity = now;
    for (uint8_t i = 0; i < HUMIDITY_COUNT; ++i) {
      sensors_event_t h{}, t{};
      bool ok = humidityReady[i] && humidity[i].getEvent(&h, &t);
      header(packet, 3, i, ok, millis());
      if (ok) {
        put16(packet + 8, static_cast<uint16_t>(quantize(t.temperature, 100)));
        put16(packet + 10, static_cast<uint16_t>(lroundf(h.relative_humidity * 100)));
      }
      publish(packet);
    }
  }
}
