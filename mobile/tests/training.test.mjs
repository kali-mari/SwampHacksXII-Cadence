import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTcnWindow, MODEL_FEATURE_NAMES, MODEL_WINDOW_SIZE, validateRunPayload} from '../mobile/training.mjs';

const startedAt = '2026-10-17T10:00:00.000Z';
const capturedAt = '2026-10-17T10:00:01.000Z';
const samples = [
  {type: 1, id: 0, deviceMs: 100, valid: true, simulated: false, capturedAt,
    raw: 500, millivolts: 1200, resistanceOhms: 30000},
  {type: 2, id: 0, deviceMs: 200, valid: true, simulated: false, capturedAt,
    accelerationMps2: [1, 2, 9.81], gyroRadps: [0.1, 0.2, 0.3]},
  {type: 1, id: 1, deviceMs: 400, valid: true, simulated: false, capturedAt,
    raw: 520, millivolts: 1100, resistanceOhms: 35000},
  ...[1, 2, 3].map(id => ({type: 2, id, deviceMs: 500 + id, valid: true, simulated: false, capturedAt,
    accelerationMps2: [1, 2, 9.81], gyroRadps: [0.1, 0.2, 0.3]})),
];
const run = overrides => ({
  startedAt,
  endedAt: '2026-10-17T10:00:10.000Z',
  source: 'dev_testing',
  label: 'good',
  samples,
  ...overrides,
});

test('accepts valid dev_testing runs and decoded elbow flex and IMU samples', () => {
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
  assert.throws(() => validateRunPayload(run({samples: [{...samples[1], gyroRadps: [0.1]}]})), /incomplete/);
  assert.throws(() => validateRunPayload(run({samples: [{...samples[1], accelerationMps2: [1, 2, 3, 4], gyroRadps: [0.1, 0.2]}]})), /incomplete/);
  assert.throws(() => validateRunPayload(run({samples: [{...samples[0], id: 2}]})), /unknown sensor/);
  assert.throws(() => validateRunPayload(run({samples: [{...samples[0], type: '1'}]})), /unknown sensor/);
});

test('builds a 128-frame TCN window in the documented six-sensor channel order', () => {
  const start = Date.parse(capturedAt);
  const modelSamples = [];
  for (let frame = 0; frame < MODEL_WINDOW_SIZE; frame++) {
    const timestamp = new Date(start + frame * 20).toISOString();
    modelSamples.push(
      {type: 1, id: 0, valid: true, simulated: false, capturedAt: timestamp, resistanceOhms: 30000 + frame},
      {type: 1, id: 1, valid: true, simulated: false, capturedAt: timestamp, resistanceOhms: 40000 + frame},
      ...[0, 1, 2, 3].map(id => ({type: 2, id, valid: true, simulated: false, capturedAt: timestamp,
        accelerationMps2: [id + 1, id + 2, id + 3], gyroRadps: [id + 0.1, id + 0.2, id + 0.3]})),
    );
  }

  const window = buildTcnWindow(modelSamples, start + (MODEL_WINDOW_SIZE - 1) * 20);

  assert.equal(window.length, 128);
  assert.equal(window[0].length, MODEL_FEATURE_NAMES.length);
  assert.equal(MODEL_FEATURE_NAMES.length, 26);
  assert.equal(window[127][0], 30127);
  assert.equal(window[127][1], 40127);
  assert.equal(window[127][2], 1);
  assert.equal(window[127][8], 2);
});

test('does not construct a TCN window without six fresh sensor streams', () => {
  const at = Date.parse(capturedAt);
  const incomplete = samples.filter(sample => !(sample.type === 1 && sample.id === 1));
  assert.equal(buildTcnWindow(incomplete, at), null);
});
