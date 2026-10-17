#include "flex_sensor.h"
#include "config.h"
#include <math.h>

void FlexSensor::begin() {
  pinMode(pin_, INPUT);
  analogReadResolution(12);
  analogSetPinAttenuation(pin_, ADC_11db);
}

FlexReading FlexSensor::read() {
  uint32_t raw = 0, mv = 0;
  for (int i = 0; i < 16; ++i) {
    raw += analogRead(pin_);
    mv += analogReadMilliVolts(pin_);
  }
  FlexReading r{static_cast<uint16_t>(raw / 16),
                static_cast<uint16_t>(mv / 16), NAN};
  // 3V3 -> flex -> ADC node -> fixed resistor -> GND.
  if (r.millivolts > 20 && r.millivolts < DIVIDER_SUPPLY_MV - 20) {
    r.resistanceOhms = FIXED_RESISTOR_OHMS *
        (DIVIDER_SUPPLY_MV / r.millivolts - 1.0f);
  }
  return r;
}
