import test from 'node:test';
import assert from 'node:assert/strict';
import {
  captureNeutralPose,
  elbowBendDegrees,
  gravityDeltaQuaternion,
  hasFreshReading,
  imuElbowDeltaDegrees,
  POSE_SENSOR_MAP,
} from '../mobile/pose.mjs';

const now = 10000;
const imu = (id, accelerationMps2 = [0, 0, 9.81]) => ({
  type: 2, id, valid: true, receivedAt: now, accelerationMps2,
});

test('pose mapping follows the shirt sensor IDs and rig bone names', () => {
  assert.equal(POSE_SENSOR_MAP.leftUpperArm.imu, '2:0');
  assert.equal(POSE_SENSOR_MAP.leftUpperArm.bone, 'mixamorig1LeftArm');
  assert.equal(POSE_SENSOR_MAP.leftForeArm.imu, '2:1');
  assert.equal(POSE_SENSOR_MAP.leftForeArm.bone, 'mixamorig1LeftForeArm');
  assert.equal(POSE_SENSOR_MAP.rightUpperArm.imu, '2:2');
  assert.equal(POSE_SENSOR_MAP.rightUpperArm.bone, 'mixamorig1RightArm');
  assert.equal(POSE_SENSOR_MAP.rightForeArm.imu, '2:3');
  assert.equal(POSE_SENSOR_MAP.rightForeArm.bone, 'mixamorig1RightForeArm');
  assert.equal(POSE_SENSOR_MAP.leftForeArm.flex, '1:0');
  assert.equal(POSE_SENSOR_MAP.rightForeArm.flex, '1:1');
});

test('neutral capture uses only fresh, valid sensor readings', () => {
  const readings = {
    '1:0': { type: 1, id: 0, valid: true, receivedAt: now, resistanceOhms: 28000 },
    '1:1': { type: 1, id: 1, valid: false, receivedAt: now, resistanceOhms: 29000 },
    '2:0': imu(0),
    '2:1': { ...imu(1), receivedAt: now - 2000 },
    '2:2': imu(2, [0, 0, 1]),
  };
  const baseline = captureNeutralPose(readings, now);
  assert.deepEqual(Object.keys(baseline.sensors).sort(), ['1:0', '2:0']);
  assert.equal(baseline.sensors['1:0'].resistanceOhms, 28000);
  assert.equal(captureNeutralPose({}, now), null);
});

test('freshness excludes invalid and stale IMU data', () => {
  assert.equal(hasFreshReading(imu(0), now), true);
  assert.equal(hasFreshReading({ ...imu(0), valid: false }, now), false);
  assert.equal(hasFreshReading({ ...imu(0), receivedAt: now - 1600 }, now), false);
});

test('gravity delta is neutral at rest and rotates as the sensor tilts', () => {
  const neutral = [0, 0, 9.81];
  assert.deepEqual(gravityDeltaQuaternion(imu(0, neutral), neutral, 'left'), [0, 0, 0, 1]);
  const [x, y, z, w] = gravityDeltaQuaternion(imu(0, [9.81, 0, 0]), neutral, 'left');
  assert.ok(Math.abs(x) < 1e-9);
  assert.ok(Math.abs(y - Math.SQRT1_2) < 1e-9);
  assert.ok(Math.abs(z) < 1e-9);
  assert.ok(Math.abs(w - Math.SQRT1_2) < 1e-9);
});

test('right-side mirrored sensor axes map to the same model-space rotation', () => {
  const left = gravityDeltaQuaternion(imu(0, [9.81, 0, 0]), [0, 0, 9.81], 'left');
  const right = gravityDeltaQuaternion(imu(2, [-9.81, 0, 0]), [0, 0, -9.81], 'right');
  assert.ok(left.every((value, index) => Math.abs(value - right[index]) < 1e-9));
});

test('elbow flex maps resistance relative to neutral and remains bounded', () => {
  assert.equal(elbowBendDegrees(25000, 25000), 0);
  assert.equal(elbowBendDegrees(125000, 25000), 110);
  assert.equal(elbowBendDegrees(10000, 25000), 0);
  assert.equal(elbowBendDegrees(150000, 25000), 110);
  assert.equal(elbowBendDegrees(50000, undefined), null);
});

test('IMU elbow fallback is calibrated relative to the neutral pose and bounded', () => {
  const readings = {
    '1:0': {
      type: 1, id: 0, valid: true, source: 'imu_fallback',
      receivedAt: now, angleDegrees: 92,
    },
  };
  const baseline = captureNeutralPose(readings, now);
  assert.equal(baseline.sensors['1:0'].angleDegrees, 92);
  assert.equal(imuElbowDeltaDegrees(92, baseline.sensors['1:0'].angleDegrees), 0);
  assert.equal(imuElbowDeltaDegrees(112, baseline.sensors['1:0'].angleDegrees), 20);
  assert.equal(imuElbowDeltaDegrees(0), -90);
  assert.equal(imuElbowDeltaDegrees(180), 90);
  assert.equal(imuElbowDeltaDegrees(181), null);
});
