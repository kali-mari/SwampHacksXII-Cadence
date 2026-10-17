import test from 'node:test';
import assert from 'node:assert/strict';
import { SENSORS, sensorKey, readingStatus, demoReadings } from '../mobile/sensors.mjs';
test('all nine configured sensors have unique keys and demo readings', () => {
  assert.equal(new Set(SENSORS.map(sensorKey)).size, 9);
  assert.deepEqual(demoReadings(1000).map(sensorKey), SENSORS.map(sensorKey));
  for (const r of demoReadings(1000)) assert.equal(r.valid, true);
});
test('staleness uses humidity-specific cadence and rejects invalid readings', () => {
  assert.equal(readingStatus(null, 2000), 'Waiting');
  assert.equal(readingStatus({type: 1, valid: false, receivedAt: 1000}, 2000), 'Invalid');
  assert.equal(readingStatus({type: 1, valid: true, receivedAt: 1000}, 2600), 'Stale');
  assert.equal(readingStatus({type: 3, valid: true, receivedAt: 1000}, 2600), 'Live');
  assert.equal(readingStatus({type: 3, valid: true, receivedAt: 1000}, 4600), 'Stale');
});
