-- ─── Geocoding: lat/lng for the map / proximity view ─────────
-- Populated by supabase/geocode.ts (service role) from addresses. Admin/service
-- only — the crew_guard_columns allow-list already blocks crew self-edits of
-- any column outside their contact fields, so these are covered automatically.
ALTER TABLE crew
  ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
