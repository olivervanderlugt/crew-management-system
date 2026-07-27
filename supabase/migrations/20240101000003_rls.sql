-- ─── Row Level Security policies ─────────────────────────────
-- Phase 1: admin-only access. Crew self-service portal is Phase 2.
-- All tables are locked to authenticated users (admin role).

ALTER TABLE crew ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_required_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_transport ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_sync ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Authenticated users (admins) get full access to everything.
-- Phase 2 will add crew-scoped policies when the crew portal is built.

CREATE POLICY "authenticated_full_access_crew" ON crew
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_full_access_skills" ON skills
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_full_access_crew_skills" ON crew_skills
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_full_access_availability" ON availability
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_full_access_events" ON events
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_full_access_event_required_skills" ON event_required_skills
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_full_access_assignments" ON assignments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_full_access_event_transport" ON event_transport
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_full_access_integration_sync" ON integration_sync
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_full_access_audit_log" ON audit_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Service role bypasses RLS automatically (used in seed script and server-side ops).
