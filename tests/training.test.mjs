import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRunPayload, buildTcnWindow} from '../mobile/training.mjs';

const startedAt = '2026-10-17T10:00:00.000Z';
const capturedAt = '2026-10-17T10:00:01.000Z';
const samples = [
  {type: 1, id: 0, deviceMs: 100, valid: true, simulated: false, capturedAt,
    raw: 500, millivolts: 1200, resistanceOhms: 30000},
  {type: 1, id: 1, deviceMs: 150, valid: true, simulated: false, capturedAt,
    raw: 600, millivolts: 1300, resistanceOhms: 32000},
  {type: 2, id: 0, deviceMs: 200, valid: true, simulated: false, capturedAt,
    accelerationMps2: [1, 2, 9.81], gyroRadps: [0.1, 0.2, 0.3]},
  {type: 2, id: 1, deviceMs: 250, valid: true, simulated: false, capturedAt,
    accelerationMps2: [1, 2, 9.81], gyroRadps: [0.1, 0.2, 0.3]},
  {type: 2, id: 2, deviceMs: 300, valid: true, simulated: false, capturedAt,
    accelerationMps2: [1, 2, 9.81], gyroRadps: [0.1, 0.2, 0.3]},
  {type: 2, id: 3, deviceMs: 350, valid: true, simulated: false, capturedAt,
    accelerationMps2: [1, 2, 9.81], gyroRadps: [0.1, 0.2, 0.3]},
];
const run = overrides => ({
  startedAt,
  endedAt: '2026-10-17T10:00:10.000Z',
  source: 'dev_testing',
  label: 'good',
  samples,
  ...overrides,
});

test('accepts valid dev_testing runs with elbow flex and four IMU samples', () => {
  assert.doesNotThrow(() => validateRunPayload(run({label: 'bad'})));
});

test('accepts a user_run with a null label', () => {
  assert.doesNotThrow(() => validateRunPayload(run({source: 'user_run', label: null})));
});

test('rejects a user_run that carries a good/bad label', () => {
  assert.throws(() => validateRunPayload(run({source: 'user_run', label: 'good'})), /cannot be saved with a label/);
});

test('rejects an unknown source', () => {
  assert.throws(() => validateRunPayload(run({source: 'something_else'})), /Dev Testing or a Current Run/);
});

test('rejects empty runs, invalid labels, and reversed timestamps', () => {
  assert.throws(() => validateRunPayload(run({samples: []})), /without sensor samples/);
  assert.throws(() => validateRunPayload(run({label: 'unknown'})), /good or bad/);
  assert.throws(() => validateRunPayload(run({endedAt: '2026-10-17T09:59:59.000Z'})), /before its start/);
});

test('rejects simulated, invalid, malformed, or unknown sensor samples', () => {
  assert.throws(() => validateRunPayload(run({samples: [{...samples[0], simulated: true}]})), /non-simulated/);
  assert.throws(() => validateRunPayload(run({samples: [{...samples[0], valid: false}]})), /valid/);
  assert.throws(() => validateRunPayload(run({samples: [{...samples[2], gyroRadps: [0.1]}]})), /incomplete/);
  assert.throws(() => validateRunPayload(run({samples: [{...samples[2], accelerationMps2: [1, 2, 3, 4], gyroRadps: [0.1, 0.2]}]})), /incomplete/);
  assert.throws(() => validateRunPayload(run({samples: [{...samples[2], id: 4}]})), /unknown sensor/);
  assert.throws(() => validateRunPayload(run({samples: [{...samples[0], type: '1'}]})), /unknown sensor/);
});


test('fallback angles can be stored but never substituted for model resistance', () => {
  const fallback = {...samples[0], source: 'imu_fallback', resistanceOhms: null, angleDegrees: 90};
  assert.doesNotThrow(() => validateRunPayload(run({samples: [fallback]})));
  assert.throws(() => validateRunPayload(run({samples: [{...fallback, resistanceOhms: 90}]})), /fallback/);
  const end = Date.parse(capturedAt) + 3000;
  const history = [];
  for (let time = end - 3000; time <= end; time += 20) {
    for (const sample of samples) history.push({...sample, capturedAt: new Date(time).toISOString()});
  }
  assert.equal(buildTcnWindow(history, end).length, 128);
  const substituted = history.map(s => s.type === 1 && s.id === 0
    ? {...s, source: 'imu_fallback', resistanceOhms: null, angleDegrees: 90} : s);
  assert.equal(buildTcnWindow(substituted, end), null);
});
