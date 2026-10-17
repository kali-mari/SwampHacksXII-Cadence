#pragma once
#include <Arduino.h>

struct FlexReading {
  uint16_t raw;
  uint16_t millivolts;
  float resistanceOhms;  // NAN when voltage is outside the useful divider range
};

class FlexSensor {
 public:
  explicit FlexSensor(uint8_t pin) : pin_(pin) {}
  void begin();
  FlexReading read();
 private:
  uint8_t pin_;
};
