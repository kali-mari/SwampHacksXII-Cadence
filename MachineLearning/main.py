import json
import logging
import math
from pathlib import Path

import joblib
import numpy as np
import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

if __package__:
    from .tcn_model import PostureTCN
else:
    from tcn_model import PostureTCN

ROOT = Path(__file__).resolve().parent
MODEL_PATH = ROOT / "running_model.pt"
SCALER_PATH = ROOT / "scaler.pkl"
INFO_PATH = ROOT / "model_info.json"
app = FastAPI(title="Posture Check TCN API")
logger = logging.getLogger(__name__)
model = None
scaler = None
model_info = None

try:
    if MODEL_PATH.exists() and SCALER_PATH.exists() and INFO_PATH.exists():
        loaded_info = json.loads(INFO_PATH.read_text(encoding="utf-8"))
        if loaded_info.get("model_type") != "temporal_convolutional_network":
            raise ValueError("Saved model is not a trained TCN.")
        loaded_scaler = joblib.load(SCALER_PATH)
        loaded_model = PostureTCN(input_channels=len(loaded_info["channel_names"]))
        state = torch.load(MODEL_PATH, map_location="cpu", weights_only=True)
        loaded_model.load_state_dict(state)
        loaded_model.eval()
        model_info = loaded_info
        scaler = loaded_scaler
        model = loaded_model
        logger.info("Loaded posture TCN %s", model_info["model_version"])
    else:
        logger.warning("TigerData-trained TCN artifacts are not available. Train the model first.")
except (OSError, ValueError, KeyError, EOFError, json.JSONDecodeError, RuntimeError):
    logger.exception("Could not load TCN model artifacts.")
    model = None
    scaler = None
    model_info = None


class PredictionInput(BaseModel):
    frames: list[list[float]]


@app.get("/model/info")
def get_model_info():
    if model is None or scaler is None or model_info is None:
        return {
            "ready": False,
            "status": "not_ready",
            "message": "TigerData-trained TCN artifacts are not available. Train the model first.",
        }
    return {"ready": True, "status": "ready", **model_info}


@app.post("/predict")
def predict_form(data: PredictionInput):
    if model is None or scaler is None or model_info is None:
        raise HTTPException(status_code=503, detail="TCN model artifacts are not available. Train the model first.")

    window_size = model_info["window_size"]
    channel_count = len(model_info["channel_names"])
    if len(data.frames) != window_size or any(len(frame) != channel_count for frame in data.frames):
        raise HTTPException(
            status_code=422,
            detail=f"Expected {window_size} frames with {channel_count} sensor channels each.",
        )
    if not all(math.isfinite(value) for frame in data.frames for value in frame):
        raise HTTPException(status_code=422, detail="Frame values must be finite numbers.")

    try:
        frames = np.asarray(data.frames, dtype=np.float32)
        scaled = scaler.transform(frames)
        tensor = torch.from_numpy(scaled.T.copy()).unsqueeze(0)
        with torch.no_grad():
            probability = float(torch.sigmoid(model(tensor))[0].item())
        prediction = int(probability >= 0.5)
        confidence = probability if prediction else 1.0 - probability
        return {
            "prediction": prediction,
            "form_status": "Poor Form / At-Risk" if prediction else "Good Form",
            "confidence": round(confidence, 4),
            "poor_form_probability": round(probability, 4),
            "model_version": model_info["model_version"],
        }
    except (ValueError, RuntimeError) as error:
        raise HTTPException(status_code=422, detail=f"Invalid sensor window: {error}") from error
