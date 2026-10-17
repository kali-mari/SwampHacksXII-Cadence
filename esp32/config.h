#pragma once
#include <Arduino.h>

// Full two-bus shirt. Disable individual flex inputs when bench testing.
constexpr bool ENABLE_I2C_SENSORS = true;
constexpr uint8_t IMU_COUNT = 4;
constexpr uint8_t HUMIDITY_COUNT = 2;
constexpr uint8_t FLEX_COUNT = 3;
// IDs: left elbow, right elbow, spine. GPIO13 retained for existing wiring.
constexpr uint8_t FLEX_PINS[FLEX_COUNT] = {13, A1, A2};
constexpr bool FLEX_ENABLED[FLEX_COUNT] = {true, true, true};
constexpr uint8_t I2C_SDA[2] = {3, 5};
constexpr uint8_t I2C_SCL[2] = {4, 6};
constexpr uint8_t IMU_BUS[IMU_COUNT] = {0, 0, 1, 1};
constexpr uint8_t IMU_ADDRESS[IMU_COUNT] = {0x68, 0x69, 0x68, 0x69};
constexpr float DIVIDER_SUPPLY_MV = 3300.0f;
constexpr float FIXED_RESISTOR_OHMS = 10000.0f;
constexpr uint32_t SAMPLE_PERIOD_MS = 20;  // target 50 Hz, not a hard real-time guarantee
constexpr uint32_t HUMIDITY_PERIOD_MS = 1000;
constexpr char SERVICE_UUID[] = "7f100001-1b15-4f0d-8c5b-5c794f726b00";
constexpr char DATA_UUID[] = "7f100002-1b15-4f0d-8c5b-5c794f726b00";
