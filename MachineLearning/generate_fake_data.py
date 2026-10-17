import random
import time
import requests

# Your local FastAPI endpoint URL
URL = "http://127.0.0.1:8000/log-run-data"

run_id = "mock_run_session_001"
base_timestamp = int(time.time())

print("Generating and sending mock sensor data to FastAPI...")

for i in range(50):
    # Randomly decide if this moment is Good Form (0) or Poor Form (1)
    is_poor_form = random.choice([0, 1])
    
    if is_poor_form == 0:
        # Good form: steady acceleration, lower flex angle, stable humidity
        packet = {
            "timestamp": base_timestamp + i,
            "run_id": run_id,
            "label": 0,
            "imu_accel_xl": round(random.uniform(-0.2, 0.2), 2),
            "imu_accel_yl": round(random.uniform(9.6, 10.0), 2),
            "imu_accel_zl": round(random.uniform(-0.5, 0.5), 2),
            "imu_accel_xr": round(random.uniform(-0.2, 0.2), 2),
            "imu_accel_yr": round(random.uniform(9.6, 10.0), 2),
            "imu_accel_zr": round(random.uniform(-0.5, 0.5), 2),
            "flex_sensor_l": round(random.uniform(300.0, 400.0), 1),
            "flex_sensor_r": round(random.uniform(300.0, 400.0), 1),
            "flex_sensor_spine": round(random.uniform(300.0, 400.0), 1),
            "humidity": round(random.uniform(40.0, 45.0), 1)
        }
    else:
        # Poor form: erratic acceleration, high flex angle (slouching), higher humidity
        packet = {
            "timestamp": base_timestamp + i,
            "run_id": run_id,
            "label": 1,
            "imu_accel_xl": round(random.uniform(-1.5, 1.5), 2),
            "imu_accel_yl": round(random.uniform(8.0, 11.5), 2),
            "imu_accel_zl": round(random.uniform(-2.0, 2.0), 2),
            "imu_accel_xr": round(random.uniform(-1.5, 1.5), 2),
            "imu_accel_yr": round(random.uniform(8.0, 11.5), 2),
            "imu_accel_zr": round(random.uniform(-2.0, 2.0), 2),
            "flex_sensor_l": round(random.uniform(550.0, 750.0), 1),
            "flex_sensor_r": round(random.uniform(550.0, 750.0), 1),
            "flex_sensor_spine": round(random.uniform(550.0, 750.0), 1),
            "humidity": round(random.uniform(50.0, 65.0), 1)
        }

    # Send the packet to your FastAPI app
    response = requests.post(URL, json=packet)
    print(f"Packet {i+1}/50 sent -> Status: {response.status_code}")

print("Done! Check your MachineLearning folder for 'run_training_data.csv'.")