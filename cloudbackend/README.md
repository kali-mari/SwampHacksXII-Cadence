# TigerData training-data API

This small API keeps TigerData credentials on the server. Never put the database
credentials in the mobile app or its Expo environment variables.

## Set up TigerData

Run [`../database/ml_training.sql`](../database/ml_training.sql) once in the
TigerData SQL console. It creates a run table with a `good`/`bad` label and a
JSONB sample table containing each timestamped sensor packet.

## Run locally

Copy `.env.example` to `.env` and fill in the TigerData connection values. Keep
`.env` private; it is git-ignored. Set `DB_SSLMODE=require` for Tiger Cloud's
connection format. PostgreSQL traffic remains TLS-encrypted, but this mode does
not verify the server certificate; use it only on a network you trust.
`verify-full` keeps certificate verification enabled when Node trusts the
appropriate CA. Set `COLLECTOR_API_KEY` to a long random development token.
Install dependencies and start the API:

```sh
npm install
npm start
```

The API listens on port 3000 by default, accepts `POST /api/runs`, and exposes
`GET /health` for a database connectivity check. The API validates and writes a
run and its samples in one transaction. It uses TLS to connect to TigerData.
`POST /api/runs` requires the matching bearer token; `/health` only checks database
connectivity. Expose the API through HTTPS before using it from a phone. This is a
developer collector, not a production authentication system: Expo embeds
`EXPO_PUBLIC_*` values in the app, so restrict access through a private network or
deployment-level access controls and do not use this shared token for sensitive
production data.

Every saved run has a `source`: `dev_testing` for a manually good/bad-labeled Dev
Testing capture, or `user_run` for an everyday Current Run (saved with `label: null`
until a trained model can infer it — the run's raw samples stay in `training_samples`
either way, so that inference step has data to work from). Run
[`../database/0002_add_run_source.sql`](../database/0002_add_run_source.sql) once,
after `ml_training.sql`, to add that column to an existing database.
Apply [`../database/0003_tcn_sensor_layout.sql`](../database/0003_tcn_sensor_layout.sql)
and [`../database/0004_streamed_captures.sql`](../database/0004_streamed_captures.sql)
afterward. The streamed-captures migration adds durable pending runs and batch
idempotency; it is required before deploying the current collector.

`GET /api/runs` (same bearer token) powers the **See past runs** screen. It returns
`{runs: [...]}`, newest first, each run's `startedAt`/`endedAt`/`label`/`source` plus
a `sensors` array of per-sensor averages computed in SQL over that run's samples —
see [`runs.mjs`](./runs.mjs) for the exact shape.

## Deploy the collector to Render

The repository includes [`../render.yaml`](../render.yaml) for a free Render web
service. In Render, create a **Blueprint** from this repository and provide the
TigerData `DB_HOST`, `DB_USER`, and `DB_PASSWORD` values when prompted. The
blueprint generates `COLLECTOR_API_KEY` for the collector. Keep all database
credentials and the collector key in Render's environment settings; never add
them to Git or put database credentials in the mobile app.

After deployment, copy the service's HTTPS `onrender.com` URL and the generated
collector key into the Expo app's build environment as described below. Free
Render services can sleep when idle, so the first health check or upload may
take longer while the service wakes up. `/health` also verifies the TigerData
connection.

The blueprint sets `DB_SSLMODE=require`: traffic to TigerData remains
TLS-encrypted, but this setting does not verify the database server certificate.
Use it only if required by the TigerData connection endpoint; do not disable TLS.

## Configure the mobile collector

For local Expo development, copy `../mobile/.env.example` to `../mobile/.env`,
set `EXPO_PUBLIC_API_URL` to the deployed HTTPS collector origin and
`EXPO_PUBLIC_COLLECTOR_API_KEY` to the same key configured in Render, then
restart Expo. For an EAS build, set those variables in the EAS environment used
by the Android development build before building/rebuilding the APK. They are
build-time settings; the app has no URL or token entry fields. Do not use the
TigerData Console URL.

The app creates a pending run before capture and uploads valid, non-simulated
Bluetooth samples to TigerData in ordered batches while recording. Tapping
**Save** (or **Save** with a good/bad label in Dev Testing) finalizes the cloud
run and attaches its label. Pending or interrupted runs remain excluded from
training until finalized; **Discard** deletes the pending cloud run. Keep the
app open through the final save confirmation.
