export const SERVICE_UUID = '7f100001-1b15-4f0d-8c5b-5c794f726b00';
export const DATA_UUID = '7f100002-1b15-4f0d-8c5b-5c794f726b00';

// Pass a Uint8Array; BLE libraries commonly return base64 (decode it first).
export function decodePacket(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 20)
    throw new Error('Expected a 20-byte Uint8Array');
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = v.getUint8(0);
  if (version !== 1 && version !== 2) throw new Error('Unsupported protocol version');
  const type = v.getUint8(1), id = v.getUint8(2);
  if (![1, 2].includes(type) || id >= (type === 1 ? 2 : 4))
    throw new Error('Unknown sensor');
  const fallback = version === 2 && type === 1 && !!(v.getUint8(3) & 4);
  if (version === 2 && !fallback) throw new Error('Unsupported version 2 packet');
  const base = { version, type, id, valid: !!(v.getUint8(3) & 1),
    simulated: !!(v.getUint8(3) & 2), deviceMs: v.getUint32(4, true) };
  if (!base.valid) return base; // Never turn a failed read into a plausible zero.
  if (fallback) {
    const angleDegrees = v.getUint16(16, true) / 100;
    if (angleDegrees > 180) throw new Error('Invalid IMU angle');
    return {...base, source: 'imu_fallback', angleDegrees,
      raw: v.getUint16(8, true), millivolts: v.getUint16(10, true), resistanceOhms: null};
  }
  if (type === 1) return { ...base, raw: v.getUint16(8, true),
    millivolts: v.getUint16(10, true), resistanceOhms: v.getUint32(12, true) };
  if (type === 2) return { ...base,
    accelerationMps2: [8, 10, 12].map(i => v.getInt16(i, true) / 100),
    gyroRadps: [14, 16, 18].map(i => v.getInt16(i, true) / 1000) };
  throw new Error('Unsupported sensor type');
}
