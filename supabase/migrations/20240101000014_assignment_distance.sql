-- ─── Travel distance (km) on assignments ─────────────────────
-- Part of time-tracking: the distance from the crew member's home to the event,
-- pre-computed from geocoded coordinates and shown editable next to the worked
-- hours (for travel reimbursement). Additive + nullable; safe to apply.

ALTER TABLE assignments ADD COLUMN IF NOT EXISTS distance_km NUMERIC(7,1);
