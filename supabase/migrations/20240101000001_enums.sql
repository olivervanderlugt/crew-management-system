-- Availability status codes — sourced verbatim from bron-callsheet.
-- B = Beschikbaar, M = Misschien, X = Niet beschikbaar.
-- W and V: exact meaning TBD per source sheet — preserved as literals.
CREATE TYPE availability_status AS ENUM ('B', 'M', 'X', 'W', 'V');

CREATE TYPE crew_seniority AS ENUM ('sitecrew', 'senior', 'teamlead');
CREATE TYPE crew_status AS ENUM ('active', 'inactive', 'prospect');
CREATE TYPE event_status AS ENUM ('draft', 'planned', 'confirmed', 'done', 'cancelled');
CREATE TYPE assignment_status AS ENUM ('proposed', 'invited', 'confirmed', 'declined', 'checked_in');
CREATE TYPE skill_level AS ENUM ('basic', 'intermediate', 'expert');
CREATE TYPE integration_provider AS ENUM ('shift_platform', 'calcom', 'whatsapp', 'google_workspace', 'manual');
CREATE TYPE entity_type AS ENUM ('crew', 'event', 'assignment');
