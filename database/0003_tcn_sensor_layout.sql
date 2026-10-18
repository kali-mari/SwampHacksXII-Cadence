-- Apply after ml_training.sql and 0002_add_run_source.sql.
-- Retired sensor records remain readable for history, but only elbow flex
-- (type 1, IDs 0-1) and IMUs (type 2, IDs 0-3) may be written going forward.
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    FOR constraint_name IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'training_samples'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%sensor_type%'
    LOOP
        EXECUTE format('ALTER TABLE training_samples DROP CONSTRAINT %I', constraint_name);
    END LOOP;
END $$;

ALTER TABLE training_samples
  ADD CONSTRAINT training_samples_tcn_sensor_layout_check
  CHECK (
    (sensor_type = 1 AND sensor_id BETWEEN 0 AND 1) OR
    (sensor_type = 2 AND sensor_id BETWEEN 0 AND 3)
  ) NOT VALID;
