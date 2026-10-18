#include "../esp32/elbow_estimator.h"
#include <cassert>
int main() {
  ElbowEstimator e;
  float a[2][3] = {{0,0,9.81f},{0,0,9.81f}}, g[2][3] = {};
  uint32_t t = 0;
  for (int i=0; i<110; ++i) { e.update(true,a,g,t); t+=20; }
  assert(e.ready && e.angleDegrees == 0);
  g[1][0] = 3.14159265f/2;
  for (int i=0; i<50; ++i) {e.update(true,a,g,t); t+=20;}
  assert(std::fabs(e.angleDegrees-90) < .1f);
  e.update(false,a,g,t);
  assert(!e.ready && e.lostTracking && std::isnan(e.angleDegrees));
  e.update(true,a,g,t+20);
  assert(!e.ready);
  ElbowEstimator common;
  g[0][0]=g[1][0]=0;
  t=0;
  for (int i=0; i<110; ++i) {common.update(true,a,g,t); t+=20;}
  g[0][0]=g[1][0]=1;
  for (int i=0; i<100; ++i) {common.update(true,a,g,t);t+=20;}
  assert(common.angleDegrees < .1f);
  ElbowEstimator moving;
  for(int i=0;i<200;++i) moving.update(true,a,g,i*20);
  assert(!moving.ready);
}
