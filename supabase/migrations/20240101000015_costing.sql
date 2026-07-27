-- ─── Costing: crew hourly cost + event charge rate ───────────
-- NOT YET APPLIED TO LIVE. Apply with `supabase db push`, then set
-- NEXT_PUBLIC_COSTING=true. The feature is flag-gated so the app keeps working
-- against the current schema until these columns exist (queries use SELECT *,
-- so the columns simply flow through once present).
--
-- Margin per crew / per event = (charge_rate − hourly_cost) × hours, summed over
-- secured crew. hourly_cost is financial → admin-only: the hardened
-- crew_guard_columns allow-list (migration 0005) already blocks crew self-edits
-- on every column except the four contact fields, so no extra guard is needed.

ALTER TABLE crew   ADD COLUMN IF NOT EXISTS hourly_cost NUMERIC(7,2);
ALTER TABLE events ADD COLUMN IF NOT EXISTS charge_rate NUMERIC(7,2);
