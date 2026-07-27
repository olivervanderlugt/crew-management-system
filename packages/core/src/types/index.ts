// ============================================================
// Domain types
// All identifiers in English; domain terms (Crew ID, Vervoer,
// availability codes B/M/X/W/V) preserved verbatim from source.
// ============================================================

export type UUID = string;

// ─── Availability ────────────────────────────────────────────
/**
 * Availability status codes — sourced directly from the bron-callsheet.
 * B = Beschikbaar, M = Misschien, X = Niet beschikbaar.
 * W and V: exact meaning TBD per source sheet — preserved as-is.
 */
export type AvailabilityStatus = "B" | "M" | "X" | "W" | "V";

// ─── Crew ────────────────────────────────────────────────────
export type CrewSeniority = "sitecrew" | "senior" | "teamlead";
export type CrewStatus = "active" | "inactive" | "prospect";

export interface Crew {
  id: UUID;
  crew_code: string; // e.g. CREW-0042
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  home_city: string | null;
  postcode: string | null;
  has_license: boolean;
  has_car: boolean;
  seniority: CrewSeniority;
  status: CrewStatus;
  notes: string | null;
  /** Wage cost to the organisation per hour (EUR). Financial — admin only. Migration 0015;
   *  optional until applied. Falls back to a seniority default in costing. */
  hourly_cost?: number | null;
  external_id: string | null;
  user_id: UUID | null; // linked auth.users id once crew claims their portal account
  // ── Extended profile (migration 0005) ──
  street: string | null;
  address_2: string | null; // secondary address (free text)
  date_of_birth: string | null; // ISO date
  nationality: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  shirt_size: string | null;
  start_date: string | null; // ISO date
  drivers_license_number: string | null;
  iban: string | null; // SENSITIVE — admin only, masked in UI
  // bsn lives in a held migration (see docs/privacy-crew-gegevens.md); not typed until applied.
  // ── Prospect pipeline ──
  prospect_source: string | null;
  prospect_status: ProspectStatus | null;
  prospect_applied_on: string | null; // ISO date
  prospect_next_action_on: string | null; // ISO date
  prospect_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrewWithAvailability extends Crew {
  availability: Availability[];
}

// ─── Prospect pipeline ───────────────────────────────────────
export type ProspectStatus =
  | "new"
  | "contacted"
  | "intake_planned"
  | "intake_done"
  | "hired"
  | "rejected";

// ─── Crew documents & certificates ───────────────────────────
export type CrewDocumentType =
  | "vog"
  | "vca"
  | "bhv"
  | "ehbo"
  | "drivers_license"
  | "id_document"
  | "insurance"
  | "contract"
  | "diploma"
  | "other";

export interface CrewDocument {
  id: UUID;
  crew_id: UUID;
  doc_type: CrewDocumentType;
  title: string;
  file_path: string | null; // path in the private 'crew-documents' bucket; null = metadata only
  issued_on: string | null;
  expires_on: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Skills ──────────────────────────────────────────────────
export type SkillLevel = "basic" | "intermediate" | "expert";

export interface Skill {
  id: UUID;
  name: string;
  description: string | null;
  created_at: string;
}

export interface CrewSkill {
  id: UUID;
  crew_id: UUID;
  skill_id: UUID;
  level: SkillLevel;
  certified: boolean;
  created_at: string;
}

// ─── Availability ────────────────────────────────────────────
export interface Availability {
  id: UUID;
  crew_id: UUID;
  date: string; // ISO date YYYY-MM-DD
  status: AvailabilityStatus;
  created_at: string;
  updated_at: string;
}

// ─── Events ──────────────────────────────────────────────────
export type EventStatus =
  | "draft"
  | "planned"
  | "confirmed"
  | "done"
  | "cancelled";

export interface Event {
  id: UUID;
  name: string;
  client: string | null;
  venue: string | null;
  address: string | null;
  start_datetime: string; // ISO datetime
  end_datetime: string; // ISO datetime
  crew_needed: number;
  status: EventStatus;
  notes: string | null;
  /** Hourly charge to the client per crew-hour (EUR). Migration 0015; optional
   *  until applied. Drives revenue/margin in costing. */
  charge_rate?: number | null;
  external_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventRequiredSkill {
  id: UUID;
  event_id: UUID;
  skill_id: UUID;
  count: number;
}

// ─── Assignments ─────────────────────────────────────────────
export type AssignmentStatus =
  | "proposed"
  | "invited"
  | "confirmed"
  | "declined"
  | "checked_in";

export interface Assignment {
  id: UUID;
  event_id: UUID;
  crew_id: UUID;
  role: string | null;
  status: AssignmentStatus;
  transport_group: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Transport ───────────────────────────────────────────────
export interface EventTransport {
  id: UUID;
  event_id: UUID;
  driver_crew_id: UUID;
  vehicle_capacity: number;
  pickup_point: string | null;
  created_at: string;
}

// ─── Integration sync ────────────────────────────────────────
export type IntegrationProvider =
  | "shift_platform"
  | "calcom"
  | "whatsapp"
  | "google_workspace"
  | "manual";

export interface IntegrationSync {
  id: UUID;
  entity_type: "crew" | "event" | "assignment";
  entity_id: UUID;
  provider: IntegrationProvider;
  external_id: string;
  last_synced_at: string | null;
  sync_data: Record<string, unknown> | null;
  created_at: string;
}

// ─── Audit log ───────────────────────────────────────────────
export interface AuditLog {
  id: UUID;
  user_id: UUID | null;
  action: string;
  table_name: string;
  record_id: UUID | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

// ─── Matching ────────────────────────────────────────────────
export interface MatchCandidate {
  crew: Crew;
  score: number;
  reasons: MatchReason[];
  excluded: boolean;
  exclusion_reason: string | null;
}

export interface MatchReason {
  factor: MatchFactor;
  score: number;
  label: string;
}

export type MatchFactor =
  | "availability"
  | "skill_match"
  | "transport"
  | "seniority"
  | "workload_balance";

export interface MatchRequest {
  event: Pick<Event, "id" | "start_datetime" | "end_datetime" | "crew_needed">;
  required_skills: Array<{ skill_id: UUID; count: number }>;
  crew_pool: CrewWithAvailability[];
  /**
   * Crew already booked on a time-overlapping event. Conflict-aware matching
   * excludes them (score kept for transparency, but flagged + sorted to the
   * bottom) so the planner can't double-book. Optional — omit for no conflict
   * checking. The DB layer fills this from overlapping assignments.
   */
  busy_crew_ids?: UUID[];
}

export interface MatchResult {
  candidates: MatchCandidate[];
  total_available: number;
  total_excluded: number;
}
