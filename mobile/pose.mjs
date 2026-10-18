export const POSE_SENSOR_MAP = {
  leftUpperArm: { imu: '2:0', bone: 'mixamorig1LeftArm', side: 'left' },
  leftForeArm: { imu: '2:1', flex: '1:0', bone: 'mixamorig1LeftForeArm', side: 'left' },
  rightUpperArm: { imu: '2:2', bone: 'mixamorig1RightArm', side: 'right' },
  rightForeArm: { imu: '2:3', flex: '1:1', bone: 'mixamorig1RightForeArm', side: 'right' },
};

const MAX_READING_AGE_MS = 1500;
const MIN_GRAVITY_MPS2 = 6;
const MAX_GRAVITY_MPS2 = 15;
const FLEX_FULL_BEND_OHMS = 125000;
const FLEX_MAX_BEND_DEGREES = 110;
const DEFAULT_ELBOW_BEND_DEGREES = 90;

export function hasFreshReading(reading, now, maxAge = MAX_READING_AGE_MS) {
  return reading?.valid === true &&
    Number.isFinite(reading.receivedAt) &&
    now >= reading.receivedAt &&
    now - reading.receivedAt <= maxAge;
}

function usableAcceleration(reading) {
  const acceleration = reading?.accelerationMps2;
  if (!Array.isArray(acceleration) || acceleration.length !== 3 ||
      !acceleration.every(Number.isFinite)) return false;
  const magnitude = Math.hypot(...acceleration);
  return magnitude >= MIN_GRAVITY_MPS2 && magnitude <= MAX_GRAVITY_MPS2;
}

export function captureNeutralPose(readings, now) {
  const sensors = {};
  for (let type = 1; type <= 2; type++) {
    const limit = type === 1 ? 2 : 4;
    for (let id = 0; id < limit; id++) {
      const key = `${type}:${id}`;
      const reading = readings[key];
      if (!hasFreshReading(reading, now)) continue;
      if (type === 1 && reading.source === 'imu_fallback' &&
          Number.isFinite(reading.angleDegrees) &&
          reading.angleDegrees >= 0 && reading.angleDegrees <= 180) {
        sensors[key] = { angleDegrees: reading.angleDegrees };
      } else if (type === 1 && Number.isFinite(reading.resistanceOhms)) {
        sensors[key] = { resistanceOhms: reading.resistanceOhms };
      } else if (type === 2 && usableAcceleration(reading)) {
        sensors[key] = { accelerationMps2: [...reading.accelerationMps2] };
      }
    }
  }
  return Object.keys(sensors).length
    ? { capturedAt: new Date(now).toISOString(), sensors }
    : null;
}

function toRigAxes(vector, side) {
  const [x, y, z] = vector;
  // The right-side sensors are mounted as the mirror of the left-side sensors
  // in the placement diagram (their outward X and corresponding Z axes flip).
  return side === 'right' ? [-x, y, -z] : [x, y, z];
}

function normalize(vector) {
  const length = Math.hypot(...vector);
  if (!Number.isFinite(length) || length < 1e-6) return null;
  return vector.map(value => value / length);
}

function quaternionBetween(from, to) {
  const dot = Math.max(-1, Math.min(1,
    from[0] * to[0] + from[1] * to[1] + from[2] * to[2]));
  if (dot < -0.999999) {
    const axis = Math.abs(from[0]) < 0.8
      ? [0, -from[2], from[1]]
      : [-from[1], from[0], 0];
    const normalizedAxis = normalize(axis);
    return [...normalizedAxis, 0];
  }
  const cross = [
    from[1] * to[2] - from[2] * to[1],
    from[2] * to[0] - from[0] * to[2],
    from[0] * to[1] - from[1] * to[0],
  ];
  const quaternion = [...cross, 1 + dot];
  const length = Math.hypot(...quaternion);
  return quaternion.map(value => value / length);
}

export function gravityDeltaQuaternion(current, neutral, side) {
  if (!usableAcceleration(current) || !Array.isArray(neutral) ||
      neutral.length !== 3 || !neutral.every(Number.isFinite)) return null;
  const from = normalize(toRigAxes(neutral, side));
  const to = normalize(toRigAxes(current.accelerationMps2, side));
  return from && to ? quaternionBetween(from, to) : null;
}

export function elbowBendDegrees(resistanceOhms, neutralOhms) {
  if (!Number.isFinite(resistanceOhms) || !Number.isFinite(neutralOhms)) return null;
  const span = Math.max(1000, FLEX_FULL_BEND_OHMS - neutralOhms);
  const bend = ((resistanceOhms - neutralOhms) / span) * FLEX_MAX_BEND_DEGREES;
  return Math.max(0, Math.min(FLEX_MAX_BEND_DEGREES, bend));
}

export function imuElbowDeltaDegrees(angleDegrees, neutralAngleDegrees = DEFAULT_ELBOW_BEND_DEGREES) {
  if (!Number.isFinite(angleDegrees) || angleDegrees < 0 || angleDegrees > 180 ||
      !Number.isFinite(neutralAngleDegrees) || neutralAngleDegrees < 0 || neutralAngleDegrees > 180) {
    return null;
  }
  return Math.max(
    -FLEX_MAX_BEND_DEGREES,
    Math.min(FLEX_MAX_BEND_DEGREES, angleDegrees - neutralAngleDegrees),
  );
}
