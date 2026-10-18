const SENSOR_LIMITS = {1: 2, 2: 4};
export const MAX_RUN_SAMPLES = 20000;
const SOURCES = ['dev_testing', 'user_run'];
export const MODEL_WINDOW_SIZE = 128;
export const MODEL_SAMPLE_PERIOD_MS = 20;
export const MODEL_FEATURE_NAMES = [
  'flex_left_ohms',
  'flex_right_ohms',
  ...[0, 1, 2, 3].flatMap(id => [
    `imu_${id}_accel_x`, `imu_${id}_accel_y`, `imu_${id}_accel_z`,
    `imu_${id}_gyro_x`, `imu_${id}_gyro_y`, `imu_${id}_gyro_z`,
  ]),
];

function isTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

export function validateRunPayload(payload) {
  if (!payload || !isTimestamp(payload.startedAt) || !isTimestamp(payload.endedAt))
    throw new Error('Run start and end timestamps are required.');
  if (Date.parse(payload.endedAt) < Date.parse(payload.startedAt))
    throw new Error('Run end time cannot be before its start time.');
  if (!SOURCES.includes(payload.source))
    throw new Error('Run must come from Dev Testing or a Current Run.');
  // Dev Testing always has a human-picked label. A Current Run has no label
  // yet — that's filled in later once a trained model can infer it — so null
  // is the only value allowed there.
  if (payload.source === 'dev_testing' && !['good', 'bad'].includes(payload.label))
    throw new Error('Choose a good or bad label for the run.');
  if (payload.source === 'user_run' && payload.label !== null && payload.label !== undefined)
    throw new Error('A Current Run cannot be saved with a label yet.');

  validateSamples(payload.samples);
}

export function validateSamples(samples) {
  if (!Array.isArray(samples) || samples.length === 0)
    throw new Error('Cannot save a run without sensor samples.');
  if (samples.length > MAX_RUN_SAMPLES)
    throw new Error(`A run can contain at most ${MAX_RUN_SAMPLES} samples.`);

  for (const sample of samples) {
    if (!Number.isInteger(sample?.type))
      throw new Error('Run contains an unknown sensor identifier.');
    const sensorLimit = SENSOR_LIMITS[sample?.type];
    if (!sensorLimit || !Number.isInteger(sample.id) || sample.id < 0 || sample.id >= sensorLimit)
      throw new Error('Run contains an unknown sensor identifier.');
    if (!Number.isInteger(sample.deviceMs) || sample.deviceMs < 0 || sample.deviceMs > 0xffffffff)
      throw new Error('Run contains an invalid device timestamp.');
    if (sample.valid !== true || sample.simulated !== false || !isTimestamp(sample.capturedAt))
      throw new Error('Only valid, non-simulated sensor samples can be saved.');

    if (sample.source === 'imu_fallback') {
      if (sample.type !== 1 || sample.resistanceOhms !== null ||
          !Number.isFinite(sample.angleDegrees) || sample.angleDegrees < 0 || sample.angleDegrees > 180)
        throw new Error('Invalid IMU fallback angle.');
      continue;
    }
    const values = sample.type === 1
      ? [sample.raw, sample.millivolts, sample.resistanceOhms]
      : sample.type === 2 && Array.isArray(sample.accelerationMps2) && sample.accelerationMps2.length === 3
        && Array.isArray(sample.gyroRadps) && sample.gyroRadps.length === 3
        ? [...sample.accelerationMps2, ...sample.gyroRadps]
        : [];
    const expectedValueCount = sample.type === 1 ? 3 : 6;
    if (values.length !== expectedValueCount || !values.every(Number.isFinite))
      throw new Error('Run contains an incomplete or non-numeric sensor reading.');
  }
}

function featureValues(sample) {
  if (sample.source === 'imu_fallback') return null;
  if (sample.type === 1 && sample.id <= 1) return [sample.resistanceOhms];
  if (sample.type === 2 && sample.id <= 3 &&
      Array.isArray(sample.accelerationMps2) && sample.accelerationMps2.length === 3 &&
      Array.isArray(sample.gyroRadps) && sample.gyroRadps.length === 3) {
    return [...sample.accelerationMps2, ...sample.gyroRadps];
  }
  return null;
}

export function buildTcnWindow(samples, now = Date.now()) {
  const streams = Array.from({length: 6}, () => []);
  for (const sample of samples) {
    if (sample?.valid !== true || sample.simulated !== false) continue;
    const capturedAt = Date.parse(sample.capturedAt);
    const values = featureValues(sample);
    if (!Number.isFinite(capturedAt) || capturedAt > now || !values?.every(Number.isFinite)) continue;
    const streamIndex = sample.type === 1 ? sample.id : 2 + sample.id;
    streams[streamIndex].push({capturedAt, values});
  }
  if (streams.some(stream => stream.length === 0)) return null;
  for (const stream of streams) stream.sort((a, b) => a.capturedAt - b.capturedAt);

  const endAt = Math.floor(now / MODEL_SAMPLE_PERIOD_MS) * MODEL_SAMPLE_PERIOD_MS;
  const startAt = endAt - (MODEL_WINDOW_SIZE - 1) * MODEL_SAMPLE_PERIOD_MS;
  const indices = Array(streams.length).fill(0);
  const frames = [];
  for (let frameIndex = 0; frameIndex < MODEL_WINDOW_SIZE; frameIndex++) {
    const targetAt = startAt + frameIndex * MODEL_SAMPLE_PERIOD_MS;
    const frame = [];
    for (let streamIndex = 0; streamIndex < streams.length; streamIndex++) {
      const stream = streams[streamIndex];
      while (indices[streamIndex] + 1 < stream.length &&
          stream[indices[streamIndex] + 1].capturedAt <= targetAt) indices[streamIndex]++;
      const current = stream[indices[streamIndex]];
      if (current.capturedAt > targetAt || targetAt - current.capturedAt > 100) return null;
      frame.push(...current.values);
    }
    if (frame.length !== MODEL_FEATURE_NAMES.length) return null;
    frames.push(frame);
  }
  return frames;
}
