export const SERVICE_UUID = '7f100001-1b15-4f0d-8c5b-5c794f726b00';
export const DATA_UUID = '7f100002-1b15-4f0d-8c5b-5c794f726b00';

// Pass a Uint8Array; BLE libraries commonly return base64 (decode it first).
export function decodePacket(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 20)
    throw new Error('Expected a 20-byte Uint8Array');
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (v.getUint8(0) !== 1) throw new Error('Unsupported protocol version');
  const type = v.getUint8(1), id = v.getUint8(2);
  if (![1, 2, 3].includes(type) || id >= (type === 1 ? 3 : type === 2 ? 4 : 2))
    throw new Error('Unknown sensor');
  const base = { version: 1, type, id, valid: !!(v.getUint8(3) & 1),
    simulated: !!(v.getUint8(3) & 2), deviceMs: v.getUint32(4, true) };
  if (!base.valid) return base; // Never turn a failed read into a plausible zero.
  if (type === 1) return { ...base, raw: v.getUint16(8, true),
    millivolts: v.getUint16(10, true), resistanceOhms: v.getUint32(12, true) };
  if (type === 2) return { ...base,
    accelerationMps2: [8, 10, 12].map(i => v.getInt16(i, true) / 100),
    gyroRadps: [14, 16, 18].map(i => v.getInt16(i, true) / 1000) };
  return { ...base, temperatureC: v.getInt16(8, true) / 100,
    humidityPct: v.getUint16(10, true) / 100 };
}
