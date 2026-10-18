import test from 'node:test';
import assert from 'node:assert/strict';
import {CloudRunUploader, UPLOAD_BATCH_SIZE} from '../mobile/cloudCapture.mjs';

function response(body, status = 200) {
  return {ok: status >= 200 && status < 300, status, json: async () => body};
}

test('uploads ordered sample batches during capture and a partial batch on stop', async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : undefined;
    requests.push({url, method: options.method, body});
    if (url.endsWith('/api/runs/start'))
      return response({runId: 'run-1', startedAt: body.startedAt}, 201);
    if (url.endsWith('/samples'))
      return response({runId: 'run-1', batchIndex: body.batchIndex, sampleCount: body.samples.length});
    if (options.method === 'DELETE') return response({deleted: true});
    throw new Error(`Unexpected request: ${url}`);
  };
  const uploader = new CloudRunUploader({
    baseUrl: 'https://collector.example.com',
    apiKey: 'test-token',
    fetchImpl,
  });
  const startedAt = '2026-10-17T10:00:00.000Z';
  await uploader.start('dev_testing', startedAt);

  for (let index = 0; index < UPLOAD_BATCH_SIZE; index++)
    uploader.addSample({index});
  await uploader.flush();
  assert.equal(uploader.uploadedSampleCount, UPLOAD_BATCH_SIZE);

  uploader.addSample({index: UPLOAD_BATCH_SIZE});
  uploader.finish();
  await uploader.flush(true);
  assert.equal(uploader.uploadedSampleCount, UPLOAD_BATCH_SIZE + 1);
  assert.deepEqual(
    requests.filter(request => request.url.endsWith('/samples')).map(request => [
      request.body.batchIndex,
      request.body.samples.length,
    ]),
    [[0, UPLOAD_BATCH_SIZE], [1, 1]],
  );

  await uploader.discard();
  assert.equal(requests.at(-1).method, 'DELETE');
});

test('retries transient upload failures with the same batch index', async () => {
  let batchAttempts = 0;
  const fetchImpl = async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : undefined;
    if (url.endsWith('/api/runs/start'))
      return response({runId: 'run-2', startedAt: body.startedAt}, 201);
    if (url.endsWith('/samples')) {
      batchAttempts++;
      if (batchAttempts === 1) return response({error: 'temporary outage'}, 503);
      return response({runId: 'run-2', batchIndex: body.batchIndex, sampleCount: body.samples.length});
    }
    if (options.method === 'DELETE') return response({deleted: true});
    throw new Error(`Unexpected request: ${url}`);
  };
  const uploader = new CloudRunUploader({
    baseUrl: 'https://collector.example.com',
    apiKey: 'test-token',
    fetchImpl,
  });
  await uploader.start('user_run', '2026-10-17T10:00:00.000Z');
  for (let index = 0; index < UPLOAD_BATCH_SIZE; index++)
    uploader.addSample({index});
  await uploader.flush();

  assert.equal(batchAttempts, 2);
  assert.equal(uploader.uploadedSampleCount, UPLOAD_BATCH_SIZE);
  await uploader.discard();
});

test('retries finalization with the same payload when the save response is lost', async () => {
  const finalizationBodies = [];
  let finalizationAttempts = 0;
  const fetchImpl = async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : undefined;
    if (url.endsWith('/api/runs/start'))
      return response({runId: 'run-finalize', startedAt: body.startedAt}, 201);
    if (url.endsWith('/samples'))
      return response({runId: 'run-finalize', batchIndex: body.batchIndex, sampleCount: body.samples.length});
    if (url.endsWith('/finalize')) {
      finalizationAttempts++;
      finalizationBodies.push(body);
      if (finalizationAttempts === 1) throw new Error('response lost after commit');
      return response({runId: 'run-finalize', sampleCount: 1});
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const uploader = new CloudRunUploader({
    baseUrl: 'https://collector.example.com',
    apiKey: 'test-token',
    fetchImpl,
  });
  await uploader.start('dev_testing', '2026-10-17T10:00:00.000Z');
  uploader.addSample({index: 0});

  const result = await uploader.finalize('2026-10-17T10:00:01.000Z', 'dev_testing', 'good');

  assert.equal(finalizationAttempts, 2);
  assert.deepEqual(finalizationBodies[0], finalizationBodies[1]);
  assert.equal(result.sampleCount, 1);
});
