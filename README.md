# Cadence

Cadence is a wearable running-form prototype. An ESP32-S3 reads motion and
elbow-flex sensors mounted in a shirt, sends readings to an Android app over
Bluetooth Low Energy (BLE), and the app displays sensor status and a live
upper-body rig. The app can also stream captured runs to a Node.js collector
backed by PostgreSQL/TigerData. An experimental temporal convolutional network
(TCN) training and inference pipeline is included.

Cadence is a hackathon prototype, not a medical device or a clinically
validated injury-prevention product. Its live pose is an approximate
visualization of the available sensors, not a biomechanical measurement.

## Project at a glance

| Area | Implementation |
| --- | --- |
| Wearable controller | Adafruit ESP32-S3 Feather, PlatformIO, Arduino/C++ |
| Motion sensors | Four MPU6050 IMUs: upper arms and forearms |
| Bend sensors | Two elbow flex sensors |
| Mobile app | React Native, Expo, JavaScript |
| Live model | Three.js and Expo GL rendering a bundled, rigged GLB |
| Wireless link | BLE sensor notifications |
| Run collection | Node.js API, PostgreSQL/TigerData |
| Form classification | Optional Python/PyTorch causal TCN pipeline |

## System architecture

```text
Four MPU6050 IMUs + two elbow flex sensors
                     │
                     ▼
       ESP32-S3 firmware (about 50 Hz)
                     │ BLE notifications
                     ▼
    Expo Android app ──── live sensor cards and rigged torso preview
           │
           ├── HTTPS batches ──► Node.js collector ──► TigerData/PostgreSQL
           │                                           │
           │                                           └── labeled run data
           │                                                  │
           │                                                  ▼
           │                                         Python TCN training
           │                                                  │
           └──── HTTPS predictions ◄── inference API ◄────────┘
```

The motion preview is driven by live readings and a user-captured neutral pose.
The current shirt has no torso/spine sensor, so the model's chest and spine do
not animate. Gravity-based accelerometer orientation is approximate and cannot
determine rotation around gravity; it should not be interpreted as full 3D
motion capture.

## Hardware and sensor placement

The prototype uses an Adafruit ESP32-S3 Feather with four MPU6050 accelerometer
and gyroscope modules and two analog elbow flex sensors.

| Firmware type / ID | Placement | App/pose use |
| --- | --- | --- |
| IMU `2:0` | Left upper arm | Left upper-arm bone |
| IMU `2:1` | Left forearm | Left forearm orientation and elbow fallback |
| IMU `2:2` | Right upper arm | Right upper-arm bone |
| IMU `2:3` | Right forearm | Right forearm orientation and elbow fallback |
| Flex `1:0` | Left elbow | Left elbow bend; IMU fallback if invalid |
| Flex `1:1` | Right elbow | Right elbow bend; IMU fallback if invalid |

The current I2C wiring uses two buses: GPIO 3/4 and GPIO 5/6. The flex inputs
use A0/GPIO 18 and A1/GPIO 17, each with its own 10 kΩ divider. Firmware and
configuration details are in [docs/HARDWARE_AND_FIRMWARE.md](docs/HARDWARE_AND_FIRMWARE.md)
and [esp32/config.h](esp32/config.h).

The flex circuit measures resistance through a voltage divider; resistance is
not linearly proportional to elbow angle. The app uses a bounded change from
the calibrated baseline for visualization. When the firmware reports an
IMU-derived elbow angle instead of a valid flex measurement, the app uses that
angle relative to its captured neutral value.

## Firmware and BLE data

Firmware is under [`esp32/`](esp32/), with the `feather_s3` PlatformIO
environment. It samples at a target interval of 20 ms (about 50 Hz). Current
configuration enables the four IMUs and both flex channels; dummy firmware
packets are disabled by default.

The firmware sends 20-byte, little-endian BLE notifications. The packet
protocol and BLE service/characteristic UUIDs are defined in
[`esp32/protocol.h`](esp32/protocol.h) and
[`esp32/config.h`](esp32/config.h), with the matching decoder in
[`mobile/protocol.mjs`](mobile/protocol.mjs). Protocol v1 carries flex readings
or IMU axes. Protocol v2 can mark a flex-channel packet as an IMU-derived elbow
angle in centidegrees, allowing the mobile app to display a fallback when a
flex sensor is unavailable.

The firmware's elbow estimator and flex conversion are implemented in
[`esp32/elbow_estimator.h`](esp32/elbow_estimator.h) and
[`esp32/flex_sensor.cpp`](esp32/flex_sensor.cpp). Sensor placement, axis
orientation, calibration, wiring, and protocol notes are documented in
[docs/HARDWARE_AND_FIRMWARE.md](docs/HARDWARE_AND_FIRMWARE.md).

### Build and flash firmware

Install PlatformIO and the ESP32 platform, connect the board over USB, then run
these commands from the repository root:

```powershell
pio run -e feather_s3
pio run -e feather_s3 -t upload
pio device monitor
```

Review `esp32/config.h` before flashing: sensor enables, GPIO assignments, BLE
identifiers, and dummy-data settings are configured there.

## Mobile app

The Expo app is in [`mobile/`](mobile/). It provides:

- **Calibrate** — connect to the shirt, capture a neutral pose, inspect sensor
  readings, and view the live rigged upper body.
- **Dev Testing** — record a run and attach a manually selected `good` or
  `bad` label for training data.
- **Current Run** — record an unlabeled run for storage and future analysis.
- **Past Runs** — review saved run summaries from the collector.

The 3D preview is implemented in
[`mobile/screens/TorsoPreview.js`](mobile/screens/TorsoPreview.js), with sensor
mapping and pose calculations in [`mobile/pose.mjs`](mobile/pose.mjs). It uses
the bundled optimized GLB and Three.js with Expo GL. The initial pose places
the upper arms at the sides with elbows bent; **Set current pose as neutral**
captures fresh available readings as the reference for subsequent movement.

The phone connects to physical BLE hardware through `react-native-ble-plx`.
Use an Android development build for hardware BLE testing; Expo Go does not
provide the required native BLE module. The app can run on other platforms for
non-BLE development, but the complete hardware workflow is intended for
Android.

### Install and run the app

From the `mobile` directory:

```powershell
npm install
npm start
```

Build a local Android development client with the project's configured Expo
tooling, then install it on a BLE-capable Android device. For example:

```powershell
npx expo run:android
```

The Android SDK and a connected device or emulator are required for that
command. A physical Android device is required to test the shirt's BLE link.

### Configure app services

The app reads these build-time environment variables:

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_API_URL` | HTTPS origin for the run collector |
| `EXPO_PUBLIC_COLLECTOR_API_KEY` | Bearer token used by the app to access that collector |
| `EXPO_PUBLIC_MODEL_API_URL` | Optional HTTPS origin for the TCN inference API |

For local Expo development, put the values in `mobile/.env` and restart Expo
after changing them. For EAS builds, configure them in the build environment
and rebuild the app. Expo public variables are bundled into the client: the
collector token is therefore not a secret and must not be used as a production
user-authentication mechanism. Keep database credentials exclusively on the
server and restrict collector access appropriately.

More app setup and service configuration is described in
[mobile/README.md](mobile/README.md).

## Run capture and cloud collector

The Node.js collector is in [`cloudbackend/`](cloudbackend/). The app opens a
pending capture, uploads valid non-simulated sensor samples in ordered batches,
then finalizes it when the user saves. Abandoned captures can be discarded.
Dev Testing captures have a `good`/`bad` label; Current Run captures are
unlabeled. The collector validates sensor IDs, timestamps, values, labels, and
sample source before writing data.

The collector uses a bearer API key and stores run metadata in `training_runs`
and timestamped sensor packets in `training_samples`. Its main routes are:

| Route | Purpose |
| --- | --- |
| `GET /health` | Collector/database health check |
| `POST /api/runs/start` | Create a pending streamed capture |
| `POST /api/runs/:id/samples` | Upload an ordered, idempotent sample batch |
| `POST /api/runs/:id/finalize` | Finalize a capture and set its source/label |
| `DELETE /api/runs/:id` | Discard a pending capture |
| `GET /api/runs` | List saved runs and sensor summaries |

To run locally, copy `cloudbackend/.env.example` to `cloudbackend/.env`, fill
in the PostgreSQL/TigerData connection settings and a development
`COLLECTOR_API_KEY`, then run:

```powershell
cd cloudbackend
npm install
npm start
```

The default port is 3000. Expose the service through HTTPS before connecting
from a phone. The included [render.yaml](render.yaml) describes a Render
deployment; configure its database credentials and generated collector key in
the hosting provider, not in source control.

Apply database scripts in order in the TigerData SQL console:

1. [`database/ml_training.sql`](database/ml_training.sql) — base training run
   and sample tables.
2. [`database/0002_add_run_source.sql`](database/0002_add_run_source.sql) —
   distinguish labeled Dev Testing from unlabeled Current Runs.
3. [`database/0003_tcn_sensor_layout.sql`](database/0003_tcn_sensor_layout.sql) —
   constrain newly collected runs to the current two-flex/four-IMU layout.
4. [`database/0004_streamed_captures.sql`](database/0004_streamed_captures.sql) —
   support pending captures, ordered sample batches, and finalization.

The legacy [`database/schema.sql`](database/schema.sql) describes an earlier
workout schema; the collector and current ML pipeline use the migration-based
`training_runs` / `training_samples` schema above.

## Experimental ML pipeline

[`MachineLearning/`](MachineLearning/) contains a Python training script, a
causal PyTorch TCN, and a FastAPI prediction service. Training uses only
finalized, manually labeled Dev Testing runs (`good` or `bad`), not unlabeled
Current Runs. It expects two elbow flex streams and six accelerometer /
gyroscope values from each of four IMUs. Samples are aligned to 50 Hz and
segmented into 128-frame (2.56-second) windows. The trainer requires at least
ten complete runs per class, splits by whole run, fits scaling on training
data, and reports held-out metrics.

Configure TigerData credentials in the environment (or the backend `.env`),
then from the repository root:

```powershell
python -m pip install -r MachineLearning/requirements.txt
python MachineLearning/train_model.py
```

Training writes `running_model.pt`, `scaler.pkl`, and `model_info.json` beside
the script. Start the API from the `MachineLearning` directory after training:

```powershell
cd MachineLearning
uvicorn main:app --host 0.0.0.0 --port 8000
```

`GET /model/info` reports model readiness; `POST /predict` accepts a
128-frame, 26-channel window. Set `EXPO_PUBLIC_MODEL_API_URL` to a reachable
HTTPS origin to enable the app's optional live assessment. The model is
experimental: model weights and metadata must exist, the current collected
dataset may not meet training requirements, and performance is not evidence of
generalization or injury prevention. Do not use model scores as medical advice.

## Tests

Run the JavaScript test suite from `mobile/`:

```powershell
npm test
```

The suite covers BLE packet decoding, sensor validation, pose mapping and
fallback behavior, cloud run upload/validation, and TCN-window preparation.
It does not replace a physical-device test of sensor wiring, BLE connectivity,
or the rendered GLB on target hardware.

## Repository layout

```text
esp32/             ESP32-S3 firmware, sensor drivers, and BLE packet protocol
mobile/            Expo app, live BLE connection, 3D preview, and app tests
cloudbackend/      Node.js run collector and deployment configuration
database/          PostgreSQL/TigerData schema and ordered migrations
MachineLearning/   TCN training script, model, and inference API
docs/              Hardware, wiring, firmware, and protocol documentation
tests/             Shared protocol, sensor, pose, and training tests
```

## Current limitations and next steps

- The torso and spine remain static; there is no back-flex sensor in the current
  hardware layout.
- Gravity-based IMU orientation is approximate, cannot resolve yaw by itself,
  and can be affected by sensor placement, motion, and calibration.
- Flex readings can be noisy or intermittent. IMU fallback helps visualize
  elbow motion when a flex channel is invalid, but it does not recreate a
  failed measurement exactly.
- The prototype's wiring and garment integration are not yet robust enough
  for routine athletic use.
- The TCN pipeline needs a sufficiently large, diverse, consistently labeled
  dataset and participant-level evaluation before any form-quality claims.
- A future iteration could improve wearable integration, add torso sensing,
  strengthen calibration and sensor quality indicators, collect more labeled
  runs, and evaluate the model across different runners.
