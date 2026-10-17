# SwampHacksXII-Posture-Check
SwampHacks XII 36-hour hackathon project

kawi kawista ethan ander

## Wearable firmware

Start with [hardware wiring and setup](docs/HARDWARE_AND_FIRMWARE.md).
Open `esp32/esp32.ino` in Arduino IDE. The default configuration enables four
MPU6050s and two SHT40s on two independent I2C buses, plus three 10k flex dividers
(left elbow on GPIO13, right elbow on A1, spine on A2). No multiplexer is needed.
Bus 0 uses SDA=GPIO3/SCL=GPIO4; bus 1 uses SDA=GPIO5/SCL=GPIO6.
The guide covers wiring, individual sensor IDs, single-flex bench mode, React Native
integration, the database boundary, and a form-model development plan.

Run decoder checks with `node --test tests/protocol.test.mjs`.
