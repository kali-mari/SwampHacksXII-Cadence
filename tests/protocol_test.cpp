#include "../esp32/protocol.h"
#include <cassert>
int main() {
  uint8_t p[20];
  header(p, 2, 3, false, 0x12345678);
  assert(p[0] == 1 && p[1] == 2 && p[2] == 3 && p[3] == 0);
  assert(p[4] == 0x78 && p[5] == 0x56 && p[6] == 0x34 && p[7] == 0x12);
  for (int i = 8; i < 20; ++i) assert(p[i] == 0);
  put16(p + 8, static_cast<uint16_t>(-1500));
  assert(p[8] == 0x24 && p[9] == 0xfa);
  put32(p + 12, 25000);
  assert(p[12] == 0xa8 && p[13] == 0x61 && p[14] == 0 && p[15] == 0);
}
