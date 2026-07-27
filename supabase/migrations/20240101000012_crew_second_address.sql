-- ─── Named addresses + a geocoded second address for crew ────
-- NOT YET APPLIED TO LIVE. Apply with `supabase db push` when ready, then set
-- NEXT_PUBLIC_CREW_SECOND_ADDRESS=true. Until then the feature stays hidden
-- (flag off) so client-side crew saves keep working against the current schema.
--
-- A crew member can have two homes (e.g. "Studentenkamer" + "Ouderlijk huis").
-- Each address gets an optional name; both are geocoded so the map/proximity can
-- use whichever is closest to an event.
--
-- The first address reuses the existing columns (street, postcode, home_city,
-- latitude, longitude); the second reuses the existing free-text `address_2`
-- column as its street line and adds the rest.

ALTER TABLE crew ADD COLUMN IF NOT EXISTS address_label   TEXT;          -- name for address 1
ALTER TABLE crew ADD COLUMN IF NOT EXISTS address_2_label TEXT;          -- name for address 2
ALTER TABLE crew ADD COLUMN IF NOT EXISTS postcode_2      TEXT;
ALTER TABLE crew ADD COLUMN IF NOT EXISTS home_city_2     TEXT;
ALTER TABLE crew ADD COLUMN IF NOT EXISTS latitude_2      DOUBLE PRECISION;
ALTER TABLE crew ADD COLUMN IF NOT EXISTS longitude_2     DOUBLE PRECISION;
