#pragma once
#include <cmath>
#include <stdint.h>

// Relative 3-D rotation from a straight, aligned starting pose. This is an
// estimate, not an anatomical hinge angle: forearm twist contributes and gyro
// integration drifts. Reset in the straight pose to recalibrate.
class ElbowEstimator {
 public:
  bool ready = false;
  bool lostTracking = false;
  float angleDegrees = NAN;

  void update(bool valid, const float acceleration[2][3],
              const float gyro[2][3], uint32_t now) {
    const float dt = started ? static_cast<uint32_t>(now - lastMs) / 1000.0f : 0;
    lastMs = now;
    started = true;
    if (lostTracking) return;
    if (!valid || dt > 0.1f) {
      if (ready) { lostTracking = true; ready = false; }
      elapsed = 0;
      for (auto &row : bias) for (float &v : row) v = 0;
      angleDegrees = NAN;
      return;
    }
    if (!ready) {
      bool still = true;
      for (int s = 0; s < 2; ++s) {
        float a2 = 0, g2 = 0;
        for (int j = 0; j < 3; ++j) {
          a2 += acceleration[s][j] * acceleration[s][j];
          g2 += gyro[s][j] * gyro[s][j];
        }
        still = still && std::isfinite(a2) && std::isfinite(g2) &&
            a2 > 9.3f * 9.3f && a2 < 10.3f * 10.3f && g2 < 0.08f * 0.08f;
      }
      if (!still) {
        elapsed = 0;
        for (auto &row : bias) for (float &v : row) v = 0;
        return;
      }
      for (int s = 0; s < 2; ++s)
        for (int j = 0; j < 3; ++j) bias[s][j] += gyro[s][j] * dt;
      elapsed += dt;
      if (elapsed >= 2.0f) {
        for (auto &row : bias) for (float &v : row) v /= elapsed;
        ready = true;
        angleDegrees = 0;
      }
      return;
    }
    for (int s = 0; s < 2; ++s) {
      float w[3];
      for (int j = 0; j < 3; ++j) w[j] = gyro[s][j] - bias[s][j];
      const float a = q[s][0], b = q[s][1], c = q[s][2], d = q[s][3];
      q[s][0] += (-b*w[0] - c*w[1] - d*w[2]) * dt * .5f;
      q[s][1] += ( a*w[0] + c*w[2] - d*w[1]) * dt * .5f;
      q[s][2] += ( a*w[1] - b*w[2] + d*w[0]) * dt * .5f;
      q[s][3] += ( a*w[2] + b*w[1] - c*w[0]) * dt * .5f;
      float norm = 0;
      for (float v : q[s]) norm += v*v;
      norm = std::sqrt(norm);
      for (float &v : q[s]) v /= norm;
    }
    float dot = 0;
    for (int j = 0; j < 4; ++j) dot += q[0][j] * q[1][j];
    angleDegrees = 2 * std::acos(std::fmin(1.0f, std::fabs(dot))) * 180.0f / 3.14159265f;
  }
 private:
  float q[2][4] = {{1,0,0,0}, {1,0,0,0}};
  float bias[2][3] = {};
  float elapsed = 0;
  uint32_t lastMs = 0;
  bool started = false;
};
