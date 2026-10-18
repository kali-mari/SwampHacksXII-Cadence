# TigerData training-data API

This small API keeps TigerData credentials on the server. Never put the database
credentials in the mobile app or its Expo environment variables.

## Set up TigerData

Run [`../database/ml_training.sql`](../database/ml_training.sql) once in the
TigerData SQL console. It creates a run table with a `good`/`bad` label and a
JSONB sample table containing each timestamped sensor packet.

## Run locally

Copy `.env.example` to `.env` and fill in the TigerData connection values. Keep
`.env` private; it is git-ignored. Set `COLLECTOR_API_KEY` to a long random
development token. Install dependencies and start the API:

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

`GET /api/runs` (same bearer token) powers the **See past runs** screen. It returns
`{runs: [...]}`, newest first, each run's `startedAt`/`endedAt`/`label`/`source` plus
a `sensors` array of per-sensor averages computed in SQL over that run's samples —
see [`runs.mjs`](./runs.mjs) for the exact shape.

## Configure the mobile collector

Copy `../mobile/.env.example` to `../mobile/.env`, set `EXPO_PUBLIC_API_URL` to the
reachable HTTPS API URL and `EXPO_PUBLIC_COLLECTOR_API_KEY` to the same development
token, then restart Expo. The API URL can also be edited from the Current Run,
Dev Testing, or Past Runs screen. The app buffers a run in memory and uploads
it after you stop recording and select **Save run** (Current Run) or choose
**Save** with a good/bad label (Dev Testing). Only valid, non-simulated Bluetooth
readings are included; leaving the app before saving loses the unsaved run.
