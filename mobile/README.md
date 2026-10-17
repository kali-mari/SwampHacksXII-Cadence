# Posture Check mobile app

An Expo / React Native dashboard for the current firmware: four IMUs, three flex
sensors (left elbow, right elbow, spine), and inside/outside SHT40 readings.
Demo mode is clearly marked and generates simulated data. Live mode scans for the
firmware's service UUID and decodes its 20-byte notifications. It displays physical
readings, not calculated joint angles or form scores. Data remains in memory;
there is no database integration, recording, or trained model yet.

## Preview on your iPhone

Use Node **24 LTS** (at least 24.3), or Node 22.13+. From the repository root:

```sh
cd mobile
npm install
npm start
```

Install Expo Go on the iPhone, keep the phone and computer on the same Wi-Fi,
and scan the terminal's QR code using the iPhone camera. Tap **Try demo**.
This project uses Expo SDK 58; Expo Go must support SDK 58. If the App Store's
Expo Go version has not yet caught up, use the development-build route below.
If LAN access is blocked, try `npx expo start --go --tunnel` (may prompt to install
tunnel tooling). Linux Mint's firewall must allow the development server.

Expo Go can preview demo mode only. The Bluetooth library is loaded only when
connecting from a native development build. **Find my shirt** explains the build
requirement when running in Expo Go.

## Real Bluetooth on an iPhone from Linux Mint

A physical iPhone and a custom development build are required. Linux cannot run
Xcode locally. Use Expo EAS cloud builds and your Apple Developer Program account
for physical-device signing. No cloud build or account setup was performed by Codex.
You control any account registration and build charges.

From `mobile/`:

```sh
npx eas-cli@latest login
npx eas-cli@latest build:configure
npx eas-cli@latest device:create
npx eas-cli@latest build --platform ios --profile development
```

Follow EAS prompts to register this project, register your iPhone, and configure
Apple signing. The bundle identifier defaults to `com.swamphacks.posturecheck`;
change it in app.json if your Apple team requires a unique identifier. Install the
resulting build using EAS's installation link on the registered iPhone. Enable
Developer Mode in iPhone Settings if prompted. Native dependency or plugin changes
require a new development build.

Start the local JavaScript server after installing the build:

```sh
npm run start:device
```

Open the QR/link in **Posture Check**, not Expo Go. Allow Bluetooth access, turn on
the Feather, close any other BLE inspector connected to it, tap **Find my shirt**,
then **Connect** on the discovered PostureShirt. This is an in-app BLE connection;
you do not pair through the iPhone Bluetooth Settings list. Scanning stops after
10 seconds. Retry scanning after granting permissions or powering on Bluetooth.
The current implementation disconnects when backgrounded; reconnect on return.

With a Mac, local iOS build is also available using `npm run ios -- --device` and
Xcode signing. The app config contains the Bluetooth permission description and
BLE config plugin. Android permissions are requested at runtime as well, though
the main target is a physical iPhone.

## Firmware contract

The firmware must advertise service
`7f100001-1b15-4f0d-8c5b-5c794f726b00` and notify on characteristic
`7f100002-1b15-4f0d-8c5b-5c794f726b00` with the binary layout in
`../docs/HARDWARE_AND_FIRMWARE.md`. A different firmware packet layout must have a
matching decoder; arbitrary JSON/CSV notifications will be rejected.

The sensor map is in sensors.mjs and wire decoder in protocol.mjs. Incoming sensor
values are cached and the UI refreshes at 5 Hz. IMU/flex readings older than 1.5 s
and humidity readings older than 3.5 s are marked stale. Invalid packets do not
present fabricated zero measurements. Device timestamps restart at each boot;
this dashboard clears its readings at each new connection.

## Checks

```sh
npm test
npx expo install --check
npx expo export --platform ios
```

JavaScript export verifies bundling, not native Bluetooth compatibility. Physical
iPhone connection, permission prompts, and the iOS native build must be tested
with your device and Apple signing setup.

References: [Expo project setup](https://docs.expo.dev/get-started/create-a-project/),
[development builds](https://docs.expo.dev/develop/development-builds/introduction/),
[BLE library installation](https://github.com/dotintent/react-native-ble-plx#configuration--installation).

## Verification in this workspace

- Installed dependencies and generated package-lock.json with Node 24.
- Exported the iOS JavaScript/Hermes bundle successfully.
- Expo's offline dependency check matched the installed SDK's bundled versions.
- Introspected the native config and confirmed the iOS Bluetooth usage description.
- Protocol decoding and sensor status tests passed.
- Native iOS compilation, visual review on iPhone, and real BLE hardware connection
  remain untested; the export does not prove those work.
- npm audit reports 22 dependency advisories (7 moderate, 15 high), including
  framework/build-tool dependencies. Proposed automatic fixes include incompatible
  Expo/React Native downgrades. No force-fix or unverified dependency overrides were
  applied. Review these before release beyond the prototype.
