import {createServer} from 'node:http';
import {randomUUID, timingSafeEqual} from 'node:crypto';
import pg from 'pg';
import {validateRunPayload} from '../mobile/training.mjs';

const {Pool} = pg;
const port = Number(process.env.PORT || 3000);
const collectorApiKey = required('COLLECTOR_API_KEY');
const pool = new Pool({
  host: required('DB_HOST'),
  port: Number(process.env.DB_PORT || 5432),
  database: required('DB_NAME'),
  user: required('DB_USER'),
  password: required('DB_PASSWORD'),
  ssl: {rejectUnauthorized: true},
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
      `INSERT INTO training_runs (run_id, started_at, ended_at, label, sample_count)
       VALUES ($1, $2, $3, $4, $5)`,
      [runId, payload.startedAt, payload.endedAt, payload.label, payload.samples.length],
    );

    for (let offset = 0; offset < payload.samples.length; offset += 500) {
      const batch = payload.samples.slice(offset, offset + 500);
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

async function handle(request, response) {
  try {
    if (request.method === 'GET' && request.url === '/health') {
      await pool.query('SELECT 1');
      response.writeHead(200, {'Content-Type': 'application/json'});
      response.end(JSON.stringify({status: 'ok'}));
      return;
    }
    if (request.method === 'POST' && request.url === '/api/runs') {
      const authorization = request.headers.authorization || '';
      const providedKey = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
      const providedBuffer = Buffer.from(providedKey);
      const expectedBuffer = Buffer.from(collectorApiKey);
      if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer))
        throw new HttpError(401, 'A valid collector token is required.');
      const result = await saveRun(await readJson(request));
      response.writeHead(201, {'Content-Type': 'application/json'});
      response.end(JSON.stringify(result));
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
