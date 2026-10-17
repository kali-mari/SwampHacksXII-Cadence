import { Platform, PermissionsAndroid } from 'react-native';
import { Buffer } from 'buffer';
import { SERVICE_UUID, DATA_UUID, decodePacket } from './protocol.mjs';

// Imported only from a native development build, never from Expo Go's demo path.
export async function createShirtClient() {
  const { BleManager } = require('react-native-ble-plx');
  const manager = new BleManager();
  let monitor, disconnectSubscription, device, scanTimer;
  let generation = 0;
  const stopScan = () => {
    clearTimeout(scanTimer);
    return manager.stopDeviceScan().catch(() => {});
  };
  const disconnect = async () => {
    generation++;
    await stopScan();
    monitor?.remove(); monitor = undefined;
    disconnectSubscription?.remove(); disconnectSubscription = undefined;
    const previous = device; device = undefined;
    if (previous) await previous.cancelConnection().catch(() => {});
  };
  return {
    async scan(onDevice, onStatus, onError) {
      await disconnect();
      const attempt = generation;
      onStatus('Checking Bluetooth');
      if (Platform.OS === 'android') {
        const permissions = Number(Platform.Version) >= 31
          ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]
          : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
        const granted = await PermissionsAndroid.requestMultiple(permissions);
        if (permissions.some(p => granted[p] !== PermissionsAndroid.RESULTS.GRANTED))
          throw new Error('Allow Nearby devices in Android Settings → Apps → Posture Check → Permissions. On Android 11 or older, also allow Location and turn on Location services.');
      }
      // Instantiating the native manager triggers iOS's Bluetooth permission prompt.
      if (generation !== attempt) return;
      let state = await manager.state();
      // A newly created native BLE manager can briefly report Unknown/Resetting.
      for (let retry = 0; retry < 20 && ['Unknown', 'Resetting'].includes(state); retry++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        if (generation !== attempt) return;
        state = await manager.state();
      }
      // Android shows its own Bluetooth-enable dialog after an explicit scan tap.
      if (Platform.OS === 'android' && state === 'PoweredOff') {
        await manager.enable();
        state = await manager.state();
      }
      if (generation !== attempt) return;
      if (state !== 'PoweredOn') throw new Error(`Bluetooth is ${state}. Enable Bluetooth and allow access, then scan again.`);
      onStatus('Scanning');
      await manager.startDeviceScan([SERVICE_UUID], { allowDuplicates: false }, (error, found) => {
        if (generation !== attempt) return;
        if (error) { stopScan(); onError(error); return; }
        if (found) onDevice({id: found.id, name: found.name || found.localName || 'PostureShirt'});
      });
      if (generation !== attempt) return;
      scanTimer = setTimeout(() => {
        if (generation === attempt) { stopScan(); onStatus('Scan finished'); }
      }, 10000);
    },
    async connect(id, onReading, onStatus, onError) {
      await disconnect();
      const attempt = generation;
      onStatus('Connecting');
      try {
        const found = await manager.connectToDevice(id, { timeout: 12000 });
        if (attempt !== generation) { await found.cancelConnection().catch(() => {}); return; }
        device = found;
        await found.discoverAllServicesAndCharacteristics();
        if (attempt !== generation) return;
        disconnectSubscription = manager.onDeviceDisconnected(id, error => {
          if (attempt !== generation) return;
          monitor?.remove(); monitor = undefined;
          device = undefined;
          onStatus('Disconnected');
          if (error) onError(error);
        });
        monitor = found.monitorCharacteristicForService(SERVICE_UUID, DATA_UUID, (error, characteristic) => {
          if (attempt !== generation) return;
          if (error) { onError(error); return; }
          if (!characteristic?.value) return;
          try { onReading(decodePacket(Buffer.from(characteristic.value, 'base64'))); }
          catch (e) { onError(e); }
        });
        onStatus('Connected');
      } catch (error) {
        if (attempt === generation) { await disconnect(); throw error; }
      }
    },
    disconnect,
    async destroy() { await disconnect(); await manager.destroy(); },
  };
}
