const num = v => v === null || v === undefined ? undefined : Number(v);

function averagesFor(row) {
  if (row.sensor_type === 1) return { resistanceOhms: num(row.avg_resistance_ohms), millivolts: num(row.avg_millivolts) };
  if (row.sensor_type === 2) return {
    accelX: num(row.avg_accel_x), accelY: num(row.avg_accel_y), accelZ: num(row.avg_accel_z),
    gyroX: num(row.avg_gyro_x), gyroY: num(row.avg_gyro_y), gyroZ: num(row.avg_gyro_z),
  };
  return {};
}

// rows: one row per (run, sensor_type, sensor_id), as produced by the
// GROUP BY query in server.mjs. Returns runs newest-first, each with its
// per-sensor averages nested underneath.
export function groupRunRows(rows) {
  const byRun = new Map();
  for (const row of rows) {
    if (!byRun.has(row.run_id)) {
      byRun.set(row.run_id, {
        runId: row.run_id,
        startedAt: row.started_at instanceof Date ? row.started_at.toISOString() : row.started_at,
        endedAt: row.ended_at instanceof Date ? row.ended_at.toISOString() : row.ended_at,
        label: row.label,
        source: row.source,
        sensors: [],
      });
    }
    byRun.get(row.run_id).sensors.push({
      sensorType: row.sensor_type,
      sensorId: row.sensor_id,
      averages: averagesFor(row),
    });
  }
  return [...byRun.values()].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
}
