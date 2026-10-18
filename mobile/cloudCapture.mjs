export const UPLOAD_BATCH_SIZE = 60;

const RETRY_DELAYS_MS = [500, 1500];

function captureId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

export class CloudRunUploader {
  constructor({baseUrl, apiKey, fetchImpl = globalThis.fetch, onError = () => {}, onProgress = () => {}}) {
    if (typeof baseUrl !== 'string' || !baseUrl.startsWith('https://'))
      throw new Error('A secure HTTPS collector address is required.');
    if (typeof apiKey !== 'string' || !apiKey.trim())
      throw new Error('A collector token is required.');
    if (typeof fetchImpl !== 'function')
      throw new Error('Network upload is unavailable in this app runtime.');

    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
    this.onError = onError;
    this.onProgress = onProgress;
    this.captureId = captureId();
    this.runId = null;
    this.samples = [];
    this.uploadedSampleCount = 0;
    this.nextBatchIndex = 0;
    this.uploadChain = Promise.resolve();
    this.finished = false;
  }

  async start(source, startedAt) {
    if (this.runId) throw new Error('This cloud capture has already started.');
    const result = await this.requestWithRetry('/api/runs/start', {
      method: 'POST',
      body: {captureId: this.captureId, startedAt, source},
    });
    if (typeof result.runId !== 'string' || !result.runId)
      throw new Error('Cloud collector returned an invalid capture confirmation.');
    this.runId = result.runId;
    return result;
  }

  addSample(sample) {
    if (!this.runId || this.finished) throw new Error('No active cloud capture is accepting samples.');
    this.samples.push(sample);
    if (this.samples.length - this.uploadedSampleCount >= UPLOAD_BATCH_SIZE)
      void this.flush().catch(error => this.onError(error.message || String(error)));
  }

  finish() {
    this.finished = true;
    if (this.runId)
      void this.flush(true).catch(error => this.onError(error.message || String(error)));
  }

  async finalize(endedAt, source, label) {
    if (!this.runId) throw new Error('Cloud capture has not started.');
    await this.flush(true);
    const result = await this.requestWithRetry(`/api/runs/${this.runId}/finalize`, {
      method: 'POST',
      body: {endedAt, source, label},
    });
    if (result.runId !== this.runId || result.sampleCount !== this.samples.length) {
      const error = new Error('Cloud collector returned an invalid save confirmation.');
      error.retryable = true;
      throw error;
    }
    return result;
  }

  flush(includePartialBatch = false) {
    if (!this.runId) return Promise.reject(new Error('Cloud capture has not started.'));
    const targetCount = includePartialBatch
      ? this.samples.length
      : Math.floor(this.samples.length / UPLOAD_BATCH_SIZE) * UPLOAD_BATCH_SIZE;
    const operation = this.uploadChain.then(() => this.uploadThrough(targetCount));
    this.uploadChain = operation.then(
      () => undefined,
      error => { this.onError(error.message || String(error)); },
    );
    return operation;
  }

  async uploadThrough(targetCount) {
    while (this.uploadedSampleCount < targetCount) {
      const batch = this.samples.slice(
        this.uploadedSampleCount,
        Math.min(targetCount, this.uploadedSampleCount + UPLOAD_BATCH_SIZE),
      );
      const batchIndex = this.nextBatchIndex;
      const result = await this.requestWithRetry(`/api/runs/${this.runId}/samples`, {
        method: 'POST',
        body: {batchIndex, samples: batch},
      });
      if (result.runId !== this.runId || result.batchIndex !== batchIndex ||
          result.sampleCount !== batch.length) {
        const error = new Error('Cloud collector returned an invalid sample-batch confirmation.');
        error.retryable = true;
        throw error;
      }
      this.uploadedSampleCount += batch.length;
      this.nextBatchIndex++;
      this.onProgress(this.uploadedSampleCount);
    }
  }

  async discard() {
    if (!this.runId) return;
    await this.uploadChain;
    await this.requestWithRetry(`/api/runs/${this.runId}`, {method: 'DELETE'});
    this.runId = null;
  }

  async requestWithRetry(path, {method, body}) {
    let lastError;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        return await this.request(path, {method, body});
      } catch (error) {
        lastError = error;
        if (!error.retryable || attempt === RETRY_DELAYS_MS.length) throw error;
        await delay(RETRY_DELAYS_MS[attempt]);
      }
    }
    throw lastError;
  }

  async request(path, {method, body}) {
    let response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          ...(body ? {'Content-Type': 'application/json'} : {}),
        },
        ...(body ? {body: JSON.stringify(body)} : {}),
      });
    } catch (cause) {
      const error = new Error(`Could not reach cloud collector: ${cause.message || String(cause)}`);
      error.retryable = true;
      throw error;
    }

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(result.error || `Cloud collector returned ${response.status}.`);
      error.retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      throw error;
    }
    return result;
  }
}
