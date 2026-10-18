# What's new

Drop these files into the repo at the same paths (they replace the old
single-file `mobile/App.js` and add a few new ones). Nothing in `esp32/` changes.

## New structure
- `mobile/App.js` — now a 5-screen router, not the whole app.
- `mobile/theme.js`, `mobile/components.js` — shared styles/Button/SensorCard,
  pulled out of the old App.js.
- `mobile/useShirtConnection.js` — the BLE/demo/run-capture logic, pulled out of
  the old App.js so all five screens share one connection.
- `mobile/screens/HomeScreen.js` — start-run circle + Calibrate / Dev Testing /
  See past runs tiles.
- `mobile/screens/CurrentRunScreen.js` — start/stop/save a normal run (no label).
- `mobile/screens/DevTestingScreen.js` — good/bad label toggle, start/stop, live
  readouts, save to cloud (this replaces the old "Developer data capture" page).
- `mobile/screens/CalibrateScreen.js` — live stick figure from the flex sensors +
  a "set neutral" baseline. Placeholder for the Blender model — see the comment
  at the top of the figure's render for the swap-in point.
- `mobile/screens/PastRunsScreen.js` — fetches `GET /api/runs`, shows date +
  per-sensor averages + good/bad/pending.

## Backend
- `cloudbackend/server.mjs` — `POST /api/runs` now stores a `source`
  (`dev_testing` or `user_run`); added `GET /api/runs`, which aggregates each
  run's samples into per-sensor averages in SQL.
- `cloudbackend/runs.mjs` — new, pure row-grouping helper behind `GET /api/runs`
  (unit-tested without touching the database).
- `database/0002_add_run_source.sql` — migration: adds `training_runs.source`,
  makes `label` nullable (a Current Run has no label until a trained model can
  infer one — the raw samples are still saved either way).
- `mobile/training.mjs` — `validateRunPayload` now requires `source` and allows
  a null label only when `source` is `'user_run'`.

## Explicitly deferred (not in this change)
- The real 3D avatar on Calibrate — the schematic figure is wired up as the
  placeholder, and documents what it expects as input.
- Automatic good/bad inference for Current Run — `label` is saved as `null`
  until that model exists; `See past runs` already renders that as "Pending".

## Tests
`npm test` in `mobile/` now also runs `tests/runs.test.mjs`. All 16 tests pass
(`node --test tests/*.mjs` from the repo root).
