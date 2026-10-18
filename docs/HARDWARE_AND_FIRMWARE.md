# Current shirt hardware: four IMUs and two elbow flex sensors

Real acquisition is enabled: `SEND_DUMMY_DATA=false`, `ENABLE_I2C_SENSORS=true`,
and both FLEX_ENABLED entries are true in esp32/config.h. There are no humidity
or spine sensors in this configuration. A0/A1 mean the Feather board labels, not
GPIO0/GPIO1 or raw ADC channel numbers. This is the Adafruit ESP32-S3 Feather
4MB Flash / 2MB PSRAM.

## Wiring

| Sensor | App type / ID | Connection | Address / AD0 |
| --- | --- | --- | --- |
| Left elbow flex | 1 / 0 | A0 = GPIO18 | Own 10k divider |
| Right elbow flex | 1 / 1 | A1 = GPIO17 | Own 10k divider |
| Left upper-arm IMU | 2 / 0 | Bus 0: SDA GPIO3, SCL GPIO4 | 0x68; AD0 to GND |
| Left forearm IMU | 2 / 1 | Bus 0: SDA GPIO3, SCL GPIO4 | 0x69; AD0 to 3V3 |
| Right upper-arm IMU | 2 / 2 | Bus 1: SDA GPIO5, SCL GPIO6 | 0x68; AD0 to GND |
| Right forearm IMU | 2 / 3 | Bus 1: SDA GPIO5, SCL GPIO6 | 0x69; AD0 to 3V3 |

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
Do not choose Try demo when validating real sensors. The dashboard expects six sensors.

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

## Optional dummy test

Set SEND_DUMMY_DATA=true and upload to skip physical sensors. One simulated packet
is sent every 20 ms, cycling through the six configured sensors (about 8.3 Hz each).
The app marks ESP32-generated data as dummy. Set the flag false and re-upload before
collecting real training data. Phone-only Try demo also uses exactly six sensors.

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
