#pragma once
#include <math.h>
#include "protocol.h"

// One sensor per packet; slots 0..1 elbow flex, 2..5 IMU.
// Uses the same units/encoding as real firmware. Header bit 1 marks simulated data.
inline void makeDummyPacket(uint8_t* packet, uint8_t slot, uint32_t now) {
  const float wave = sinf(now * 0.001f + slot * 0.5f);
  const uint8_t type = slot < 2 ? 1 : 2;
  const uint8_t id = slot < 2 ? slot : slot - 2;
  header(packet, type, id, true, now);
  packet[3] |= 2;
  if (type == 1) {
    const uint32_t ohms = static_cast<uint32_t>(40000 + 15000 * wave);
    const uint16_t mv = static_cast<uint16_t>(3300.0f * 10000 / (10000 + ohms));
    put16(packet + 8, static_cast<uint16_t>(mv * 4095u / 3300u));
    put16(packet + 10, mv);
    put32(packet + 12, ohms);
  } else if (type == 2) {
    const int16_t values[] = {static_cast<int16_t>(200 * wave),
      static_cast<int16_t>(100 * wave), 981,
      static_cast<int16_t>(200 * wave), static_cast<int16_t>(400 * wave), 10};
    for (uint8_t j = 0; j < 6; ++j)
      put16(packet + 8 + 2 * j, static_cast<uint16_t>(values[j]));
  }
}
