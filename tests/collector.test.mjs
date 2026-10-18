import test from 'node:test';
import assert from 'node:assert/strict';
import {collectorBaseUrl} from '../mobile/collectorConfig.mjs';

test('accepts an HTTPS collector origin and strips a trailing slash', () => {
  assert.equal(collectorBaseUrl('https://posture-api.example.com/'), 'https://posture-api.example.com');
});

test('rejects missing, non-HTTPS, or non-origin collector addresses', () => {
  for (const value of [
    '',
    'http://192.168.1.5:3000',
    'https://console.cloud.tigerdata.com',
    'https://api.example.com/api/runs',
    'https://api.example.com?token=secret',
    'not a URL',
  ]) {
    assert.equal(collectorBaseUrl(value), null, value);
  }
});
