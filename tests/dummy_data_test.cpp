#include "../esp32/dummy_data.h"
#include <cassert>
int main() {
  for (unsigned t = 0; t < 10000; t += 100) for (uint8_t slot = 0; slot < 6; ++slot) {
    uint8_t p[20]; makeDummyPacket(p, slot, t);
    assert(p[0] == 1 && p[3] == 3);
    assert(p[1] == (slot < 2 ? 1 : 2));
    assert(p[2] == (slot < 2 ? slot : slot - 2));
    assert(p[4] == (t & 255) && p[5] == (t >> 8));
    if (p[1] == 1) {
      unsigned mv = p[10] | (p[11] << 8);
      assert(mv >= 500 && mv <= 950);
    }
  }
}
