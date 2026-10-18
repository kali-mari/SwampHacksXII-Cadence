## Screens

- **Home** — app entry point; the big circle starts a Current Run, the tiles below
  go to Calibrate, Dev Testing, and See past runs.
- **Current Run** — connect, start/stop a timed run, save it (`source: 'user_run'`,
  no label yet).
- **Dev Testing** — connect, pick a Good/Bad label, start/stop, save to train the
  model (`source: 'dev_testing'`).
- **Calibrate** — a bundled rigged GLB preview driven by real shirt readings
  from the four arm IMUs and two elbow flex sensors. Upper arms and forearms move
  relative to a captured neutral pose, and elbow flex directly drives the elbow
  joints. The chest and spine remain still: this shirt has no torso-mounted sensor.
- **See past runs** — lists saved runs with per-sensor averages and their
  good/bad/pending label, from `GET /api/runs`.

All five screens share one connection (`useShirtConnection.js`), so connecting
on one screen carries over to the others.

# Android Bluetooth app with EAS

The primary target is an **Android EAS development APK**, with live ESP32 BLE
sensor readings. Expo Go does not include the native Bluetooth module required
to connect to the shirt; use the development APK for live data.

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
The live rig uses native Expo GL support and Three.js r145 for Expo's WebGL 1
context, loading the texture-stripped GLB directly without the legacy
`expo-three` browser polyfill. Install dependencies and rebuild the development APK after pulling
these changes. The supplied `TorsoManquine.glb` is
bundled in `assets/`; its rigged geometry is retained, while unused animation
clips and large embedded texture maps are removed to keep the app asset small.
The preview uses a solid mannequin skin tone.

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

## Calibrate preview

The preview starts with upper arms resting at the sides and both elbows bent
about 90 degrees, with the forearms angled forward. Connect the shirt, match
that pose, and tap **Set current pose as neutral** before moving. Live BLE
packets from the shirt feed the preview directly; use an Android development
build for Bluetooth.
The preview binds sensor IDs to the GLB's
`mixamorig1LeftArm`, `mixamorig1LeftForeArm`, `mixamorig1RightArm`, and
`mixamorig1RightForeArm` bones:

| Model segment | Shirt sensor |
| --- | --- |
| Left upper arm | IMU 2:0 |
| Left forearm / elbow hinge | IMU 2:1 and flex 1:0 |
| Right upper arm | IMU 2:2 |
| Right forearm / elbow hinge | IMU 2:3 and flex 1:1 |

The right-side IMU axes are mirrored into the model coordinate frame to match
the placement diagram. Forearm IMUs provide relative swing; the flex sensors
provide the elbow hinge angle. Only fresh, valid readings are applied, and stale
segments ease back to their neutral rig pose. Flex resistance is mapped
approximately to 0–110 degrees using the captured neutral value and documented
full-bend resistance; it is not a measured clinical joint angle.

MPU6050 acceleration gives a gravity direction, not absolute orientation. This
preview therefore cannot measure yaw, and acceleration while moving can make
the pose approximate. The neutral reference exists only while the Calibrate
screen remains mounted and should be recaptured on each visit. The GLB contains
a full-body skinned mesh; the camera frames its upper-body portion rather than
deleting lower-body geometry. The chest and spine do not animate because no
torso sensor is installed.

During a Current Run, the app can send a rolling 128-frame (2.56-second) window
of the six sensors to the TCN service. Set `EXPO_PUBLIC_MODEL_API_URL` to the
reachable HTTPS inference API before starting Expo. Training and service setup are in
`../MachineLearning/README.md`.

**Current Run** and **Dev Testing** record valid, non-simulated BLE packets in
memory. Save a Current Run to upload its samples without a label, or save a Dev
Testing capture with a manually selected good/bad label for ML training. The
**Past Runs** screen fetches saved sessions and their per-sensor averages from
the backend. Demo readings are excluded.

Configure `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_COLLECTOR_API_KEY` in
`mobile/.env` before starting Expo; the API URL can also be edited from the
Current Run, Dev Testing, and Past Runs screens. Use the URL and development
token configured for cloudbackend. TigerData credentials must remain in the
backend's environment, never in the mobile app. The shared collector token is
embedded in the development app, so restrict backend access and do not treat it
as production authentication. See [cloudbackend setup](../cloudbackend/README.md)
to create the database tables and start/deploy the API. Unsaved in-memory runs
are lost if the app closes.

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
