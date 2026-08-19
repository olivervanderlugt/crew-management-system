-- ─── Make the audit log append-only ──────────────────────────
-- Migration 0004 granted admins `FOR ALL` on audit_log, so any admin could
-- UPDATE or DELETE the very rows that record what they did — including the
-- EXPORT entries written when payroll leaves the building. An audit trail the
-- audited party can edit is not evidence, which defeats the AVG/GDPR purpose
-- the table exists for.
--
-- Reads stay open to admins. Writes stay open so the app can append (audit
-- entries are written through lib/audit.ts). UPDATE and DELETE get no policy
-- at all, and with RLS enabled "no policy" means denied — including for the
-- account that wrote the row.

DROP POLICY IF EXISTS "admin_all_audit_log" ON audit_log;

CREATE POLICY "admin_select_audit_log" ON audit_log
  FOR SELECT TO authenticated USING (is_admin());

CREATE POLICY "admin_insert_audit_log" ON audit_log
  FOR INSERT TO authenticated WITH CHECK (is_admin());

-- Deliberately no UPDATE and no DELETE policy. The service role still bypasses
-- RLS, which is how retention cleanup would be done if it is ever needed.
