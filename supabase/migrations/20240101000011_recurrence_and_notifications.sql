-- ─── Recurrence groups + notifications outbox ────────────────
-- NOT YET APPLIED TO LIVE. Apply with `supabase db push` when ready.
-- The app degrades gracefully until then: the recurrence-group feature is gated
-- behind NEXT_PUBLIC_RECURRENCE_GROUPS, and the /notificaties page falls back to
-- a "not activated" placeholder if the notifications table is missing.

-- 1) Tie the events of one recurring series together so they can be managed
--    as a group (view siblings, cancel the rest of the series, etc.).
ALTER TABLE events ADD COLUMN IF NOT EXISTS recurrence_group_id UUID;
CREATE INDEX IF NOT EXISTS events_recurrence_group_idx
  ON events(recurrence_group_id);

-- 2) Notifications outbox. Messages are *enqueued* by admins now; actual
--    dispatch (WhatsApp/email) is wired later behind feature flags + adapters.
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id     UUID REFERENCES crew(id) ON DELETE SET NULL,
  event_id    UUID REFERENCES events(id) ON DELETE SET NULL,
  channel     TEXT NOT NULL DEFAULT 'whatsapp',  -- whatsapp | email | sms
  to_address  TEXT,                              -- phone or email at enqueue time
  subject     TEXT,
  body        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'queued',    -- queued | sent | failed | cancelled
  error       TEXT,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS notifications_status_idx ON notifications(status);
CREATE INDEX IF NOT EXISTS notifications_event_idx ON notifications(event_id);
CREATE INDEX IF NOT EXISTS notifications_created_idx ON notifications(created_at DESC);

-- Any admin can read the outbox; writes require the 'assignments' module
-- (notifications are about contacting assigned/invited crew).
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_select_notifications" ON notifications;
CREATE POLICY "admin_select_notifications" ON notifications
  FOR SELECT TO authenticated USING (is_admin());
DROP POLICY IF EXISTS "admin_write_notifications" ON notifications;
CREATE POLICY "admin_write_notifications" ON notifications
  FOR ALL TO authenticated USING (admin_has('assignments')) WITH CHECK (admin_has('assignments'));
