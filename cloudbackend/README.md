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

## Configure the mobile collector

Copy `../mobile/.env.example` to `../mobile/.env`, set `EXPO_PUBLIC_API_URL` to the
reachable HTTPS API URL and `EXPO_PUBLIC_COLLECTOR_API_KEY` to the same development
token, then restart Expo. The collector page can also be given the API URL directly.
The app buffers a run in memory and uploads it only after you stop recording and
select **Save as good** or **Save as bad**. Only valid, non-simulated Bluetooth
readings are included; leaving the app before saving loses the unsaved run.
