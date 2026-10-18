import random
import time
import pandas as pd
import os

CSV_FILE = "run_training_data.csv"
run_id = "mock_run_session_001"
base_timestamp = int(time.time())

print("Generating mock sensor data locally with active IMU & Humidity patterns...")

packets = []

for i in range(1500):
    # Randomly decide if this moment is Good Form (0) or Poor Form (1)
    is_poor_form = random.choice([0, 1])
    
    if is_poor_form == 0:
        # --- GOOD FORM ---
        # Stable acceleration, minimal gyro rotation, low flex, stable humidity
        packet = {
            "timestamp": base_timestamp + i,
            "run_id": run_id,
            "label": 0,
            # IMU 1 Accelerometers (Stable)
            "imu_accel_xl1": round(random.uniform(-0.2, 0.2), 2),
            "imu_accel_yl1": round(random.uniform(9.6, 10.0), 2),
            "imu_accel_zl1": round(random.uniform(-0.5, 0.5), 2),
            "imu_accel_xr1": round(random.uniform(-0.2, 0.2), 2),
            "imu_accel_yr1": round(random.uniform(9.6, 10.0), 2),
            "imu_accel_zr1": round(random.uniform(-0.5, 0.5), 2),
            # IMU 2 Accelerometers (Stable)
            "imu_accel_xl2": round(random.uniform(-0.2, 0.2), 2),
            "imu_accel_yl2": round(random.uniform(9.6, 10.0), 2),
            "imu_accel_zl2": round(random.uniform(-0.5, 0.5), 2),
            "imu_accel_xr2": round(random.uniform(-0.2, 0.2), 2),
            "imu_accel_yr2": round(random.uniform(9.6, 10.0), 2),
            "imu_accel_zr2": round(random.uniform(-0.5, 0.5), 2),
            # IMU 1 Gyroscopes (Low rotation/wobble)
            "imu_gyro_xl1": round(random.uniform(-0.5, 0.5), 2),
            "imu_gyro_yl1": round(random.uniform(-0.5, 0.5), 2),
            "imu_gyro_zl1": round(random.uniform(-0.5, 0.5), 2),
            "imu_gyro_xr1": round(random.uniform(-0.5, 0.5), 2),
            "imu_gyro_yr1": round(random.uniform(-0.5, 0.5), 2),
            "imu_gyro_zr1": round(random.uniform(-0.5, 0.5), 2),
            # IMU 2 Gyroscopes (Low rotation/wobble)
            "imu_gyro_xl2": round(random.uniform(-0.5, 0.5), 2),
            "imu_gyro_yl2": round(random.uniform(-0.5, 0.5), 2),
            "imu_gyro_zl2": round(random.uniform(-0.5, 0.5), 2),
            "imu_gyro_xr2": round(random.uniform(-0.5, 0.5), 2),
            "imu_gyro_yr2": round(random.uniform(-0.5, 0.5), 2),
            "imu_gyro_zr2": round(random.uniform(-0.5, 0.5), 2),
            # Flex Sensors (Upright posture)
            "flex_sensor_l": round(random.uniform(300.0, 400.0), 1),
            "flex_sensor_r": round(random.uniform(300.0, 400.0), 1),
            "flex_sensor_spine": round(random.uniform(300.0, 400.0), 1),
            # Humidity (Normal sweat levels)
            "Inside humidity": round(random.uniform(40.0, 45.0), 1),
            "Outside humidity": round(random.uniform(40.0, 45.0), 1),
        }
    else:
        # --- POOR FORM ---
        # Erratic acceleration spikes, high gyro wobble, deep flex, higher humidity
        packet = {
            "timestamp": base_timestamp + i,
            "run_id": run_id,
            "label": 1,
            # IMU 1 Accelerometers (Erratic/High Bounce)
            "imu_accel_xl1": round(random.uniform(-1.5, 1.5), 2),
            "imu_accel_yl1": round(random.uniform(7.5, 12.0), 2),
            "imu_accel_zl1": round(random.uniform(-2.0, 2.0), 2),
            "imu_accel_xr1": round(random.uniform(-1.5, 1.5), 2),
            "imu_accel_yr1": round(random.uniform(7.5, 12.0), 2),
            "imu_accel_zr1": round(random.uniform(-2.0, 2.0), 2),
            # IMU 2 Accelerometers (Erratic/High Bounce)
            "imu_accel_xl2": round(random.uniform(-1.5, 1.5), 2),
            "imu_accel_yl2": round(random.uniform(7.5, 12.0), 2),
            "imu_accel_zl2": round(random.uniform(-2.0, 2.0), 2),
            "imu_accel_xr2": round(random.uniform(-1.5, 1.5), 2),
            "imu_accel_yr2": round(random.uniform(7.5, 12.0), 2),
            "imu_accel_zr2": round(random.uniform(-2.0, 2.0), 2),
            # IMU 1 Gyroscopes (High unstable body wobble)
            "imu_gyro_xl1": round(random.uniform(-2.5, 2.5), 2),
            "imu_gyro_yl1": round(random.uniform(-2.5, 2.5), 2),
            "imu_gyro_zl1": round(random.uniform(-2.5, 2.5), 2),
            "imu_gyro_xr1": round(random.uniform(-2.5, 2.5), 2),
            "imu_gyro_yr1": round(random.uniform(-2.5, 2.5), 2),
            "imu_gyro_zr1": round(random.uniform(-2.5, 2.5), 2),
            # IMU 2 Gyroscopes (High unstable body wobble)
            "imu_gyro_xl2": round(random.uniform(-2.5, 2.5), 2),
            "imu_gyro_yl2": round(random.uniform(-2.5, 2.5), 2),
            "imu_gyro_zl2": round(random.uniform(-2.5, 2.5), 2),
            "imu_gyro_xr2": round(random.uniform(-2.5, 2.5), 2),
            "imu_gyro_yr2": round(random.uniform(-2.5, 2.5), 2),
            "imu_gyro_zr2": round(random.uniform(-2.5, 2.5), 2),
            # Flex Sensors (Slouching / Forward hunch)
            "flex_sensor_l": round(random.uniform(550.0, 750.0), 1),
            "flex_sensor_r": round(random.uniform(550.0, 750.0), 1),
            "flex_sensor_spine": round(random.uniform(550.0, 750.0), 1),
            # Humidity (Higher sweat accumulation from fatigue)
            "Inside humidity": round(random.uniform(55.0, 75.0), 1),
            "Outside humidity": round(random.uniform(40.0, 48.0), 1),
        }
    packets.append(packet)

# Overwrite or create fresh CSV dataset
df_new = pd.DataFrame(packets)
df_new.to_csv(CSV_FILE, index=False)

print(f"Done! Generated and saved 1500 mock rows with active patterns to '{CSV_FILE}'.")