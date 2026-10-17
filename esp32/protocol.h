#pragma once
#include <stdint.h>
#include <string.h>

// Explicit little-endian encoding, independent of struct padding.
inline void put16(uint8_t* p, uint16_t v) { p[0] = v; p[1] = v >> 8; }
inline void put32(uint8_t* p, uint32_t v) {
  for (int i = 0; i < 4; ++i) p[i] = v >> (8 * i);
}
inline void header(uint8_t* p, uint8_t type, uint8_t id, bool valid,
                   uint32_t timestamp) {
  memset(p, 0, 20);
  p[0] = 1; p[1] = type; p[2] = id; p[3] = valid ? 1 : 0;
  put32(p + 4, timestamp);
}
