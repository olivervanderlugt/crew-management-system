-- ─── Granular sub-admin permissions (RBAC) ───────────────────
-- is_admin() (JWT app_metadata.role='admin') stays the "is an admin at all" gate.
-- admin_has(perm) adds per-MODULE write permissions for admin accounts.
-- Modules: 'crew' | 'events' | 'assignments' | 'admins'.
-- Any admin can READ everything; only admins with the matching module permission
-- (or a full admin) can WRITE. Crew self-service policies (migration 0004) are
-- untouched. Reading admin_permissions from a table (not the JWT) means permission
-- changes take effect immediately, without a re-login.

CREATE TABLE IF NOT EXISTS admin_permissions (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT,                          -- denormalised for the admin list UI
  is_full    BOOLEAN NOT NULL DEFAULT FALSE, -- full admin = every permission
  perms      TEXT[] NOT NULL DEFAULT '{}',   -- subset of the modules above
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS admin_permissions_updated_at ON admin_permissions;
CREATE TRIGGER admin_permissions_updated_at
  BEFORE UPDATE ON admin_permissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Backfill every existing admin as a FULL admin so nobody loses access.
INSERT INTO admin_permissions (user_id, email, is_full)
SELECT id, email, TRUE FROM auth.users
WHERE raw_app_meta_data ->> 'role' = 'admin'
ON CONFLICT (user_id) DO UPDATE SET is_full = TRUE, email = EXCLUDED.email;

-- True when the current admin has a module permission (or is a full admin).
CREATE OR REPLACE FUNCTION public.admin_has(perm TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_permissions ap
    WHERE ap.user_id = auth.uid()
      AND (ap.is_full OR perm = ANY(ap.perms))
  );
$$;

-- admin_permissions RLS: any admin can read the team; only an admin with the
-- 'admins' permission can change it.
ALTER TABLE admin_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_read_permissions" ON admin_permissions;
CREATE POLICY "admin_read_permissions" ON admin_permissions
  FOR SELECT TO authenticated USING (is_admin());
DROP POLICY IF EXISTS "admin_manage_permissions" ON admin_permissions;
CREATE POLICY "admin_manage_permissions" ON admin_permissions
  FOR ALL TO authenticated USING (admin_has('admins')) WITH CHECK (admin_has('admins'));

-- ─── Re-scope admin write policies per module ────────────────
-- Pattern per table: replace the old FOR ALL admin policy with
--   • SELECT  → any admin (is_admin)
--   • FOR ALL → admin_has(<module>)   (gates INSERT/UPDATE/DELETE; its USING also
--               contributes to SELECT, but the SELECT policy already allows it)

-- module 'crew': crew, crew_documents, crew_skills, availability, skills
DROP POLICY IF EXISTS "admin_all_crew" ON crew;
CREATE POLICY "admin_select_crew" ON crew FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "admin_write_crew" ON crew FOR ALL TO authenticated USING (admin_has('crew')) WITH CHECK (admin_has('crew'));

DROP POLICY IF EXISTS "admin_all_crew_documents" ON crew_documents;
CREATE POLICY "admin_select_crew_documents" ON crew_documents FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "admin_write_crew_documents" ON crew_documents FOR ALL TO authenticated USING (admin_has('crew')) WITH CHECK (admin_has('crew'));

DROP POLICY IF EXISTS "admin_all_crew_skills" ON crew_skills;
CREATE POLICY "admin_select_crew_skills" ON crew_skills FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "admin_write_crew_skills" ON crew_skills FOR ALL TO authenticated USING (admin_has('crew')) WITH CHECK (admin_has('crew'));

DROP POLICY IF EXISTS "admin_all_availability" ON availability;
CREATE POLICY "admin_select_availability" ON availability FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "admin_write_availability" ON availability FOR ALL TO authenticated USING (admin_has('crew')) WITH CHECK (admin_has('crew'));

DROP POLICY IF EXISTS "admin_all_skills" ON skills;
CREATE POLICY "admin_write_skills" ON skills FOR ALL TO authenticated USING (admin_has('crew')) WITH CHECK (admin_has('crew'));
-- (authenticated_read_skills already allows any authenticated user to SELECT skills)

-- module 'events': events, event_required_skills, event_transport
DROP POLICY IF EXISTS "admin_all_events" ON events;
CREATE POLICY "admin_select_events" ON events FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "admin_write_events" ON events FOR ALL TO authenticated USING (admin_has('events')) WITH CHECK (admin_has('events'));

DROP POLICY IF EXISTS "admin_all_event_required_skills" ON event_required_skills;
CREATE POLICY "admin_select_event_required_skills" ON event_required_skills FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "admin_write_event_required_skills" ON event_required_skills FOR ALL TO authenticated USING (admin_has('events')) WITH CHECK (admin_has('events'));

DROP POLICY IF EXISTS "admin_all_event_transport" ON event_transport;
CREATE POLICY "admin_select_event_transport" ON event_transport FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "admin_write_event_transport" ON event_transport FOR ALL TO authenticated USING (admin_has('events')) WITH CHECK (admin_has('events'));

-- module 'assignments': assignments
DROP POLICY IF EXISTS "admin_all_assignments" ON assignments;
CREATE POLICY "admin_select_assignments" ON assignments FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "admin_write_assignments" ON assignments FOR ALL TO authenticated USING (admin_has('assignments')) WITH CHECK (admin_has('assignments'));

-- integration_sync + audit_log stay admin-wide (system tables, not a user module).
