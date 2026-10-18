-- Apply after 0003_tcn_sensor_layout.sql.
-- Pending cloud captures start with zero samples and no end time, then become
-- training runs only after the app finalizes them.
BEGIN;

ALTER TABLE training_runs ALTER COLUMN ended_at DROP NOT NULL;
ALTER TABLE training_runs ALTER COLUMN sample_count SET DEFAULT 0;
ALTER TABLE training_runs DROP CONSTRAINT IF EXISTS training_runs_sample_count_check;
ALTER TABLE training_runs
  ADD CONSTRAINT training_runs_sample_count_check CHECK (sample_count >= 0);

ALTER TABLE training_runs
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'complete';
ALTER TABLE training_runs DROP CONSTRAINT IF EXISTS training_runs_status_check;
ALTER TABLE training_runs
  ADD CONSTRAINT training_runs_status_check CHECK (
    (status = 'collecting' AND ended_at IS NULL AND label IS NULL)
    OR (status = 'complete' AND ended_at IS NOT NULL AND sample_count > 0)
  );

ALTER TABLE training_runs
  ADD COLUMN IF NOT EXISTS client_capture_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_training_runs_client_capture_id
  ON training_runs(client_capture_id);

CREATE TABLE IF NOT EXISTS training_run_batches (
  run_id UUID NOT NULL REFERENCES training_runs(run_id) ON DELETE CASCADE,
  batch_index INTEGER NOT NULL CHECK (batch_index >= 0),
  payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 64),
  sample_count INTEGER NOT NULL CHECK (sample_count > 0),
  PRIMARY KEY (run_id, batch_index)
);

COMMIT;
