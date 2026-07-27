-- ─── Crew module: extra fields, documents, prospect pipeline ──
-- Adds richer crew data (incl. the sensitive IBAN — see docs/AVG-crew-gegevens.md),
-- a crew_documents archive backed by a private Storage bucket, and prospect
-- pipeline fields. Sensitive columns are admin-only (RLS) and uneditable by crew
-- (the hardened crew_guard_columns trigger below switches to an allow-list).
-- NOTE: BSN is deliberately split into the held migration
-- supabase/migrations-pending/20240101000006_crew_bsn.sql (applied only after the
-- AVG/legal checklist is signed off).

-- ─── Enums ───────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE prospect_pipeline_status AS ENUM
    ('new', 'contacted', 'intake_planned', 'intake_done', 'hired', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE crew_document_type AS ENUM
    ('vog', 'vca', 'bhv', 'ehbo', 'drivers_license', 'id_document', 'insurance', 'contract', 'diploma', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── New crew columns ────────────────────────────────────────
ALTER TABLE crew
  ADD COLUMN IF NOT EXISTS street                  TEXT,
  ADD COLUMN IF NOT EXISTS address_2               TEXT,
  ADD COLUMN IF NOT EXISTS date_of_birth           DATE,
  ADD COLUMN IF NOT EXISTS nationality             TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_name  TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS shirt_size              TEXT,
  ADD COLUMN IF NOT EXISTS start_date              DATE,
  ADD COLUMN IF NOT EXISTS drivers_license_number  TEXT,
  -- Sensitive (financial). Admin-only via RLS; masked in UI.
  ADD COLUMN IF NOT EXISTS iban                    TEXT,
  -- (BSN intentionally NOT here — see the held migration noted above.)
  -- Prospect pipeline
  ADD COLUMN IF NOT EXISTS prospect_source           TEXT,
  ADD COLUMN IF NOT EXISTS prospect_status           prospect_pipeline_status,
  ADD COLUMN IF NOT EXISTS prospect_applied_on       DATE,
  ADD COLUMN IF NOT EXISTS prospect_next_action_on   DATE,
  ADD COLUMN IF NOT EXISTS prospect_notes            TEXT;

-- ─── Harden the crew self-service column guard (allow-list) ───
-- Previously an explicit deny-list. Switch to an allow-list so every column
-- except the four contact fields — including the new BSN/IBAN and any future
-- column — is automatically protected from crew self-edits.
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

  -- Start from OLD, apply only the crew-editable fields from NEW, then require
  -- the result to equal NEW. Any change outside the allow-list is rejected.
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

-- ─── crew_documents (certificates + uploaded files) ──────────
CREATE TABLE IF NOT EXISTS crew_documents (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id    UUID NOT NULL REFERENCES crew(id) ON DELETE CASCADE,
  doc_type   crew_document_type NOT NULL DEFAULT 'other',
  title      TEXT NOT NULL,
  -- Path inside the private 'crew-documents' bucket. NULL = metadata-only
  -- ("filled in" certificate without an attached file).
  file_path  TEXT,
  issued_on  DATE,
  expires_on DATE,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crew_documents_crew_idx ON crew_documents(crew_id);
CREATE INDEX IF NOT EXISTS crew_documents_type_idx ON crew_documents(doc_type);

DROP TRIGGER IF EXISTS crew_documents_updated_at ON crew_documents;
CREATE TRIGGER crew_documents_updated_at
  BEFORE UPDATE ON crew_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE crew_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_crew_documents" ON crew_documents;
CREATE POLICY "admin_all_crew_documents" ON crew_documents
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- ─── Private Storage bucket for crew documents ───────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('crew-documents', 'crew-documents', FALSE)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "crew_docs_admin_select" ON storage.objects;
CREATE POLICY "crew_docs_admin_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'crew-documents' AND public.is_admin());

DROP POLICY IF EXISTS "crew_docs_admin_insert" ON storage.objects;
CREATE POLICY "crew_docs_admin_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'crew-documents' AND public.is_admin());

DROP POLICY IF EXISTS "crew_docs_admin_update" ON storage.objects;
CREATE POLICY "crew_docs_admin_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'crew-documents' AND public.is_admin());

DROP POLICY IF EXISTS "crew_docs_admin_delete" ON storage.objects;
CREATE POLICY "crew_docs_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'crew-documents' AND public.is_admin());
