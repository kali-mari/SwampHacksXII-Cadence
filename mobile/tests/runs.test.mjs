import test from 'node:test';
import assert from 'node:assert/strict';
import {groupRunRows} from '../cloudbackend/runs.mjs';

const baseRow = {
  run_id: 'run-1', started_at: '2026-10-17T10:00:00.000Z', ended_at: '2026-10-17T10:05:00.000Z',
  label: 'good', source: 'dev_testing',
};

test('groups flex, IMU, and environment rows under one run, newest first', () => {
  const rows = [
    {...baseRow, sensor_type: 1, sensor_id: 2, avg_resistance_ohms: '42000.5', avg_millivolts: '900.2'},
    {...baseRow, sensor_type: 2, sensor_id: 0, avg_accel_x: '0.1', avg_accel_y: '0.2', avg_accel_z: '9.8',
      avg_gyro_x: '0.01', avg_gyro_y: '0.02', avg_gyro_z: '0.03'},
    {run_id: 'run-2', started_at: '2026-10-17T11:00:00.000Z', ended_at: '2026-10-17T11:02:00.000Z',
      label: null, source: 'user_run', sensor_type: 3, sensor_id: 1, avg_temperature_c: '24.5', avg_humidity_pct: '48.1'},
  ];
  const runs = groupRunRows(rows);
  assert.equal(runs.length, 2);
  assert.equal(runs[0].runId, 'run-2'); // newest first
  assert.equal(runs[0].label, null);
  assert.deepEqual(runs[0].sensors[0].averages, {temperatureC: 24.5, humidityPct: 48.1});
  const run1 = runs.find(r => r.runId === 'run-1');
  assert.equal(run1.sensors.length, 2);
  const flex = run1.sensors.find(s => s.sensorType === 1);
  assert.deepEqual(flex.averages, {resistanceOhms: 42000.5, millivolts: 900.2});
});

test('returns an empty list for no rows', () => {
  assert.deepEqual(groupRunRows([]), []);
});
