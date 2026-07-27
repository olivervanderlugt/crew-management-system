-- ─── Updated_at trigger helper ───────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── Crew ────────────────────────────────────────────────────
CREATE TABLE crew (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_code     TEXT NOT NULL UNIQUE,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  phone         TEXT,
  email         TEXT,
  home_city     TEXT,
  postcode      TEXT,
  has_license   BOOLEAN NOT NULL DEFAULT FALSE,
  has_car       BOOLEAN NOT NULL DEFAULT FALSE,
  seniority     crew_seniority NOT NULL DEFAULT 'sitecrew',
  status        crew_status NOT NULL DEFAULT 'active',
  notes         TEXT,
  external_id   TEXT,  -- for future integration sync
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER crew_updated_at
  BEFORE UPDATE ON crew
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX crew_status_idx ON crew(status);
CREATE INDEX crew_crew_code_idx ON crew(crew_code);

-- ─── Skills catalog ──────────────────────────────────────────
CREATE TABLE skills (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Crew skills (junction) ───────────────────────────────────
CREATE TABLE crew_skills (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id    UUID NOT NULL REFERENCES crew(id) ON DELETE CASCADE,
  skill_id   UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  level      skill_level NOT NULL DEFAULT 'basic',
  certified  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(crew_id, skill_id)
);

CREATE INDEX crew_skills_crew_idx ON crew_skills(crew_id);

-- ─── Availability ────────────────────────────────────────────
CREATE TABLE availability (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id    UUID NOT NULL REFERENCES crew(id) ON DELETE CASCADE,
  date       DATE NOT NULL,
  status     availability_status NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(crew_id, date)
);

CREATE TRIGGER availability_updated_at
  BEFORE UPDATE ON availability
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX availability_crew_date_idx ON availability(crew_id, date);
CREATE INDEX availability_date_idx ON availability(date);

-- ─── Events ──────────────────────────────────────────────────
CREATE TABLE events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  client         TEXT,
  venue          TEXT,
  address        TEXT,
  start_datetime TIMESTAMPTZ NOT NULL,
  end_datetime   TIMESTAMPTZ NOT NULL,
  crew_needed    INTEGER NOT NULL DEFAULT 1 CHECK (crew_needed >= 1),
  status         event_status NOT NULL DEFAULT 'draft',
  notes          TEXT,
  external_id    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX events_start_idx ON events(start_datetime);
CREATE INDEX events_status_idx ON events(status);

-- ─── Event required skills ────────────────────────────────────
CREATE TABLE event_required_skills (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  count    INTEGER NOT NULL DEFAULT 1 CHECK (count >= 1),
  UNIQUE(event_id, skill_id)
);

-- ─── Assignments ─────────────────────────────────────────────
CREATE TABLE assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  crew_id         UUID NOT NULL REFERENCES crew(id) ON DELETE CASCADE,
  role            TEXT,
  status          assignment_status NOT NULL DEFAULT 'proposed',
  transport_group TEXT,
  responded_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_id, crew_id)
);

CREATE TRIGGER assignments_updated_at
  BEFORE UPDATE ON assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX assignments_event_idx ON assignments(event_id);
CREATE INDEX assignments_crew_idx ON assignments(crew_id);

-- ─── Event transport ─────────────────────────────────────────
CREATE TABLE event_transport (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  driver_crew_id  UUID NOT NULL REFERENCES crew(id),
  vehicle_capacity INTEGER NOT NULL DEFAULT 4 CHECK (vehicle_capacity >= 1),
  pickup_point    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Integration sync ─────────────────────────────────────────
CREATE TABLE integration_sync (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type   entity_type NOT NULL,
  entity_id     UUID NOT NULL,
  provider      integration_provider NOT NULL,
  external_id   TEXT NOT NULL,
  last_synced_at TIMESTAMPTZ,
  sync_data     JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(entity_type, entity_id, provider)
);

CREATE INDEX integration_sync_entity_idx ON integration_sync(entity_type, entity_id);

-- ─── Audit log ────────────────────────────────────────────────
-- AVG/GDPR transparency: logs who changed what and when.
CREATE TABLE audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id),
  action      TEXT NOT NULL,  -- INSERT | UPDATE | DELETE
  table_name  TEXT NOT NULL,
  record_id   UUID,
  old_data    JSONB,
  new_data    JSONB,
  ip_address  INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX audit_log_table_record_idx ON audit_log(table_name, record_id);
CREATE INDEX audit_log_user_idx ON audit_log(user_id);
CREATE INDEX audit_log_created_idx ON audit_log(created_at DESC);
