## Screens

- **Home** — app entry point; the big circle starts a Current Run, the tiles below
  go to Calibrate, Dev Testing, and See past runs.
- **Current Run** — connect, start/stop a timed run, save it (`source: 'user_run'`,
  no label yet).
- **Dev Testing** — connect, pick a Good/Bad label, start/stop, save to train the
  model (`source: 'dev_testing'`).
- **Calibrate** — a schematic stick figure driven by the live flex sensors, and a
  "set current pose as neutral" baseline. The figure is a placeholder for the
  Blender-exported avatar; see the comment in `screens/CalibrateScreen.js` for the
  swap-in point.
- **See past runs** — lists saved runs with per-sensor averages and their
  good/bad/pending label, from `GET /api/runs`.

All five screens share one connection (`useShirtConnection.js`), so scanning or
going into demo mode on one screen carries over to the others.

# Android Bluetooth app with EAS

The primary target is an **Android EAS development APK**, with live ESP32 BLE
sensor readings. Expo Go can only run the separate demo mode.

## Build and install

Use Node 24 LTS. From this folder:

```sh
npm install
npx eas-cli@latest login
npm run build:android
```

Allow EAS to create/link the project and generate an Android keystore when prompted.
The development profile creates an APK with native Bluetooth support. Open EAS's
build installation link on your Android and install the APK. Allow APK installation
from your browser if requested. No Google Play developer account is required.

```sh
npm start
```

Open the development-server QR/link in the installed **Posture Check** app. Keep
phone and computer on the same Wi-Fi. Wi-Fi serves development code; sensor data
travels over **Bluetooth LE**. Turn on the ESP32 and tap **Find my shirt**, grant
Nearby devices permission, select **PostureShirt**, then **Connect**. No pairing
through Android Bluetooth Settings is needed. Close other connected BLE inspectors.

Android 12+ uses Nearby devices (scan/connect) permissions; the native plugin sets
neverForLocation because this app does not derive physical location from BLE.
Android 11 and older also need Location permission and Location services enabled.
After changing app.json/plugins or native dependencies, build and install a new APK.

For demo-only Expo Go preview, run `npm run start:demo` and tap **Try demo**.
The project uses SDK 57, so Expo Go must support that SDK. A development build
avoids depending on Expo Go's bundled native modules.
Anders Note: Run Set-ExecutionPolicy Bypass -Scope Process in terminal if getting
error like "cannot be loaded because running scripts is disabled on this system."

## Real Bluetooth on an iPhone from Linux Mint

## Data and limitations

Displays four IMUs and two elbow flex sensors (left A0, right A1). The
20-byte packet contract is documented in ../docs/HARDWARE_AND_FIRMWARE.md.
BLE UUIDs in protocol.mjs must match esp32/config.h. Notifications are decoded from
base64, cached, and displayed at 5 Hz. Invalid/stale readings are labeled. The app
disconnects in background; scan/connect again on return. Flex readings are resistance,
not calibrated joint angles.

During a Current Run, the app can send a rolling 128-frame (2.56-second) window
of the six sensors to the TCN service. Set `EXPO_PUBLIC_MODEL_API_URL` to the
reachable HTTPS inference API before starting Expo. Training and service setup are in
`../MachineLearning/README.md`.

For cloud collection, deploy the collector as described in
[`../cloudbackend/README.md`](../cloudbackend/README.md). Configure
`EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_COLLECTOR_API_KEY` in the EAS environment
used for the Android development build, then rebuild and reinstall the APK.
`EXPO_PUBLIC_API_URL` is the HTTPS collector origin, not the TigerData Console or
the Expo development-server URL. The Dev Testing screen's **Test backend**
button checks the configured cloud service; there are no API entry fields in
the app. For local Expo development, set the same variables in `mobile/.env`
and restart Expo.

**Current Run** and **Dev Testing** upload valid, non-simulated BLE samples in
ordered batches while recording. Save finalizes the cloud run; Dev Testing also
attaches the selected good/bad training label. Pending or interrupted captures
are excluded from training until finalized, and **Discard** removes a pending
capture. The **Past Runs** screen lists finalized sessions only. Demo readings
are excluded.

TigerData credentials stay in the backend's environment, never in the app. The
collector token is embedded in the development APK, so it is a pilot-only shared
credential, not production authentication. Keep the app open until the Save
confirmation appears.

## Checks

```sh
npm test
npx expo export --platform android
npx expo config --type introspect
```

JavaScript bundle/config checks do not replace native Android compilation or a
physical BLE test. EAS account login and cloud builds require your Expo account.
The dependency audit previously reported 22 framework/toolchain advisories; no
incompatible force-fix downgrades have been applied.

[Expo Android development builds](https://docs.expo.dev/tutorial/eas/android-development-build/)

Windows PowerShell note (Anders): if scripts are blocked, run
`Set-ExecutionPolicy Bypass -Scope Process` in that terminal session.
