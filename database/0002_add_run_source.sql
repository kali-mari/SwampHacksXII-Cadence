-- Run once, after ml_training.sql, in the TigerData SQL console.
-- Adds a 'source' so training_runs can hold both Dev Testing captures
-- (manually labeled) and everyday Current Run uploads (label filled in
-- later once a trained model can infer it).

ALTER TABLE training_runs
  ALTER COLUMN label DROP NOT NULL;

-- Postgres auto-named the original inline CHECK on "label"
-- training_runs_label_check; drop it before replacing it with a
-- NULL-aware version.
ALTER TABLE training_runs DROP CONSTRAINT IF EXISTS training_runs_label_check;
ALTER TABLE training_runs
  ADD CONSTRAINT training_runs_label_check CHECK (label IS NULL OR label IN ('good', 'bad'));

ALTER TABLE training_runs
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'dev_testing';
ALTER TABLE training_runs DROP CONSTRAINT IF EXISTS training_runs_source_check;
ALTER TABLE training_runs
  ADD CONSTRAINT training_runs_source_check CHECK (source IN ('dev_testing', 'user_run'));

CREATE INDEX IF NOT EXISTS idx_training_runs_started_at ON training_runs(started_at DESC);
