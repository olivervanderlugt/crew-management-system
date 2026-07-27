-- ─── Phase 2: Crew self-service portal ───────────────────────
-- Splits the Phase-1 "every authenticated user is an admin" model into
-- two roles:
--   • admin  — identified by the JWT claim app_metadata.role = 'admin'
--              (set on the admin account by supabase/create-admin.ts).
--   • crew   — an auth.users row linked to a crew record via crew.user_id.
--              Linked at first magic-link login (see the portal auth callback).
-- An authenticated user that is neither sees nothing (deny by default).

-- ─── Link crew → auth.users ──────────────────────────────────
ALTER TABLE crew
  ADD COLUMN IF NOT EXISTS user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS crew_user_id_idx ON crew(user_id);

-- ─── Role helpers ────────────────────────────────────────────
-- True when the current request's JWT carries app_metadata.role = 'admin'.
-- The service role bypasses RLS entirely, so it never needs this.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', FALSE);
$$;

-- The crew.id linked to the current auth user, or NULL.
-- SECURITY DEFINER so it reads crew without tripping crew's own RLS
-- (prevents recursion when referenced from other tables' policies).
CREATE OR REPLACE FUNCTION public.current_crew_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.crew WHERE user_id = auth.uid() LIMIT 1;
$$;

-- ─── Drop the Phase-1 blanket policies ───────────────────────
DROP POLICY IF EXISTS "authenticated_full_access_crew" ON crew;
DROP POLICY IF EXISTS "authenticated_full_access_skills" ON skills;
DROP POLICY IF EXISTS "authenticated_full_access_crew_skills" ON crew_skills;
DROP POLICY IF EXISTS "authenticated_full_access_availability" ON availability;
DROP POLICY IF EXISTS "authenticated_full_access_events" ON events;
DROP POLICY IF EXISTS "authenticated_full_access_event_required_skills" ON event_required_skills;
DROP POLICY IF EXISTS "authenticated_full_access_assignments" ON assignments;
DROP POLICY IF EXISTS "authenticated_full_access_event_transport" ON event_transport;
DROP POLICY IF EXISTS "authenticated_full_access_integration_sync" ON integration_sync;
DROP POLICY IF EXISTS "authenticated_full_access_audit_log" ON audit_log;

-- ─── crew ────────────────────────────────────────────────────
CREATE POLICY "admin_all_crew" ON crew
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- Crew may read their own record …
CREATE POLICY "crew_select_self" ON crew
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- … and update it (column changes are constrained by crew_guard_columns below).
CREATE POLICY "crew_update_self" ON crew
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─── skills (non-sensitive catalog) ──────────────────────────
CREATE POLICY "admin_all_skills" ON skills
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "authenticated_read_skills" ON skills
  FOR SELECT TO authenticated USING (true);

-- ─── crew_skills ─────────────────────────────────────────────
CREATE POLICY "admin_all_crew_skills" ON crew_skills
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "crew_select_own_skills" ON crew_skills
  FOR SELECT TO authenticated USING (crew_id = current_crew_id());

-- ─── availability ────────────────────────────────────────────
CREATE POLICY "admin_all_availability" ON availability
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- Crew fully own their availability rows.
CREATE POLICY "crew_manage_own_availability" ON availability
  FOR ALL TO authenticated
  USING (crew_id = current_crew_id())
  WITH CHECK (crew_id = current_crew_id());

-- ─── events ──────────────────────────────────────────────────
CREATE POLICY "admin_all_events" ON events
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- Crew see only events they are assigned to.
CREATE POLICY "crew_select_own_events" ON events
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM assignments a
      WHERE a.event_id = events.id AND a.crew_id = current_crew_id()
    )
  );

-- ─── event_required_skills ───────────────────────────────────
CREATE POLICY "admin_all_event_required_skills" ON event_required_skills
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "crew_select_own_event_required_skills" ON event_required_skills
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM assignments a
      WHERE a.event_id = event_required_skills.event_id
        AND a.crew_id = current_crew_id()
    )
  );

-- ─── assignments ─────────────────────────────────────────────
CREATE POLICY "admin_all_assignments" ON assignments
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "crew_select_own_assignments" ON assignments
  FOR SELECT TO authenticated USING (crew_id = current_crew_id());

-- Crew may respond to their own assignment (status guarded by trigger below).
CREATE POLICY "crew_update_own_assignments" ON assignments
  FOR UPDATE TO authenticated
  USING (crew_id = current_crew_id())
  WITH CHECK (crew_id = current_crew_id());

-- ─── event_transport ─────────────────────────────────────────
CREATE POLICY "admin_all_event_transport" ON event_transport
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "crew_select_own_event_transport" ON event_transport
  FOR SELECT TO authenticated USING (
    driver_crew_id = current_crew_id()
    OR EXISTS (
      SELECT 1 FROM assignments a
      WHERE a.event_id = event_transport.event_id
        AND a.crew_id = current_crew_id()
    )
  );

-- ─── integration_sync + audit_log (admin only) ───────────────
CREATE POLICY "admin_all_integration_sync" ON integration_sync
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "admin_all_audit_log" ON audit_log
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- ─── Column guards for crew self-service writes ──────────────
-- Admins and server-side service-role operations (auth.uid() IS NULL) are
-- unrestricted; only a crew member editing their own row is constrained.

-- Crew may change contact fields only — never identity/status/role columns.
CREATE OR REPLACE FUNCTION public.crew_guard_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF is_admin() OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.crew_code   IS DISTINCT FROM OLD.crew_code
     OR NEW.first_name  IS DISTINCT FROM OLD.first_name
     OR NEW.last_name   IS DISTINCT FROM OLD.last_name
     OR NEW.seniority   IS DISTINCT FROM OLD.seniority
     OR NEW.status      IS DISTINCT FROM OLD.status
     OR NEW.has_license IS DISTINCT FROM OLD.has_license
     OR NEW.has_car     IS DISTINCT FROM OLD.has_car
     OR NEW.notes       IS DISTINCT FROM OLD.notes
     OR NEW.external_id IS DISTINCT FROM OLD.external_id
     OR NEW.user_id     IS DISTINCT FROM OLD.user_id
  THEN
    RAISE EXCEPTION 'Crew mag alleen eigen contactgegevens wijzigen';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crew_guard_columns_trg ON crew;
CREATE TRIGGER crew_guard_columns_trg
  BEFORE UPDATE ON crew
  FOR EACH ROW EXECUTE FUNCTION crew_guard_columns();

-- Crew may only set their own assignment to confirmed/declined.
CREATE OR REPLACE FUNCTION public.assignment_guard_crew_response()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF is_admin() OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.event_id IS DISTINCT FROM OLD.event_id
     OR NEW.crew_id IS DISTINCT FROM OLD.crew_id
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.transport_group IS DISTINCT FROM OLD.transport_group
  THEN
    RAISE EXCEPTION 'Crew mag alleen reageren op de eigen toewijzing';
  END IF;

  IF NEW.status NOT IN ('confirmed', 'declined') THEN
    RAISE EXCEPTION 'Ongeldige status voor een crew-reactie';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assignment_guard_crew_response_trg ON assignments;
CREATE TRIGGER assignment_guard_crew_response_trg
  BEFORE UPDATE ON assignments
  FOR EACH ROW EXECUTE FUNCTION assignment_guard_crew_response();
