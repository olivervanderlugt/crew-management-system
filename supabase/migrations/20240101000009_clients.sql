-- ─── Standard clients (reusable for events) ──────────────────
CREATE TABLE IF NOT EXISTS clients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL UNIQUE,
  contact_name  TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  venue         TEXT,
  address       TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS clients_updated_at ON clients;
CREATE TRIGGER clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Any admin can read the client list; writes require the 'events' module.
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_select_clients" ON clients;
CREATE POLICY "admin_select_clients" ON clients
  FOR SELECT TO authenticated USING (is_admin());
DROP POLICY IF EXISTS "admin_write_clients" ON clients;
CREATE POLICY "admin_write_clients" ON clients
  FOR ALL TO authenticated USING (admin_has('events')) WITH CHECK (admin_has('events'));
