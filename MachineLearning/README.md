# Training from TigerData

The training script reads timestamped TigerData samples from the tables created by
[`../database/ml_training.sql`](../database/ml_training.sql). It trains only on
manually labeled `dev_testing` runs (`good` or `bad`): two elbow flex channels and
acceleration/gyroscope X/Y/Z from each of four IMUs. It resamples those sensor
streams at 50 Hz and creates 128-frame (2.56-second) windows for a causal TCN.

## Configure and train

Apply [`../database/0002_add_run_source.sql`](../database/0002_add_run_source.sql)
after the base schema if it has not already been applied. The `source` column
distinguishes labeled Dev Testing captures from unlabeled Current Runs.
Apply [`../database/0003_tcn_sensor_layout.sql`](../database/0003_tcn_sensor_layout.sql)
to enforce the two-flex/four-IMU layout for new captures; historical samples are
preserved.

Use the TigerData credentials already configured for the cloud backend in
`mobile/cloudbackend/.env` (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`,
`DB_PASSWORD`). The script also accepts those variables from the environment.
Do not put database credentials in the mobile app or commit them.

From the repository root:

```powershell
python -m pip install -r MachineLearning/requirements.txt
python MachineLearning/train_model.py
```

The legacy `generate_fake_data.py` helper is not part of this pipeline; it writes
synthetic CSV data and must not be used to train or evaluate the TigerData model.

The connection uses TLS (`DB_SSLMODE=require` by default). Training ignores old
spine-flex and temperature/humidity samples. Each run must provide all six streams
and at least one complete 128-frame window. At least ten complete runs per label
are required just to run training; TCNs generally need substantially more varied
data for meaningful results. The pipeline splits whole runs, fits scaling only on
training windows, and reports held-out accuracy, per-class recall, and confusion
matrix. Overlapping windows from a run never appear in both splits. The returned
probability is a model score, not a calibrated confidence.

Weights (`running_model.pt`), scaler (`scaler.pkl`), and metadata
(`model_info.json`) are saved beside the script. Run the prediction API from this
directory with `uvicorn main:app --host 0.0.0.0 --port 8000`. `GET /model/info`
reports readiness; `POST /predict` accepts 128 frames with 26 ordered channels.
The mobile Run screen uses that API once a second after it has a complete fresh
window. Set `EXPO_PUBLIC_MODEL_API_URL` to a reachable HTTPS service URL. The
native Android app does not enable cleartext HTTP. Restart the API after
retraining.

Current run labels cover the entire run, although form can change inside a run.
For higher-quality supervision, add time-local labels or curate short segments
with consistently good or poor form; split evaluation by participant as well as
run before making claims about generalization.
