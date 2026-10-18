from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import pandas as pd
import os
import joblib

app = FastAPI()

# Load the trained model and scaler when the FastAPI server starts up
MODEL_PATH = "running_model.pkl"
SCALER_PATH = "scaler.pkl"

model = None
scaler = None

if os.path.exists(MODEL_PATH) and os.path.exists(SCALER_PATH):
    model = joblib.load(MODEL_PATH)
    scaler = joblib.load(SCALER_PATH)
    print("Loaded trained machine learning model and scaler successfully!")
else:
    print("Warning: Model or scaler files not found. Run 'train_model.py' first.")

# 1. Schema for logging raw run data to CSV
class SensorDataPacket(BaseModel):
    timestamp: int
    run_id: str
    label: int  # 0 for Good, 1 for Poor Form
    imu_accel_xl: float
    imu_accel_yl: float
    imu_accel_zl: float
    imu_accel_xr: float
    imu_accel_yr: float
    imu_accel_zr: float
    flex_sensor_l: float
    flex_sensor_r: float
    flex_sensor_spine: float
    humidity: float

CSV_FILE = "run_training_data.csv"

@app.post("/log-run-data")
async def log_run_data(data: SensorDataPacket):
    try:
        df_new = pd.DataFrame([data.model_dump()])
        file_exists = os.path.exists(CSV_FILE)
        df_new.to_csv(CSV_FILE, mode='a', header=not file_exists, index=False)
        return {"status": "success", "message": "Sensor data appended to CSV!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# 2. Schema for incoming live sensor data for real-time predictions
class PredictionInput(BaseModel):
    imu_accel_xl: float
    imu_accel_yl: float
    imu_accel_zl: float
    imu_accel_xr: float
    imu_accel_yr: float
    imu_accel_zr: float
    flex_sensor_l: float
    flex_sensor_r: float
    flex_sensor_spine: float
    humidity: float

@app.post("/predict")
async def predict_form(data: PredictionInput):
    if model is None or scaler is None:
        raise HTTPException(status_code=500, detail="ML model or scaler is not loaded on the server. Train the model first.")
    
    try:
        # Convert incoming data into a DataFrame matching the model's expected features
        input_data = pd.DataFrame([{
            "imu_accel_xl1": data.imu_accel_xl1,
            "imu_accel_yl1": data.imu_accel_yl1,
            "imu_accel_zl1": data.imu_accel_zl1,
            "imu_accel_xr1": data.imu_accel_xr1,
            "imu_accel_yr1": data.imu_accel_yr1,
            "imu_accel_zr1": data.imu_accel_zr1,
            "imu_accel_xl2": data.imu_accel_xl2,
            "imu_accel_yl2": data.imu_accel_yl2,
            "imu_accel_zl2": data.imu_accel_zl2,
            "imu_accel_xr2": data.imu_accel_xr2,
            "imu_accel_yr2": data.imu_accel_yr2,
            "imu_accel_zr2": data.imu_accel_zr2,
            "imu_gyro_xl1": data.imu_gyro_xl1,
            "imu_gyro_yl1": data.imu_gyro_yl1,
            "imu_gyro_zl1": data.imu_gyro_zl1,
            "imu_gyro_xr1": data.imu_gyro_xr1,
            "imu_gyro_yr1": data.imu_gyro_yr1,
            "imu_gyro_zr1": data.imu_gyro_zr1,
            "imu_gyro_xl2": data.imu_gyro_xl2,
            "imu_gyro_yl2": data.imu_gyro_yl2,
            "imu_gyro_zl2": data.imu_gyro_zl2,
            "imu_gyro_xr2": data.imu_gyro_xr2,
            "imu_gyro_yr2": data.imu_gyro_yr2,
            "imu_gyro_zr2": data.imu_gyro_zr2,
            "flex_sensor_l": data.flex_sensor_l,
            "flex_sensor_r": data.flex_sensor_r,
            "flex_sensor_spine": data.flex_sensor_spine,
            "Inside humidity": data.humidity,
            "Outside humidity": data.humidity
        }])
        
        # Scale the features using your saved scaler
        scaled_features = scaler.transform(input_data)
        
        # Predict using your trained Random Forest model
        prediction = model.predict(scaled_features)[0]
        prediction_proba = model.predict_proba(scaled_features)[0].tolist()
        
        # Map output to human-readable form status
        form_status = "Poor Form / At-Risk" if prediction == 1 else "Good Form"
        
        return {
            "prediction": int(prediction),
            "form_status": form_status,
            "confidence": round(max(prediction_proba), 2)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))