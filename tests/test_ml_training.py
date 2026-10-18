import json
import re
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import joblib
import pandas as pd
import torch
from fastapi import HTTPException

from MachineLearning import main as prediction_api
from MachineLearning import train_model as trainer
from MachineLearning.tcn_model import PostureTCN
from MachineLearning.train_model import (
    CHANNEL_NAMES,
    EPOCHS,
    MIN_RUNS_PER_LABEL,
    TRAINING_QUERY,
    prepare_sequences,
    split_by_run,
)


def sample_rows(runs_per_label=MIN_RUNS_PER_LABEL, seconds=3):
    rows = []
    base_time = datetime(2026, 1, 1, tzinfo=timezone.utc)
    for label_index, label in enumerate(("good", "bad")):
        for run_number in range(runs_per_label):
            run_id = f"{label}-{run_number}"
            offset = label_index * 5 + run_number / 100
            for tick in range(seconds * 50):
                captured_at = base_time + timedelta(milliseconds=tick * 20)
                for sensor_type, sensor_id in [(1, 0), (1, 1), (2, 0), (2, 1), (2, 2), (2, 3)]:
                    if sensor_type == 1:
                        reading = {"valid": True, "simulated": False, "resistanceOhms": 30000 + offset}
                    else:
                        reading = {
                            "valid": True,
                            "simulated": False,
                            "accelerationMps2": [offset, 9.81 + offset, 0.1 + offset],
                            "gyroRadps": [0.01 + offset, 0.02 + offset, 0.03 + offset],
                        }
                    rows.append({
                        "run_id": run_id,
                        "label": label,
                        "captured_at": captured_at,
                        "sensor_type": sensor_type,
                        "sensor_id": sensor_id,
                        "reading": reading,
                    })
    return pd.DataFrame(rows)


class FakeCursor:
    def __init__(self, data):
        self.data = data
        self.description = [SimpleNamespace(name=name) for name in data.columns]
        self.query = None

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return None

    def execute(self, query):
        self.query = query

    def fetchall(self):
        return list(self.data.itertuples(index=False, name=None))


class FakeConnection:
    def __init__(self, data):
        self.fake_cursor = FakeCursor(data)

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return None

    def cursor(self):
        return self.fake_cursor


class TcnTrainingTests(unittest.TestCase):
    def test_query_selects_only_new_layout_labeled_raw_sensor_samples(self):
        projection = TRAINING_QUERY.split("FROM", 1)[0]
        aliases = re.findall(r"\bAS\s+([a-z_][a-z_0-9]*)", projection)

        self.assertEqual(aliases, ["run_id"])
        self.assertIn("r.source = 'dev_testing'", TRAINING_QUERY)
        self.assertIn("s.sensor_type IN (1, 2)", TRAINING_QUERY)
        self.assertIn("s.sensor_id IN (0, 1)", TRAINING_QUERY)
        self.assertIn("s.sensor_id BETWEEN 0 AND 3", TRAINING_QUERY)
        self.assertNotIn("humidity", TRAINING_QUERY.lower())

    def test_resamples_six_sensor_streams_into_tcn_windows(self):
        sequences, labels, groups, run_counts, excluded = prepare_sequences(sample_rows(runs_per_label=10))

        self.assertEqual(sequences.shape[1:], (128, 26))
        self.assertEqual(set(labels), {0, 1})
        self.assertEqual(set(CHANNEL_NAMES[:2]), {"flex_left_ohms", "flex_right_ohms"})
        self.assertEqual(run_counts, {"good": 10, "bad": 10})
        self.assertEqual(excluded, 0)

    def test_incomplete_sensor_runs_are_excluded(self):
        rows = sample_rows(runs_per_label=MIN_RUNS_PER_LABEL + 1)
        rows = rows[~((rows.run_id == "good-0") & (rows.sensor_type == 1) & (rows.sensor_id == 0))]

        sequences, _, groups, run_counts, excluded = prepare_sequences(rows)

        self.assertNotIn("good-0", set(groups))
        self.assertEqual(run_counts["good"], MIN_RUNS_PER_LABEL)
        self.assertEqual(excluded, 1)
        self.assertEqual(sequences.shape[1:], (128, 26))

    def test_requires_enough_independent_runs_for_both_labels(self):
        with self.assertRaisesRegex(ValueError, "require at least"):
            prepare_sequences(sample_rows(runs_per_label=MIN_RUNS_PER_LABEL - 1))

    def test_split_keeps_overlapping_windows_from_a_run_together(self):
        sequences, labels, groups, _, _ = prepare_sequences(sample_rows(runs_per_label=10))
        train_indices, test_indices = split_by_run(labels, groups)

        self.assertEqual(sequences.shape[0], len(labels))
        self.assertFalse(set(groups[train_indices]) & set(groups[test_indices]))
        self.assertEqual(set(labels[train_indices]), {0, 1})
        self.assertEqual(set(labels[test_indices]), {0, 1})

    def test_tcn_uses_causal_temporal_convolutions_and_returns_one_logit_per_window(self):
        model = PostureTCN(input_channels=26)
        output = model(torch.zeros((3, 26, 128)))
        self.assertEqual(tuple(output.shape), (3,))

    def test_trains_from_database_samples_and_serves_a_window(self):
        rows = sample_rows(runs_per_label=MIN_RUNS_PER_LABEL)
        connection = FakeConnection(rows)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with (
                patch.object(trainer, "database_config", return_value={"host": "test"}),
                patch.object(trainer.psycopg, "connect", return_value=connection),
                patch.object(trainer, "MODEL_PATH", root / "running_model.pt"),
                patch.object(trainer, "SCALER_PATH", root / "scaler.pkl"),
                patch.object(trainer, "INFO_PATH", root / "model_info.json"),
                patch.object(trainer, "EPOCHS", min(EPOCHS, 1)),
            ):
                trainer.train()

            metadata = json.loads((root / "model_info.json").read_text(encoding="utf-8"))
            self.assertEqual(metadata["model_type"], "temporal_convolutional_network")
            self.assertTrue((root / "running_model.pt").exists())
            self.assertEqual(connection.fake_cursor.query, TRAINING_QUERY)
            model = PostureTCN(input_channels=len(CHANNEL_NAMES))
            model.load_state_dict(torch.load(root / "running_model.pt", weights_only=True))
            with (
                patch.object(prediction_api, "model", model.eval()),
                patch.object(prediction_api, "scaler", joblib.load(root / "scaler.pkl")),
                patch.object(prediction_api, "model_info", metadata),
            ):
                self.assertTrue(prediction_api.get_model_info()["ready"])
                frames = [[float(value) for value in row] for row in trainer.prepare_sequences(rows)[0][0]]
                result = prediction_api.predict_form(prediction_api.PredictionInput(frames=frames))
                self.assertIn(result["prediction"], (0, 1))
                self.assertTrue(0 <= result["confidence"] <= 1)
                with self.assertRaises(HTTPException) as error:
                    prediction_api.predict_form(prediction_api.PredictionInput(frames=[[0.0]]))
                self.assertEqual(error.exception.status_code, 422)


if __name__ == "__main__":
    unittest.main()
