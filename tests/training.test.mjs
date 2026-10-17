import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRunPayload} from '../mobile/training.mjs';

const startedAt = '2026-10-17T10:00:00.000Z';
const capturedAt = '2026-10-17T10:00:01.000Z';
const samples = [
  {type: 1, id: 0, deviceMs: 100, valid: true, simulated: false, capturedAt,
    raw: 500, millivolts: 1200, resistanceOhms: 30000},
  {type: 2, id: 0, deviceMs: 200, valid: true, simulated: false, capturedAt,
    accelerationMps2: [1, 2, 9.81], gyroRadps: [0.1, 0.2, 0.3]},
  {type: 3, id: 0, deviceMs: 300, valid: true, simulated: false, capturedAt,
    temperatureC: 31, humidityPct: 65},
];
const run = overrides => ({
  startedAt,
  endedAt: '2026-10-17T10:00:10.000Z',
  label: 'good',
  samples,
  ...overrides,
});

test('accepts valid run labels and decoded flex, IMU, and environment samples', () => {
  assert.doesNotThrow(() => validateRunPayload(run({label: 'bad'})));
});

test('rejects empty runs, invalid labels, and reversed timestamps', () => {
  assert.throws(() => validateRunPayload(run({samples: []})), /without sensor samples/);
  assert.throws(() => validateRunPayload(run({label: 'unknown'})), /good or bad/);
  assert.throws(() => validateRunPayload(run({endedAt: '2026-10-17T09:59:59.000Z'})), /before its start/);
});

test('rejects simulated, invalid, malformed, or unknown sensor samples', () => {
  assert.throws(() => validateRunPayload(run({samples: [{...samples[0], simulated: true}]})), /non-simulated/);
  assert.throws(() => validateRunPayload(run({samples: [{...samples[0], valid: false}]})), /valid/);
  assert.throws(() => validateRunPayload(run({samples: [{...samples[1], gyroRadps: [0.1]}]})), /incomplete/);
  assert.throws(() => validateRunPayload(run({samples: [{...samples[1], accelerationMps2: [1, 2, 3, 4], gyroRadps: [0.1, 0.2]}]})), /incomplete/);
  assert.throws(() => validateRunPayload(run({samples: [{...samples[2], id: 2}]})), /unknown sensor/);
  assert.throws(() => validateRunPayload(run({samples: [{...samples[0], type: '1'}]})), /unknown sensor/);
});
