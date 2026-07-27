-- ─── Time-tracking: worked hours on assignments ──────────────
-- NOT YET APPLIED TO LIVE. Apply with `supabase db push`, then set
-- NEXT_PUBLIC_TIME_TRACKING=true. The feature is flag-gated so the app keeps
-- working against the current schema until the columns exist.
--
-- CrewOps keeps the whole lifecycle on the assignment record (plan → match →
-- confirm → work), so worked hours live here rather than in a separate module.

ALTER TABLE assignments ADD COLUMN IF NOT EXISTS clock_in       TIMESTAMPTZ;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS clock_out      TIMESTAMPTZ;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS break_minutes  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS hours_worked   NUMERIC(6,2);
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS hours_approved BOOLEAN NOT NULL DEFAULT false;
