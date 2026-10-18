import {createServer} from 'node:http';
import {createHash, randomUUID, timingSafeEqual} from 'node:crypto';
import pg from 'pg';
import {UPLOAD_BATCH_SIZE} from '../mobile/cloudCapture.mjs';
import {MAX_RUN_SAMPLES, validateRunPayload, validateSamples} from '../mobile/training.mjs';
import {groupRunRows} from './runs.mjs';

const {Pool} = pg;
const port = Number(process.env.PORT || 3000);
const collectorApiKey = required('COLLECTOR_API_KEY');
const sslMode = process.env.DB_SSLMODE || 'verify-full';
if (!['require', 'verify-full'].includes(sslMode))
  throw new Error('DB_SSLMODE must be either require or verify-full.');
const pool = new Pool({
  host: required('DB_HOST'),
  port: Number(process.env.DB_PORT || 5432),
  database: required('DB_NAME'),
  user: required('DB_USER'),
  password: required('DB_PASSWORD'),
  // Tiger Cloud connection strings use sslmode=require; TLS stays enabled,
  // but Node cannot validate Tiger's private self-signed CA by default.
  ssl: {rejectUnauthorized: sslMode !== 'require'},
  max: 5,
});

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 8 * 1024 * 1024) throw new HttpError(413, 'Request body exceeds 8 MB.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.');
  }
}

function validateCaptureStart(payload) {
  if (!payload || typeof payload.captureId !== 'string' ||
      !/^[A-Za-z0-9_-]{8,128}$/.test(payload.captureId))
    throw new HttpError(400, 'A valid capture identifier is required.');
  if (typeof payload.startedAt !== 'string' || !Number.isFinite(Date.parse(payload.startedAt)))
    throw new HttpError(400, 'A valid run start timestamp is required.');
  if (!['dev_testing', 'user_run'].includes(payload.source))
    throw new HttpError(400, 'Run must come from Dev Testing or a Current Run.');
}

function validateCaptureFinalization(payload) {
  if (!payload || typeof payload.endedAt !== 'string' || !Number.isFinite(Date.parse(payload.endedAt)))
    throw new HttpError(400, 'A valid run end timestamp is required.');
  if (!['dev_testing', 'user_run'].includes(payload.source))
    throw new HttpError(400, 'Run must come from Dev Testing or a Current Run.');
  if (payload.source === 'dev_testing' && !['good', 'bad'].includes(payload.label))
    throw new HttpError(400, 'Choose a good or bad label for the run.');
  if (payload.source === 'user_run' && payload.label !== null && payload.label !== undefined)
    throw new HttpError(400, 'A Current Run cannot be saved with a label yet.');
}

async function insertSamples(client, runId, samples) {
  for (let offset = 0; offset < samples.length; offset += 500) {
    const batch = samples.slice(offset, offset + 500);
    const values = [];
    const rows = batch.map((sample, index) => {
      const parameter = index * 5;
      const {capturedAt, ...reading} = sample;
      values.push(runId, capturedAt, sample.type, sample.id, JSON.stringify(reading));
      return `($${parameter + 1}, $${parameter + 2}, $${parameter + 3}, $${parameter + 4}, $${parameter + 5}::jsonb)`;
    });
    await client.query(
      `INSERT INTO training_samples (run_id, captured_at, sensor_type, sensor_id, reading)
       VALUES ${rows.join(', ')}`,
      values,
    );
  }
}

async function startCloudRun(payload) {
  validateCaptureStart(payload);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let {rows} = await client.query(
      `INSERT INTO training_runs
         (run_id, started_at, ended_at, label, source, sample_count, status, client_capture_id)
       VALUES ($1, $2, NULL, NULL, $3, 0, 'collecting', $4)
       ON CONFLICT (client_capture_id) DO NOTHING
       RETURNING run_id, started_at, source, status`,
      [randomUUID(), payload.startedAt, payload.source, payload.captureId],
    );
    if (!rows.length) {
      ({rows} = await client.query(
        `SELECT run_id, started_at, source, status
         FROM training_runs WHERE client_capture_id = $1 FOR UPDATE`,
        [payload.captureId],
      ));
      const existing = rows[0];
      if (!existing || existing.source !== payload.source ||
          new Date(existing.started_at).getTime() !== Date.parse(payload.startedAt) ||
          existing.status !== 'collecting')
        throw new HttpError(409, 'This cloud capture identifier is already in use.');
    }
    await client.query('COMMIT');
    return {runId: rows[0].run_id, startedAt: rows[0].started_at};
  } catch (error) {
    await client.query('ROLLBACK').catch(rollbackError => {
      console.error('Failed to roll back cloud capture start:', rollbackError.message);
    });
    throw error;
  } finally {
    client.release();
  }
}

async function appendCloudSamples(runId, payload) {
  if (!payload || !Number.isSafeInteger(payload.batchIndex) || payload.batchIndex < 0)
    throw new HttpError(400, 'A non-negative sample batch index is required.');
  try {
    validateSamples(payload.samples);
  } catch (error) {
    throw new HttpError(400, error.message);
  }
  if (payload.samples.length > UPLOAD_BATCH_SIZE)
    throw new HttpError(400, `A sample batch can contain at most ${UPLOAD_BATCH_SIZE} samples.`);

  const payloadHash = createHash('sha256').update(JSON.stringify(payload.samples)).digest('hex');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const {rows: runRows} = await client.query(
      'SELECT status, sample_count FROM training_runs WHERE run_id = $1 FOR UPDATE',
      [runId],
    );
    if (!runRows.length) throw new HttpError(404, 'Cloud capture not found.');
    if (runRows[0].status !== 'collecting')
      throw new HttpError(409, 'This cloud capture is no longer accepting samples.');
    if (runRows[0].sample_count + payload.samples.length > MAX_RUN_SAMPLES)
      throw new HttpError(400, `A run can contain at most ${MAX_RUN_SAMPLES} samples.`);

    const {rows: existingRows} = await client.query(
      `SELECT payload_hash, sample_count FROM training_run_batches
       WHERE run_id = $1 AND batch_index = $2`,
      [runId, payload.batchIndex],
    );
    if (existingRows.length) {
      const existing = existingRows[0];
      if (existing.payload_hash !== payloadHash || existing.sample_count !== payload.samples.length)
        throw new HttpError(409, 'The sample batch index was already used for different data.');
      await client.query('COMMIT');
      return {runId, batchIndex: payload.batchIndex, sampleCount: payload.samples.length, duplicate: true};
    }

    const {rows: indexRows} = await client.query(
      `SELECT COALESCE(MAX(batch_index), -1) AS last_batch_index
       FROM training_run_batches WHERE run_id = $1`,
      [runId],
    );
    if (payload.batchIndex !== Number(indexRows[0].last_batch_index) + 1)
      throw new HttpError(409, 'Sample batches must be uploaded in order.');

    await insertSamples(client, runId, payload.samples);
    await client.query(
      `INSERT INTO training_run_batches (run_id, batch_index, payload_hash, sample_count)
       VALUES ($1, $2, $3, $4)`,
      [runId, payload.batchIndex, payloadHash, payload.samples.length],
    );
    await client.query(
      'UPDATE training_runs SET sample_count = sample_count + $2 WHERE run_id = $1',
      [runId, payload.samples.length],
    );
    await client.query('COMMIT');
    return {runId, batchIndex: payload.batchIndex, sampleCount: payload.samples.length, duplicate: false};
  } catch (error) {
    await client.query('ROLLBACK').catch(rollbackError => {
      console.error('Failed to roll back cloud sample batch:', rollbackError.message);
    });
    throw error;
  } finally {
    client.release();
  }
}

async function finalizeCloudRun(runId, payload) {
  validateCaptureFinalization(payload);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const {rows} = await client.query(
      `SELECT started_at, ended_at, label, source, sample_count, status
       FROM training_runs WHERE run_id = $1 FOR UPDATE`,
      [runId],
    );
    if (!rows.length) throw new HttpError(404, 'Cloud capture not found.');
    const run = rows[0];
    if (run.source !== payload.source)
      throw new HttpError(400, 'The saved run type does not match its cloud capture.');
    if (Date.parse(payload.endedAt) < new Date(run.started_at).getTime())
      throw new HttpError(400, 'Run end time cannot be before its start time.');
    if (run.status === 'complete') {
      const sameCompletion = new Date(run.ended_at).getTime() === Date.parse(payload.endedAt) &&
        run.label === (payload.label ?? null);
      if (!sameCompletion) throw new HttpError(409, 'This cloud capture has already been saved.');
      await client.query('COMMIT');
      return {runId, sampleCount: run.sample_count};
    }
    if (run.status !== 'collecting')
      throw new HttpError(409, 'This cloud capture cannot be finalized.');

    const {rows: countRows} = await client.query(
      'SELECT COUNT(*)::integer AS sample_count FROM training_samples WHERE run_id = $1',
      [runId],
    );
    const sampleCount = countRows[0].sample_count;
    if (sampleCount === 0 || sampleCount !== run.sample_count)
      throw new HttpError(409, 'The cloud capture has no complete sample set to save.');

    await client.query(
      `UPDATE training_runs
       SET ended_at = $2, label = $3, status = 'complete'
       WHERE run_id = $1`,
      [runId, payload.endedAt, payload.label ?? null],
    );
    await client.query('COMMIT');
    return {runId, sampleCount};
  } catch (error) {
    await client.query('ROLLBACK').catch(rollbackError => {
      console.error('Failed to roll back cloud capture finalization:', rollbackError.message);
    });
    throw error;
  } finally {
    client.release();
  }
}

async function discardCloudRun(runId) {
  const {rows} = await pool.query(
    `DELETE FROM training_runs
     WHERE run_id = $1 AND status = 'collecting'
     RETURNING run_id`,
    [runId],
  );
  if (!rows.length) {
    const {rows: existingRows} = await pool.query(
      'SELECT status FROM training_runs WHERE run_id = $1',
      [runId],
    );
    if (existingRows.length) throw new HttpError(409, 'A saved run cannot be discarded.');
  }
  return {deleted: true};
}

async function saveRun(payload) {
  try {
    validateRunPayload(payload);
  } catch (error) {
    throw new HttpError(400, error.message);
  }

  const runId = randomUUID();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO training_runs (run_id, started_at, ended_at, label, source, sample_count)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [runId, payload.startedAt, payload.endedAt, payload.label ?? null, payload.source, payload.samples.length],
    );

    await insertSamples(client, runId, payload.samples);

    await client.query('COMMIT');
    return {runId, sampleCount: payload.samples.length};
  } catch (error) {
    await client.query('ROLLBACK').catch(rollbackError => {
      console.error('Failed to roll back training run:', rollbackError.message);
    });
    throw error;
  } finally {
    client.release();
  }
}

// Powers the See Past Runs screen: one row per (run, sensor), each with that
// sensor's averages over every sample in the run. Aggregating in SQL keeps
// this cheap even for long runs, instead of pulling every raw sample back.
async function listRuns() {
  const {rows} = await pool.query(`
    SELECT
      r.run_id, r.started_at, r.ended_at, r.label, r.source,
      s.sensor_type, s.sensor_id,
      AVG((s.reading->>'resistanceOhms')::numeric) AS avg_resistance_ohms,
      AVG((s.reading->>'millivolts')::numeric) AS avg_millivolts,
      AVG((s.reading->>'temperatureC')::numeric) AS avg_temperature_c,
      AVG((s.reading->>'humidityPct')::numeric) AS avg_humidity_pct,
      AVG((s.reading->'accelerationMps2'->>0)::numeric) AS avg_accel_x,
      AVG((s.reading->'accelerationMps2'->>1)::numeric) AS avg_accel_y,
      AVG((s.reading->'accelerationMps2'->>2)::numeric) AS avg_accel_z,
      AVG((s.reading->'gyroRadps'->>0)::numeric) AS avg_gyro_x,
      AVG((s.reading->'gyroRadps'->>1)::numeric) AS avg_gyro_y,
      AVG((s.reading->'gyroRadps'->>2)::numeric) AS avg_gyro_z
    FROM training_runs r
    JOIN training_samples s ON s.run_id = r.run_id
    WHERE r.status = 'complete'
    GROUP BY r.run_id, r.started_at, r.ended_at, r.label, r.source, s.sensor_type, s.sensor_id
    ORDER BY r.started_at DESC
    LIMIT 2000
  `);
  return groupRunRows(rows).slice(0, 100);
}

function checkAuth(request) {
  const authorization = request.headers.authorization || '';
  const providedKey = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const providedBuffer = Buffer.from(providedKey);
  const expectedBuffer = Buffer.from(collectorApiKey);
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer))
    throw new HttpError(401, 'A valid collector token is required.');
}

async function handle(request, response) {
  try {
    if (request.method === 'GET' && request.url === '/health') {
      const {rows} = await pool.query(`
        SELECT to_regclass('public.training_run_batches') IS NOT NULL AS has_batches,
          EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'training_runs'
              AND column_name = 'status'
          ) AS has_run_status
      `);
      if (!rows[0].has_batches || !rows[0].has_run_status)
        throw new HttpError(503, 'Apply database/0004_streamed_captures.sql before collecting data.');
      await pool.query('SELECT 1');
      response.writeHead(200, {'Content-Type': 'application/json'});
      response.end(JSON.stringify({status: 'ok'}));
      return;
    }
    if (request.method === 'POST' && request.url === '/api/runs/start') {
      checkAuth(request);
      const result = await startCloudRun(await readJson(request));
      response.writeHead(201, {'Content-Type': 'application/json'});
      response.end(JSON.stringify(result));
      return;
    }
    const captureRoute = /^\/api\/runs\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/(samples|finalize)$/i.exec(request.url);
    if (request.method === 'POST' && captureRoute) {
      checkAuth(request);
      const payload = await readJson(request);
      const result = captureRoute[2] === 'samples'
        ? await appendCloudSamples(captureRoute[1], payload)
        : await finalizeCloudRun(captureRoute[1], payload);
      response.writeHead(200, {'Content-Type': 'application/json'});
      response.end(JSON.stringify(result));
      return;
    }
    const discardRoute = /^\/api\/runs\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(request.url);
    if (request.method === 'DELETE' && discardRoute) {
      checkAuth(request);
      const result = await discardCloudRun(discardRoute[1]);
      response.writeHead(200, {'Content-Type': 'application/json'});
      response.end(JSON.stringify(result));
      return;
    }
    if (request.method === 'POST' && request.url === '/api/runs') {
      checkAuth(request);
      const result = await saveRun(await readJson(request));
      response.writeHead(201, {'Content-Type': 'application/json'});
      response.end(JSON.stringify(result));
      return;
    }
    if (request.method === 'GET' && request.url === '/api/runs') {
      checkAuth(request);
      const runs = await listRuns();
      response.writeHead(200, {'Content-Type': 'application/json'});
      response.end(JSON.stringify({runs}));
      return;
    }
    throw new HttpError(404, 'Not found.');
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    if (status === 500) console.error('Cloud API request failed:', error.message);
    response.writeHead(status, {'Content-Type': 'application/json'});
    response.end(JSON.stringify({error: status === 500 ? 'Cloud database request failed.' : error.message}));
  }
}

const server = createServer((request, response) => { void handle(request, response); });
server.listen(port, '0.0.0.0', () => console.log(`Training API listening on port ${port}`));

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    server.close();
    await pool.end();
    process.exit(0);
  });
}
