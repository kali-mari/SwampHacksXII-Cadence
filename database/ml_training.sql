CREATE TABLE IF NOT EXISTS training_runs (
    run_id UUID PRIMARY KEY,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ NOT NULL,
    label TEXT NOT NULL CHECK (label IN ('good', 'bad')),
    sample_count INTEGER NOT NULL CHECK (sample_count > 0)
);

CREATE TABLE IF NOT EXISTS training_samples (
    sample_id BIGSERIAL PRIMARY KEY,
    run_id UUID NOT NULL REFERENCES training_runs(run_id) ON DELETE CASCADE,
    captured_at TIMESTAMPTZ NOT NULL,
    sensor_type SMALLINT NOT NULL CHECK (sensor_type IN (1, 2, 3)),
    sensor_id SMALLINT NOT NULL,
    reading JSONB NOT NULL CHECK (jsonb_typeof(reading) = 'object'),
    CHECK (
        (sensor_type = 1 AND sensor_id BETWEEN 0 AND 2) OR
        (sensor_type = 2 AND sensor_id BETWEEN 0 AND 3) OR
        (sensor_type = 3 AND sensor_id BETWEEN 0 AND 1)
    )
);

CREATE INDEX IF NOT EXISTS idx_training_samples_run_time
    ON training_samples(run_id, captured_at);
