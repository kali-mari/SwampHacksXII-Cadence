const SENSOR_LIMITS = {1: 3, 2: 4, 3: 2};
const MAX_SAMPLES = 20000;
const SOURCES = ['dev_testing', 'user_run'];

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
  if (!Array.isArray(payload.samples) || payload.samples.length === 0)
    throw new Error('Cannot save a run without sensor samples.');
  if (payload.samples.length > MAX_SAMPLES)
    throw new Error(`A run can contain at most ${MAX_SAMPLES} samples.`);

  for (const sample of payload.samples) {
    if (!Number.isInteger(sample?.type))
      throw new Error('Run contains an unknown sensor identifier.');
    const sensorLimit = SENSOR_LIMITS[sample?.type];
    if (!sensorLimit || !Number.isInteger(sample.id) || sample.id < 0 || sample.id >= sensorLimit)
      throw new Error('Run contains an unknown sensor identifier.');
    if (!Number.isInteger(sample.deviceMs) || sample.deviceMs < 0 || sample.deviceMs > 0xffffffff)
      throw new Error('Run contains an invalid device timestamp.');
    if (sample.valid !== true || sample.simulated !== false || !isTimestamp(sample.capturedAt))
      throw new Error('Only valid, non-simulated sensor samples can be saved.');

    const values = sample.type === 1
      ? [sample.raw, sample.millivolts, sample.resistanceOhms]
      : sample.type === 2 && Array.isArray(sample.accelerationMps2) && sample.accelerationMps2.length === 3
        && Array.isArray(sample.gyroRadps) && sample.gyroRadps.length === 3
        ? [...sample.accelerationMps2, ...sample.gyroRadps]
        : sample.type === 3
          ? [sample.temperatureC, sample.humidityPct]
          : [];
    const expectedValueCount = sample.type === 1 ? 3 : sample.type === 2 ? 6 : 2;
    if (values.length !== expectedValueCount || !values.every(Number.isFinite))
      throw new Error('Run contains an incomplete or non-numeric sensor reading.');
  }
}
