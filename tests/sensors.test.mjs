import test from 'node:test';
import assert from 'node:assert/strict';
import { SENSORS, sensorKey, readingStatus } from '../mobile/sensors.mjs';
test('all six configured sensors have unique keys', () => {
  assert.equal(new Set(SENSORS.map(sensorKey)).size, 6);
});
test('staleness rejects invalid readings and marks old readings stale', () => {
  assert.equal(readingStatus(null, 2000), 'Waiting');
  assert.equal(readingStatus({type: 1, valid: false, receivedAt: 1000}, 2000), 'Invalid');
  assert.equal(readingStatus({type: 1, valid: true, receivedAt: 1000}, 2600), 'Stale');
  assert.equal(readingStatus({type: 2, valid: true, receivedAt: 1000}, 2400), 'Live');
  assert.equal(readingStatus({type: 2, valid: true, receivedAt: 1000}, 2501), 'Stale');
});
