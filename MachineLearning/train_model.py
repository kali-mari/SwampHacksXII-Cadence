import json
import os
import random
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import psycopg
import torch
from dotenv import load_dotenv
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, recall_score
from sklearn.model_selection import GroupShuffleSplit
from sklearn.preprocessing import StandardScaler
from torch import nn
from torch.utils.data import DataLoader, TensorDataset

if __package__:
    from .tcn_model import PostureTCN
else:
    from tcn_model import PostureTCN

ROOT = Path(__file__).resolve().parent
MODEL_PATH = ROOT / "running_model.pt"
SCALER_PATH = ROOT / "scaler.pkl"
INFO_PATH = ROOT / "model_info.json"
MIN_RUNS_PER_LABEL = 10
WINDOW_SIZE = 128
WINDOW_STRIDE = 32
SAMPLE_PERIOD_MS = 20
EPOCHS = 30
CHANNEL_NAMES = [
    "flex_left_ohms",
    "flex_right_ohms",
    *[
        f"imu_{sensor}_{kind}_{axis}"
        for sensor in range(4)
        for kind in ("accel", "gyro")
        for axis in "xyz"
    ],
]
SENSOR_CHANNELS = {
    (1, 0): ("flex_left_ohms",),
    (1, 1): ("flex_right_ohms",),
    **{
        (2, sensor): tuple(
            f"imu_{sensor}_{kind}_{axis}"
            for kind in ("accel", "gyro")
            for axis in "xyz"
        )
        for sensor in range(4)
    },
}

TRAINING_QUERY = """
SELECT r.run_id::text AS run_id, r.label, s.captured_at,
       s.sensor_type, s.sensor_id, s.reading
FROM training_runs AS r
JOIN training_samples AS s ON s.run_id = r.run_id
WHERE r.label IN ('good', 'bad')
  AND r.source = 'dev_testing'
  AND r.status = 'complete'
  AND s.sensor_type IN (1, 2)
  AND ((s.sensor_type = 1 AND s.sensor_id IN (0, 1))
       OR (s.sensor_type = 2 AND s.sensor_id BETWEEN 0 AND 3))
  AND s.reading->>'valid' = 'true'
  AND COALESCE(s.reading->>'simulated', 'false') = 'false'
ORDER BY r.run_id, s.captured_at
"""


def database_config():
    load_dotenv(ROOT.parent / "mobile" / "cloudbackend" / ".env")
    required = ("DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD")
    missing = [name for name in required if not os.environ.get(name)]
    if missing:
        raise RuntimeError(
            "Missing TigerData connection settings: "
            + ", ".join(missing)
            + ". Set them in mobile/cloudbackend/.env or the environment."
        )
    return {
        "host": os.environ["DB_HOST"],
        "port": int(os.environ.get("DB_PORT", "5432")),
        "dbname": os.environ["DB_NAME"],
        "user": os.environ["DB_USER"],
        "password": os.environ["DB_PASSWORD"],
        "sslmode": os.environ.get("DB_SSLMODE", "require"),
        "connect_timeout": 10,
        "application_name": "posture-check-tcn-training",
    }


def fetch_training_data(connection):
    with connection.cursor() as cursor:
        cursor.execute(TRAINING_QUERY)
        columns = [column.name for column in cursor.description]
        return pd.DataFrame(cursor.fetchall(), columns=columns)


def _sample_channels(row):
    sensor = (int(row.sensor_type), int(row.sensor_id))
    names = SENSOR_CHANNELS.get(sensor)
    if names is None:
        return None
    reading = row.reading
    if isinstance(reading, str):
        reading = json.loads(reading)
    if not isinstance(reading, dict):
        return None
    if reading.get("source") == "imu_fallback":
        return None
    if sensor[0] == 1:
        values = [reading.get("resistanceOhms")]
    else:
        acceleration = reading.get("accelerationMps2")
        gyro = reading.get("gyroRadps")
        if not isinstance(acceleration, list) or len(acceleration) != 3:
            return None
        if not isinstance(gyro, list) or len(gyro) != 3:
            return None
        values = [*acceleration, *gyro]
    try:
        numeric = [float(value) for value in values]
    except (TypeError, ValueError):
        return None
    return dict(zip(names, numeric))


def run_to_frames(run_rows):
    records = []
    for row in run_rows.itertuples(index=False):
        channels = _sample_channels(row)
        if channels is None or not np.isfinite(list(channels.values())).all():
            continue
        records.append({"captured_at": row.captured_at, **channels})
    if not records:
        return np.empty((0, len(CHANNEL_NAMES)), dtype=np.float32)

    samples = pd.DataFrame(records)
    samples["captured_at"] = pd.to_datetime(samples["captured_at"], utc=True, errors="coerce")
    samples = samples.dropna(subset=["captured_at"]).set_index("captured_at")
    if samples.empty:
        return np.empty((0, len(CHANNEL_NAMES)), dtype=np.float32)
    samples = samples.reindex(columns=CHANNEL_NAMES).sort_index()
    samples = samples.groupby(level=0).mean()
    sampled = samples.resample(f"{SAMPLE_PERIOD_MS}ms").mean()
    sampled = sampled.interpolate(method="time", limit=2, limit_area="inside").ffill(limit=2).bfill(limit=2)
    values = sampled[CHANNEL_NAMES].to_numpy(dtype=np.float32)
    finite = np.isfinite(values).all(axis=1)

    frames = []
    start = None
    for index, is_finite in enumerate(finite):
        if is_finite and start is None:
            start = index
        if start is not None and (not is_finite or index == len(finite) - 1):
            end = index if not is_finite else index + 1
            segment = values[start:end]
            for offset in range(0, len(segment) - WINDOW_SIZE + 1, WINDOW_STRIDE):
                frames.append(segment[offset:offset + WINDOW_SIZE])
            start = None
    if not frames:
        return np.empty((0, WINDOW_SIZE, len(CHANNEL_NAMES)), dtype=np.float32)
    return np.stack(frames)


def prepare_sequences(sample_rows):
    required = {"run_id", "label", "captured_at", "sensor_type", "sensor_id", "reading"}
    missing = sorted(required - set(sample_rows.columns))
    if missing:
        raise ValueError(f"TigerData query is missing columns: {', '.join(missing)}")
    if sample_rows.empty:
        raise ValueError("TigerData has no labeled Dev Testing sensor samples.")
    if sample_rows.groupby("run_id")["label"].nunique().gt(1).any():
        raise ValueError("A run has multiple labels; each run must have one human-assigned label.")

    sequences, labels, groups = [], [], []
    incomplete = 0
    for run_id, run_rows in sample_rows.groupby("run_id", sort=False):
        label = str(run_rows["label"].iloc[0]).lower()
        if label not in ("good", "bad"):
            raise ValueError(f"Run {run_id} has an invalid label: {label}")
        windows = run_to_frames(run_rows)
        if not len(windows):
            incomplete += 1
            continue
        sequences.extend(windows)
        labels.extend([0 if label == "good" else 1] * len(windows))
        groups.extend([str(run_id)] * len(windows))

    run_labels = sample_rows[["run_id", "label"]].drop_duplicates()
    valid_run_labels = {str(run_id): str(label).lower() for run_id, label in run_labels.itertuples(index=False)}
    complete_runs = set(groups)
    valid_run_labels = {run_id: label for run_id, label in valid_run_labels.items() if run_id in complete_runs}
    run_counts = {label: sum(value == label for value in valid_run_labels.values()) for label in ("good", "bad")}
    if min(run_counts.values()) < MIN_RUNS_PER_LABEL:
        raise ValueError(
            f"Not enough complete labeled runs for TCN training: require at least "
            f"{MIN_RUNS_PER_LABEL} runs per class; available good={run_counts['good']}, "
            f"bad={run_counts['bad']}. Runs need at least {WINDOW_SIZE} valid 50 Hz frames."
        )
    return (
        np.asarray(sequences, dtype=np.float32),
        np.asarray(labels, dtype=np.int64),
        np.asarray(groups),
        run_counts,
        incomplete,
    )


def split_by_run(labels, groups):
    splitter = GroupShuffleSplit(n_splits=200, test_size=0.2, random_state=42)
    for train_indices, test_indices in splitter.split(np.zeros(len(labels)), labels, groups):
        if set(labels[train_indices]) == {0, 1} and set(labels[test_indices]) == {0, 1}:
            return train_indices, test_indices
    raise ValueError("Could not split whole runs into train/test sets with both labels.")


def train():
    random.seed(42)
    np.random.seed(42)
    torch.manual_seed(42)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    with psycopg.connect(**database_config()) as connection:
        sample_rows = fetch_training_data(connection)
    sequences, labels, groups, run_counts, incomplete = prepare_sequences(sample_rows)
    print(
        f"TigerData: {sum(run_counts.values())} complete runs "
        f"(good={run_counts['good']}, bad={run_counts['bad']}), "
        f"{len(sequences)} windows, {incomplete} runs excluded."
    )

    train_indices, test_indices = split_by_run(labels, groups)
    train_sequences, test_sequences = sequences[train_indices], sequences[test_indices]
    train_labels, test_labels = labels[train_indices], labels[test_indices]
    scaler = StandardScaler()
    scaler.fit(train_sequences.reshape(-1, len(CHANNEL_NAMES)))
    train_sequences = scaler.transform(train_sequences.reshape(-1, len(CHANNEL_NAMES))).reshape(train_sequences.shape)
    test_sequences = scaler.transform(test_sequences.reshape(-1, len(CHANNEL_NAMES))).reshape(test_sequences.shape)

    train_x = torch.from_numpy(train_sequences).transpose(1, 2)
    train_y = torch.from_numpy(train_labels.astype(np.float32))
    train_loader = DataLoader(TensorDataset(train_x, train_y), batch_size=32, shuffle=True)
    model = PostureTCN(input_channels=len(CHANNEL_NAMES)).to(device)
    positives = max(1, int(train_labels.sum()))
    negatives = max(1, len(train_labels) - positives)
    loss_fn = nn.BCEWithLogitsLoss(pos_weight=torch.tensor([negatives / positives], device=device))
    optimizer = torch.optim.AdamW(model.parameters(), lr=0.001, weight_decay=0.0001)

    model.train()
    for epoch in range(EPOCHS):
        total_loss = 0.0
        for batch_x, batch_y in train_loader:
            batch_x, batch_y = batch_x.to(device), batch_y.to(device)
            optimizer.zero_grad(set_to_none=True)
            loss = loss_fn(model(batch_x), batch_y)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()
            total_loss += float(loss.detach().cpu())
        print(f"Epoch {epoch + 1:02d}/{EPOCHS} - loss: {total_loss / max(1, len(train_loader)):.4f}")

    model.eval()
    with torch.no_grad():
        logits = model(torch.from_numpy(test_sequences).transpose(1, 2).to(device))
        probabilities = torch.sigmoid(logits).cpu().numpy()
    predictions = (probabilities >= 0.5).astype(np.int64)
    metrics = {
        "accuracy": round(float(accuracy_score(test_labels, predictions)), 4),
        "good_recall": round(float(recall_score(test_labels, predictions, pos_label=0)), 4),
        "bad_recall": round(float(recall_score(test_labels, predictions, pos_label=1)), 4),
        "confusion_matrix": confusion_matrix(test_labels, predictions, labels=[0, 1]).tolist(),
        "classification_report": classification_report(
            test_labels, predictions, labels=[0, 1], target_names=["good", "bad"], output_dict=True, zero_division=0
        ),
        "test_run_count": int(len(set(groups[test_indices]))),
        "test_window_count": int(len(test_indices)),
    }
    model_info = {
        "model_type": "temporal_convolutional_network",
        "model_version": datetime.now(timezone.utc).strftime("posture-tcn-%Y%m%dT%H%M%SZ"),
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "source": "TigerData training_runs/training_samples",
        "dataset_run_count": int(sum(run_counts.values())),
        "training_run_count": int(len(set(groups[train_indices]))),
        "run_counts_by_label": run_counts,
        "excluded_incomplete_runs": incomplete,
        "window_size": WINDOW_SIZE,
        "sample_period_ms": SAMPLE_PERIOD_MS,
        "channel_names": CHANNEL_NAMES,
        "classes": ["good", "bad"],
        "metrics": metrics,
    }
    torch.save(model.state_dict(), MODEL_PATH)
    joblib.dump(scaler, SCALER_PATH)
    INFO_PATH.write_text(json.dumps(model_info, indent=2), encoding="utf-8")
    print(f"Saved TCN weights, scaler, and metadata in {ROOT}")
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    try:
        train()
    except (OSError, ValueError, RuntimeError, psycopg.Error) as error:
        raise SystemExit(f"Training failed: {error}") from error
