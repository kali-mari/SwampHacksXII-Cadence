# Current shirt hardware: four IMUs and two elbow flex sensors

Real acquisition is enabled: `SEND_DUMMY_DATA=false`, `ENABLE_I2C_SENSORS=true`,
and both FLEX_ENABLED entries are true in esp32/config.h. There are no humidity
or spine sensors in this configuration. A0/A1 mean the Feather board labels, not
GPIO0/GPIO1 or raw ADC channel numbers. This is the Adafruit ESP32-S3 Feather
4MB Flash / 2MB PSRAM.
## Flex sensors: both elbows

## Wiring

| Sensor | App type / ID | Connection | Address / AD0 |
| --- | --- | --- | --- |
| Left elbow flex | 1 / 0 | A0 = GPIO18 | Own 10k divider |
| Right elbow flex | 1 / 1 | A1 = GPIO17 | Own 10k divider |
| Left upper-arm IMU | 2 / 0 | Bus 0: SDA GPIO3, SCL GPIO4 | 0x69; AD0 to 3V3 |
| Left forearm IMU | 2 / 1 | Bus 0: SDA GPIO3, SCL GPIO4 | 0x68; AD0 to GND |
| Right upper-arm IMU | 2 / 2 | Bus 1: SDA GPIO5, SCL GPIO6 | 0x69; AD0 to 3V3 |
| Right forearm IMU | 2 / 3 | Bus 1: SDA GPIO5, SCL GPIO6 | 0x68; AD0 to GND |

Power Adafruit MPU6050 breakout VIN pins from 3V3; connect all grounds together.
Both IMUs on each bus share that bus's SDA/SCL wires. Do not join the buses together.
The breakouts include pullups; all pullups must go to 3V3. Use short wiring and
check longer garment cables for I2C errors. No multiplexer is needed.

Build a separate divider for each elbow, with power disconnected:

```text
Feather 3V3 ---- flex sensor ----+---- A0 (left) OR A1 (right)
                               |
                             10k ohm
                               |
Feather GND --------------------+
```

Each flex needs its own resistor and ADC junction. Do not connect the two junctions.
An optional 100 nF capacitor from each junction to ground can reduce noise.
The nominal 25k flat flex resistance gives about 943 mV on a 3.3V supply; increasing
resistance lowers voltage. Firmware averages 16 readings and computes
`Rflex = 10000 * (3300 / millivolts - 1)`. This assumes the documented divider and
3.3V supply. Resistance is not an elbow angle; calibrate each sensor while mounted.
An analog voltage-range check does not prove sensor presence: a disconnected input
can float. These A0/A1 pins are ADC2; this firmware uses BLE and does not enable Wi-Fi.

## Build, upload, and verify initialization

Open the repository in VS Code with PlatformIO. The board, USB CDC, and Adafruit
MPU6050 dependency are configured in platformio.ini. From the repository root:

```sh
pio run
pio run --target upload
pio device list
pio device monitor --port YOUR_RUNTIME_PORT --baud 115200 --dtr 1 --rts 0
```

The existing upload_port=COM4 is for the team's Windows computer; override it with
`--upload-port YOUR_PORT` when using another machine. Upload and runtime USB ports
may differ. Tap RESET without BOOT after upload. Monitor at 115200 baud.

Expected startup messages identify both flex pins, both I2C buses, and all four IMUs
with their address and OK/MISSING status. An IMU is initialized with ±8g acceleration,
±500 degrees/s gyro range and a 21 Hz filter; the Adafruit library converts readings
to m/s² and rad/s. The configured acquisition interval is 20 ms (target 50 Hz per
sensor, not guaranteed). Readings are sequential, with individual timestamps.
Missing IMUs send invalid packets, not usable zeros. An address ACK is checked before
each IMU read. A device missing at startup requires a reset after wiring is corrected.
Verify every IMU says OK; tilt each one and confirm the corresponding app card changes.
Bend each flex independently and verify left/right mapping. No hardware measurements
can be verified just by compiling the firmware.

## Android app and BLE contract

Install the Android EAS development APK (see ../mobile/README.md), load the current
JavaScript from `npm start`, then Find my shirt -> PostureShirt -> Connect. Accept
Nearby devices permissions. Close other BLE inspectors. Updating this sensor layout
only requires a JavaScript reload of an existing compatible APK, plus new ESP32 firmware.
The phone app does not generate simulated data; it expects six shirt sensor
packets and marks ESP32 dummy packets as simulated.

Service: `7f100001-1b15-4f0d-8c5b-5c794f726b00`.
Read/notify characteristic: `7f100002-1b15-4f0d-8c5b-5c794f726b00`.
Firmware sends notifications only while connected and subscribed. All packets are
20 bytes, little endian; no MTU increase is required.

| Bytes | Meaning |
| --- | --- |
| 0 | Protocol version 1 |
| 1 | Type 1 flex, type 2 IMU |
| 2 | ID: flex 0–1; IMU 0–3 |
| 3 | Bit 0 valid; bit 1 simulated |
| 4–7 | uint32 milliseconds since boot (wraps at about 49.7 days) |
| 8–19, flex | uint16 raw ADC, uint16 mV, uint32 ohms; 4 reserved bytes |
| 8–19, IMU | Six int16: ax/ay/az ×100 (m/s²), gx/gy/gz ×1000 (rad/s) |

Spine/type-1 ID 2 and humidity/type-3 packets are now rejected by the decoder.
The existing two elbow and four IMU packet layouts and UUIDs are unchanged.
The app labels invalid or stale readings. Notifications are not replayed if lost;
use timestamps to align recordings and reject incomplete windows for future ML.
The prototype does not implement BLE bonding/authentication or persistent recording.

## Calibrate screen 3D pose preview

The mobile Calibrate screen uses an optimized `assets/TorsoManquine.glb` derived
from the supplied model. Its skinned geometry and Mixamo rig are retained; unused
animation clips and embedded texture maps are removed and replaced by a solid
material so the native GLB loader can load the bundled model efficiently. It maps the upper-arm
IMUs (type 2 IDs 0 and 2) to the Mixamo `mixamorig1LeftArm` and
`mixamorig1RightArm` bones, and the
forearm IMUs (type 2 IDs 1 and 3) plus elbow flex sensors (type 1 IDs 0 and 1)
to the forearm/elbow joints. The preview mirrors the right sensor X/Z axes into
the model coordinate frame to match the shirt-placement diagram. The display
starts with upper arms at the sides and elbows bent about 90 degrees, forearms
angled forward. Stand in that pose and capture a new neutral pose before testing
movement. Valid BLE packets are timestamped by the app and passed directly to
the preview. Bluetooth requires the Android development build; the phone app
does not generate synthetic sensor readings.

The MPU6050 preview uses relative gravity direction for approximate segment
orientation, so it cannot determine yaw and can be affected by acceleration
while moving. Elbow resistance is converted to an approximate 0–110 degree hinge
angle relative to the captured neutral resistance. Only fresh valid readings
drive joints; stale joints ease to the rig's neutral pose. The GLB contains a
full-body mesh, but the preview camera frames the upper body. The spine remains
static: this sensor layout has no back-flex or torso IMU, so it cannot measure
trunk bending.

## Optional dummy test

Set SEND_DUMMY_DATA=true and upload to skip physical sensors. One simulated packet
is sent every 20 ms, cycling through the six configured sensors (about 8.3 Hz each).
The app marks ESP32-generated data as simulated. Set the flag false and re-upload before
collecting real training data. The phone app itself does not generate simulated readings.

## Form processing

The firmware sends physical readings, not joint angles or form scores. Four IMUs
provide 24 axes and two flex sensors provide two movement channels: 26 channels
for an initial time-series model. Calibrate mounting orientation, gyro bias, and
flex response per wearer. Arm-only sensing does not establish torso posture.
Train and test on labeled real workout recordings, splitting by person/session.
The database/backend and trained model are not implemented here.

## Checks

`node --test tests/protocol.test.mjs tests/sensors.test.mjs` checks decoding and
app sensor state. `tests/dummy_data_test.cpp` checks synthetic packet generation.
PlatformIO compilation and Android bundle export validate build-time integration;
actual sensor readings and phone BLE connectivity need the physical hardware.
Use 3V3, never USB/5V/BAT, for this divider. The 10k resistor goes from the
ADC junction to ground. An optional 100 nF capacitor from the junction to ground
helps filter noise. All sensor grounds must be common.

GPIO 13 is also connected to the onboard red LED. It can load the divider:
prefer moving the junction to A0 and changing `FLEX_PINS[0]` to `A0` in config.h
before calibrating. Do not blink the LED while measuring on 13. The resistance
formula assumes no additional load and a measured supply close to 3300 mV.
GPIO13 is an ADC2 pin; keep Wi-Fi disabled for this prototype.

For the supplied flex sensor, nominal flat resistance is 25k (±30%), with a
listed bend range of 45k–125k depending on bend radius. With this divider the
nominal voltages are 0.943 V flat, 0.600 V at 45k, and 0.244 V at 125k.
Bending in the intended direction should reduce voltage. A 10k resistor works
for the initial test. Calibrate the mounted sensor; resistance is not a joint
angle and is not linear in elbow degrees. Avoid creasing, reversing the intended
bend, or stressing the solder tabs. Give the elbow sensor a rounded fabric guide
so the inner elbow does not sharply fold it.

## Build and upload with PlatformIO

1. Install **PlatformIO IDE** from the VS Code Extensions panel.
2. Open this repository folder (the folder containing `platformio.ini`) in VS Code.
   PlatformIO downloads the configured ESP32 platform, compiler, and sensor libraries.
   The board is configured as Adafruit Feather ESP32-S3 4MB Flash / 2MB PSRAM.
3. Connect the Feather with a USB data cable. In the PlatformIO toolbar, use
   **Build** (checkmark), then **Upload** (right arrow), then **Serial Monitor**.
   The monitor is configured for 115200 baud and USB CDC is enabled.
4. Alternatively, in a **PlatformIO Core CLI** terminal opened from PlatformIO,
   run these commands from the repository root:

   ```sh
   pio run
   pio run --target upload
   pio device monitor
   ```

5. If multiple serial devices are connected, run `pio device list` and explicitly
   select the Feather with `pio run --target upload --upload-port YOUR_PORT` and
   `pio device monitor --port YOUR_PORT`. Close other serial monitors before upload.
6. If the upload cannot connect, hold BOOT, tap RESET, release BOOT, and retry
   upload after selecting the newly enumerated port. On Linux, a permission-denied
   serial port requires the appropriate serial-device group/udev setup.

The existing `esp32/esp32.ino` and all sibling .cpp/.h files are built directly;
no copying into a new project or Arduino IDE is needed. PlatformIO uses the
Arduino framework under the hood, with BLE included in the ESP32 platform.
Dependencies are declared in platformio.ini. Do not install a separate ESP32 BLE
library.

The default enables both I2C buses and both elbow flex sensors. For a single-flex
bench test set ENABLE_I2C_SENSORS=false and FLEX_ENABLED={true, false} in
esp32/config.h. Serial output includes I2C startup status and
flex_id,raw,mV,ohms lines at 5 Hz per enabled flex sensor. Record neutral and
comfortably bent values.

In a BLE inspector connect to **PostureShirt**, find the service UUID from config.h,
and subscribe to the DATA characteristic. You should see 20-byte notifications.
Disconnect and verify it advertises again.

The sensor-layout changes in this guide have not yet been rebuilt with PlatformIO.
Compilation and linking, sensor wiring, BLE behavior, firmware upload, serial
output, sensor detection, and phone-to-shirt testing remain to be verified during
hardware bring-up.

## Full hardware: two independent I2C buses, no multiplexer

This layout uses four MPU6050s and two analog elbow flex sensors; there are no
temperature/humidity or back flex sensors.
Bus 0 uses the Feather's labeled SDA/SCL pins. Bus 1 uses GPIO5/GPIO6,
explicitly assigned in firmware. **Do not join the two buses' SDA or SCL wires.**
Power the Adafruit sensor breakout VIN pins from 3V3; connect all grounds together.
These instructions refer to breakouts, not bare sensor ICs.

| Bus | SDA pin | SCL pin | Sensor ID / placement | Address | MPU AD0 |
| --- | --- | --- | --- | --- | --- |
| 0 | GPIO3 / SDA | GPIO4 / SCL | IMU 0: left upper arm | 0x69 | 3V3 |
| 0 | GPIO3 / SDA | GPIO4 / SCL | IMU 1: left forearm | 0x68 | GND |
| 1 | GPIO5 / D5 | GPIO6 / D6 | IMU 2: right upper arm | 0x69 | 3V3 |
| 1 | GPIO5 / D5 | GPIO6 / D6 | IMU 3: right forearm | 0x68 | GND |

On each bus, the three SDA leads share that bus's SDA pin, and the three SCL
leads share that bus's SCL pin. MPU6050 addresses repeat across independent buses,
not within a bus. AD0 is a physical connection; do not connect AD0 to 5V.
Each bus needs SDA/SCL pullups to 3V3. The supplied Adafruit breakouts include
pullups; check the actual modules before adding more resistors in parallel.
Keep wiring short and bench-test garment cables for errors.

| Flex ID | Placement | Default analog input | Own resistor |
| --- | --- | --- | --- |
| 0 | Left elbow | GPIO13 / D13 | 10k to GND |
| 1 | Right elbow | A1 / GPIO17 | 10k to GND |

GPIO13 preserves the original test connection but shares the onboard LED.
Move flex 0 to A0 / GPIO18 and change FLEX_PINS[0] to A0 for cleaner readings.
Each divider has its own ADC junction and resistor; never join the two junctions.
Both inputs are enabled by default; set FLEX_ENABLED entries false for absent
flex sensors. A disconnected analog input can float and look plausible, so the
valid flag is only a voltage-range check, not a sensor-presence detector.

Boot logs identify missing I2C sensors; failed reads produce invalid packets.
Reboot after attaching a missing I2C sensor; this version does not hot-plug or
reinitialize. IMU/flex sampling targets 50 Hz; sequential I2C reads add jitter. Measure
actual sampling and BLE loss before collecting model data; reduce rate if needed.

Mount IMUs firmly in the same orientations: Y points up and Z is perpendicular
to the arms. Keep that mounting convention consistent across all four sensors
and record it with each dataset version. Calibrate in a repeatable neutral pose
each time the shirt is worn. Fabric slip and gyro drift affect form estimates.
Six-axis IMUs have no absolute heading reference. Both I2C buses are fully allocated
for MPU6050 addresses; adding a torso IMU would require relocating an existing IMU
or changing the bus architecture.

Use insulated, strain-relieved connectors and a removable electronics pocket.
Keep boards and the battery away from sweat; remove them before washing. Bench
test before wearing and avoid charging a battery while wearing the prototype.

## Bluetooth and React Native

ESP32-S3 uses **Bluetooth Low Energy**, not Bluetooth Classic serial.
Service `7f100001-1b15-4f0d-8c5b-5c794f726b00`; read/notify characteristic
`7f100002-1b15-4f0d-8c5b-5c794f726b00`. Every notification is exactly 20 bytes,
little endian. No MTU upgrade is required. No bonding/authentication is implemented
in this bench prototype; add access control before collecting personal sessions.

| Bytes | Meaning |
| --- | --- |
| 0 | Protocol version = 1 |
| 1 | Type: 1 flex, 2 IMU |
| 2 | Sensor ID: flex 0–1 (left/right elbow), IMU 0–3 (placements above) |
| 3 | Bit 0: valid; ignore payload if zero |
| 4–7 | uint32 device milliseconds, wrapping after about 49.7 days |
| 8–19, flex | uint16 ADC, uint16 mV, uint32 ohms; remaining bytes reserved |
| 8–19, IMU | Six int16: ax/ay/az in 0.01 m/s², gx/gy/gz in 0.001 rad/s |

`mobile/protocol.mjs` decodes notifications. `mobile/ble-example.ts` shows a native
React Native subscription using react-native-ble-plx and buffer. It is a starting
integration snippet, not a standalone application. Configure Bluetooth usage
descriptions on iOS and Bluetooth scan/connect permissions on Android; follow the
library's instructions for your target OS versions. Expo needs a native development
build. Scan using the service UUID, stop scanning on selection, connect, discover,
subscribe, and clean up on unmount. A plain characteristic read returns only the
latest sensor packet. Handle disconnects explicitly and start a new device-time
epoch on reconnection/reboot. Notifications can be dropped; this protocol has no
replay/sequence acknowledgment. Add phone receive time and session ID to records,
align sensors by device timestamps, and exclude stale/missing windows.

## Database boundary

Keep the path **sensors -> BLE -> phone -> authenticated backend -> Tiger database**.
Do immediate feedback on the phone. Batch uploads rather than writing the database
once per BLE callback. Store raw sessions for training plus per-rep summaries.
Suggested raw record fields: session_id, device_id, device_epoch, phone_received_at,
device_ms, sensor_type, sensor_id, valid, and decoded values. Store exercise,
participant, calibration, mounting orientation, labels, and model version separately.

The cloudbackend stores labeled run samples in TigerData. Keep database credentials
in the backend/training environment, never in the firmware or mobile bundle. Apply
the SQL migrations in `database/` before using the collector.

## First form model

Start with one named exercise (for example a curl). Calibrate each elbow at several
known angles; use piecewise interpolation to estimate degrees. Add a complementary
filter or quaternion fusion for each IMU, bias calibration, and sensor-to-segment
alignment before interpreting relative segment angles. Do not subtract raw Euler
angles from arbitrarily mounted IMUs. A neutral pose alone does not solve every
axis alignment or yaw ambiguity.

The ML pipeline uses a causal Temporal Convolutional Network (TCN) over 128-frame,
50 Hz windows (2.56 seconds). Its 26 channels are both elbow flex resistances plus
acceleration/gyroscope X/Y/Z from all four IMUs. Train from labeled Dev Testing
runs in TigerData using `MachineLearning/train_model.py`; whole runs are held out
so overlapping windows from one run cannot leak across train/test. See
`MachineLearning/README.md` for setup, data requirements, and live prediction.
Collect multiple people, exercises, and mounting/calibration conditions. Labels
currently apply to whole runs, so bad-form moments in a mostly-good run can get
noisy labels. No measured accuracy should be claimed until training and evaluation
use representative, correctly labeled data.

## Local checks

Run `node --test tests/protocol.test.mjs` for decoder compatibility checks. Actual
ADC behavior, full firmware build, BLE throughput, mounting calibration, and the
end-to-end database path still require your hardware and application environment.

References: supplied Spectra Symbol flex sheet and Adafruit MPU6050 guide;
[Feather pinouts](https://learn.adafruit.com/adafruit-esp32-s3-feather/pinouts),
[ESP32 I2C API](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/i2c.html),
[Arduino ADC API](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/adc.html),
[Espressif BLE notify example](https://github.com/espressif/arduino-esp32/blob/master/libraries/BLE/examples/Notify/Notify.ino).

## Optional ESP32 dummy-reading test

`SEND_DUMMY_DATA` in esp32/config.h is currently **false**, so the firmware
reads the physical sensors. Set it to true only for a hardware/Bluetooth bench
test, then upload with PlatformIO. No physical sensors need to be connected for
that test.
The ESP32 advertises as PostureShirt with the same service and characteristic UUIDs.
It sends one 20-byte notification every 20 ms, cycling through six sensors.
Values change smoothly: elbow resistance and acceleration/gyro axes. Header flag bit 1
marks these readings as simulated; flag bit 0 still means valid.

In the installed Android development app, use **Find my shirt -> Connect**.
The app has no phone-generated demo feed; it labels ESP32 dummy packets as
simulated. Existing APKs can
receive the updated JavaScript through Metro without a native rebuild. Serial
Monitor at 115200 prints whether the ESP32 is connected and sending or waiting.
Set SEND_DUMMY_DATA=false and upload again to restore real sensor acquisition.

## IMU fallback when an elbow flex reading fails

Reset with both arms straight, sensor axes aligned, and hold still for at least
2 seconds after startup. Serial prints `Arm 0 IMU fallback calibrated` and
`Arm 1 IMU fallback calibrated`. Stillness detection cannot verify that the arms
are straight; the wearer must establish this pose. The estimator averages gyro
bias during calibration, then integrates each IMU orientation as a quaternion.
The relative rotation magnitude is the displayed angle (0 degrees at calibration).
Forearm twist contributes to this estimate, and gyro drift accumulates: this is
not a calibrated anatomical hinge measurement. Reset in the straight pose to
recalibrate. Any missing IMU read or sampling gap over 100 ms disables that arm's
fallback until reset, rather than continuing with lost motion.

A valid flex reading always takes priority. If the divider reading is invalid
and its arm's IMU estimator is ready, firmware sends a 20-byte version-2 flex
packet: flag bit 2 marks the fallback; bytes 16–17 contain unsigned little-endian
centidegrees. Raw ADC and mV remain diagnostics, and resistance bytes are zero.
Updated apps expose `source: imu_fallback`, `angleDegrees`, and
`resistanceOhms: null`, display “IMU estimate” and degrees, and drive the 3D
elbow relative to its captured fallback angle. If app calibration happened while
the flex sensor was working and no fallback angle was captured, the preview
anchors the estimate to its 90-degree starting elbow pose. Version-1 packets
remain unchanged; old apps reject version 2 rather than reading fictitious ohms.
Reload the updated app JavaScript when flashing this firmware. No native APK
changes are required.

Runs may save the explicitly tagged angle in JSON, but ML still expects flex
resistance. Live prediction pauses during fallback and resumes after a full
fresh window of real sensor readings; training excludes fallback samples.
Restart/redeploy the updated backend validator before saving fallback runs.
Intermittent contacts that still produce an in-range voltage cannot be detected
by the existing divider validity check and will not trigger this fallback.
