// Integration example for a native React Native app, not Expo Go.
// Install react-native-ble-plx and buffer, then rebuild the native application.
import { BleManager, Device, Subscription } from 'react-native-ble-plx';
import { Buffer } from 'buffer';
import { SERVICE_UUID, DATA_UUID, decodePacket } from './protocol.mjs';

// Call after Bluetooth is powered on and runtime permissions are granted.
// The caller owns scanning/device selection and the manager lifetime.
export async function subscribeToShirt(
  manager: BleManager,
  deviceId: string,
  onReading: (reading: ReturnType<typeof decodePacket>) => void,
  onError: (error: unknown) => void,
) {
  let device: Device | undefined;
  let subscription: Subscription | undefined;
  try {
    device = await manager.connectToDevice(deviceId);
    await device.discoverAllServicesAndCharacteristics();
    subscription = device.monitorCharacteristicForService(SERVICE_UUID, DATA_UUID,
      (error, characteristic) => {
        if (error) { onError(error); return; }
        if (!characteristic?.value) return;
        try {
          onReading(decodePacket(Buffer.from(characteristic.value, 'base64')));
        } catch (e) { onError(e); }
      });
  } catch (error) {
    if (device) await device.cancelConnection().catch(() => {});
    throw error;
  }
  return async () => {
    subscription?.remove();
    await device?.cancelConnection();
  };
}
