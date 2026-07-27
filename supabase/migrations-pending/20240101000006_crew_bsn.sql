-- ─── Sensitive: BSN (HELD until legal/AVG sign-off) ──────────
-- This file lives in supabase/migrations-pending/ so `supabase db push` does
-- NOT apply it. It adds the Burgerservicenummer column.
--
-- ACTIVATE ONLY AFTER the AVG checklist in docs/AVG-crew-gegevens.md is done
-- (legal basis, DPIA, processing register, Supabase DPA, retention):
--   1. git mv supabase/migrations-pending/20240101000006_crew_bsn.sql supabase/migrations/
--   2. pnpm db:migrate         (supabase db push)
--   3. set NEXT_PUBLIC_CREW_BSN_ENABLED=true in root .env.local (enables the UI field)
--
-- BSN is admin-only (RLS on crew) and uneditable by crew (the guard below is
-- re-created so its compiled crew%ROWTYPE includes bsn). Never used for search/sort.

ALTER TABLE crew ADD COLUMN IF NOT EXISTS bsn TEXT;

-- Re-create the column guard so its cached row-type picks up the new bsn column.
-- (Allow-list logic unchanged: crew may still only edit the four contact fields,
-- so bsn is automatically protected.)
CREATE OR REPLACE FUNCTION public.crew_guard_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed crew%ROWTYPE;
BEGIN
  IF is_admin() OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  allowed := OLD;
  allowed.phone      := NEW.phone;
  allowed.email      := NEW.email;
  allowed.home_city  := NEW.home_city;
  allowed.postcode   := NEW.postcode;
  allowed.updated_at := NEW.updated_at;

  IF allowed IS DISTINCT FROM NEW THEN
    RAISE EXCEPTION 'Crew mag alleen eigen contactgegevens wijzigen';
  END IF;

  RETURN NEW;
END;
$$;
