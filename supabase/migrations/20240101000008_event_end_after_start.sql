-- Events: end must be strictly after start. NOT VALID enforces the rule on every
-- INSERT/UPDATE going forward while skipping a scan of existing rows (so the
-- migration can't fail on legacy data).
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_end_after_start;
ALTER TABLE events
  ADD CONSTRAINT events_end_after_start CHECK (end_datetime > start_datetime) NOT VALID;
