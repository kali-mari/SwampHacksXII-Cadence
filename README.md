# SwampHacksXII-Cadence
SwampHacks XII 36-hour hackathon project

kawi kawista ethan ander

## Android Bluetooth app

The Expo app lives in `mobile/`. See [mobile setup](mobile/README.md) for Android EAS
development builds and live Bluetooth sensor intake. With Node 24 LTS,
run `cd mobile`, `npm install`, then `npm start`.

## Current hardware

Four MPU6050s and two elbow flex sensors; real acquisition is enabled.
Left elbow uses A0/GPIO18, right elbow A1/GPIO17, each with its own 10k divider.
IMU bus 0 uses GPIO3/GPIO4; bus 1 uses GPIO5/GPIO6. On each bus, set one IMU's
AD0 low (0x68) and the other's high (0x69). See [wiring and initialization](docs/HARDWARE_AND_FIRMWARE.md).
Build/upload from the repository root with PlatformIO, then reload the Android
app's JavaScript from Metro. Its dashboard expects six sensors.



zzzz
