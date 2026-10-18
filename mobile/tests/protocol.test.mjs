import test from 'node:test';
import assert from 'node:assert/strict';
import { decodePacket } from '../mobile/protocol.mjs';

function packet(type, id = 0) {
  const b = new Uint8Array(20), v = new DataView(b.buffer);
  b.set([1, type, id, 1]); v.setUint32(4, 0xfffffff0, true);
  return [b, v];
}
test('flex divider result and unsigned timestamp', () => {
  const [b, v] = packet(1);
  v.setUint16(8, 1170, true); v.setUint16(10, 943, true);
  v.setUint32(12, 25000, true);
  assert.equal(decodePacket(b).resistanceOhms, 25000);
  assert.equal(decodePacket(b).deviceMs, 0xfffffff0);
});
test('IMU signed units and byte offsets', () => {
  const [b, v] = packet(2, 3);
  [-981, 0, 981, -1500, 2000, 0].forEach((n, i) => v.setInt16(8 + i * 2, n, true));
  const outer = new Uint8Array(24); outer.set(b, 2);
  const result = decodePacket(outer.subarray(2, 22));
  assert.deepEqual(result.accelerationMps2, [-9.81, 0, 9.81]);
  assert.deepEqual(result.gyroRadps, [-1.5, 2, 0]);
});
test('rejects retired environment sensors', () => {
  const [b] = packet(3, 1);
  assert.throws(() => decodePacket(b), /Unknown sensor/);
  for (const [type, id] of [[1, 2], [2, 4]]) {
    const [invalid] = packet(type, id);
    assert.throws(() => decodePacket(invalid), /Unknown sensor/);
  }
});
test('rejects malformed or incompatible messages', () => {
  assert.throws(() => decodePacket(new Uint8Array(19)));
  const [b] = packet(2); b[0] = 2; assert.throws(() => decodePacket(b));
  b[0] = 1; b[2] = 4; assert.throws(() => decodePacket(b));
});

test('accepts elbow flex IDs and rejects retired sensor IDs', () => {
  const [elbow, v] = packet(1, 1);
  v.setUint32(12, 45000, true);
  assert.equal(decodePacket(elbow).id, 1);
  assert.equal(decodePacket(elbow).resistanceOhms, 45000);
});

test('marks ESP32 dummy packets while preserving valid readings', () => {
  const [b, v] = packet(1, 1);
  b[3] = 3;
  v.setUint32(12, 40000, true);
  assert.equal(decodePacket(b).simulated, true);
  assert.equal(decodePacket(b).valid, true);
  assert.equal(decodePacket(b).resistanceOhms, 40000);
  b[3] = 1;
  assert.equal(decodePacket(b).simulated, false);
});
