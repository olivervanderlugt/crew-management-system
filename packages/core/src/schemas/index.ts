import { z } from "zod";

// ─── Enums ───────────────────────────────────────────────────
export const availabilityStatusSchema = z.enum(["B", "M", "X", "W", "V"]);

export const crewSenioritySchema = z.enum(["sitecrew", "senior", "teamlead"]);

export const crewStatusSchema = z.enum(["active", "inactive", "prospect"]);

export const eventStatusSchema = z.enum([
  "draft",
  "planned",
  "confirmed",
  "done",
  "cancelled",
]);

export const assignmentStatusSchema = z.enum([
  "proposed",
  "invited",
  "confirmed",
  "declined",
  "checked_in",
]);

export const skillLevelSchema = z.enum(["basic", "intermediate", "expert"]);

export const prospectStatusSchema = z.enum([
  "new",
  "contacted",
  "intake_planned",
  "intake_done",
  "hired",
  "rejected",
]);

export const crewDocumentTypeSchema = z.enum([
  "vog",
  "vca",
  "bhv",
  "ehbo",
  "drivers_license",
  "id_document",
  "insurance",
  "contract",
  "diploma",
  "other",
]);

// Reusable ISO date (YYYY-MM-DD), nullable+optional for empty form fields.
const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum moet YYYY-MM-DD zijn")
  .nullable()
  .optional();

// ─── Crew ────────────────────────────────────────────────────
export const crewCodeSchema = z
  .string()
  .regex(/^CREW-\d{4}$/, "Crew ID moet het formaat CREW-XXXX hebben");

export const createCrewSchema = z.object({
  crew_code: crewCodeSchema,
  first_name: z.string().min(1, "Voornaam is verplicht"),
  last_name: z.string().min(1, "Achternaam is verplicht"),
  phone: z.string().nullable().optional(),
  email: z.string().email("Ongeldig e-mailadres").nullable().optional(),
  home_city: z.string().nullable().optional(),
  postcode: z.string().nullable().optional(),
  has_license: z.boolean().default(false),
  has_car: z.boolean().default(false),
  seniority: crewSenioritySchema.default("sitecrew"),
  status: crewStatusSchema.default("active"),
  notes: z.string().nullable().optional(),
  // ── Costing (migration 0015) — financial, admin-only ──
  hourly_cost: z.number().min(0, "Tarief kan niet negatief zijn").nullable().optional(),
  // ── Extended profile (migration 0005) ──
  street: z.string().nullable().optional(),
  address_2: z.string().nullable().optional(),
  // ── Named + second geocoded address (migration 0012) ──
  address_label: z.string().nullable().optional(),
  address_2_label: z.string().nullable().optional(),
  postcode_2: z.string().nullable().optional(),
  home_city_2: z.string().nullable().optional(),
  latitude_2: z.number().nullable().optional(),
  longitude_2: z.number().nullable().optional(),
  date_of_birth: dateStringSchema,
  nationality: z.string().nullable().optional(),
  emergency_contact_name: z.string().nullable().optional(),
  emergency_contact_phone: z.string().nullable().optional(),
  shirt_size: z.string().nullable().optional(),
  start_date: dateStringSchema,
  drivers_license_number: z.string().nullable().optional(),
  iban: z.string().trim().max(40, "IBAN is te lang").nullable().optional(),
  // ── Prospect pipeline ──
  prospect_source: z.string().nullable().optional(),
  prospect_status: prospectStatusSchema.nullable().optional(),
  prospect_applied_on: dateStringSchema,
  prospect_next_action_on: dateStringSchema,
  prospect_notes: z.string().nullable().optional(),
});

export type CreateCrewInput = z.infer<typeof createCrewSchema>;

export const updateCrewSchema = createCrewSchema.partial();
export type UpdateCrewInput = z.infer<typeof updateCrewSchema>;

// Crew self-service profile edit — contact fields only. Identity, status and
// seniority stay admin-controlled (also enforced by the crew_guard_columns
// trigger and RLS in the database).
export const updateCrewProfileSchema = z.object({
  phone: z.string().trim().max(40).nullable().optional(),
  email: z.string().email("Ongeldig e-mailadres").nullable().optional(),
  home_city: z.string().trim().max(120).nullable().optional(),
  postcode: z.string().trim().max(16).nullable().optional(),
});

export type UpdateCrewProfileInput = z.infer<typeof updateCrewProfileSchema>;

// ─── Event ───────────────────────────────────────────────────
const eventBaseSchema = z.object({
  name: z.string().min(1, "Evenementnaam is verplicht"),
  client: z.string().nullable().optional(),
  venue: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  start_datetime: z.string().datetime("Ongeldige startdatumtijd"),
  end_datetime: z.string().datetime("Ongeldige einddatumtijd"),
  crew_needed: z.number().int().min(1, "Minimaal 1 crewlid vereist"),
  status: eventStatusSchema.default("draft"),
  notes: z.string().nullable().optional(),
  // Hourly charge to the client per crew-hour, for margin (migration 0015).
  charge_rate: z.number().min(0, "Tarief kan niet negatief zijn").nullable().optional(),
  // Geocoded coordinates — usually filled server-side on save, but accepted in
  // the payload so recurring occurrences can reuse the first occurrence's
  // coordinates instead of re-geocoding the same address N times.
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  // Ties the events of one recurring series together (migration 0011).
  recurrence_group_id: z.string().uuid().nullable().optional(),
  required_skills: z
    .array(
      z.object({
        skill_id: z.string().uuid(),
        count: z.number().int().min(1),
      })
    )
    .optional(),
});

// End must be strictly after start (validated client-side and on the API).
export const createEventSchema = eventBaseSchema.refine(
  (d) => new Date(d.end_datetime) > new Date(d.start_datetime),
  { message: "Einde moet ná de start liggen", path: ["end_datetime"] }
);

export type CreateEventInput = z.infer<typeof createEventSchema>;

export const updateEventSchema = eventBaseSchema.partial();
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

// ─── Availability ────────────────────────────────────────────
export const setAvailabilitySchema = z.object({
  crew_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum moet YYYY-MM-DD zijn"),
  status: availabilityStatusSchema,
});

export type SetAvailabilityInput = z.infer<typeof setAvailabilitySchema>;

export const bulkSetAvailabilitySchema = z.object({
  crew_id: z.string().uuid(),
  entries: z.array(
    z.object({
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum moet YYYY-MM-DD zijn"),
      status: availabilityStatusSchema,
    })
  ),
});

export type BulkSetAvailabilityInput = z.infer<
  typeof bulkSetAvailabilitySchema
>;

// ─── Assignment ──────────────────────────────────────────────
export const createAssignmentSchema = z.object({
  event_id: z.string().uuid(),
  crew_id: z.string().uuid(),
  role: z.string().nullable().optional(),
  status: assignmentStatusSchema.default("proposed"),
});

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;

// Crew responding to their own assignment (portal). Only confirm/decline —
// further constrained by the assignment_guard_crew_response trigger.
export const respondAssignmentSchema = z.object({
  assignment_id: z.string().uuid(),
  status: z.enum(["confirmed", "declined"]),
});

export type RespondAssignmentInput = z.infer<typeof respondAssignmentSchema>;

// ─── Crew documents & certificates ───────────────────────────
export const createCrewDocumentSchema = z.object({
  crew_id: z.string().uuid(),
  doc_type: crewDocumentTypeSchema.default("other"),
  title: z.string().min(1, "Titel is verplicht"),
  file_path: z.string().nullable().optional(), // set after upload; null = metadata only
  issued_on: dateStringSchema,
  expires_on: dateStringSchema,
  notes: z.string().nullable().optional(),
});

export type CreateCrewDocumentInput = z.infer<typeof createCrewDocumentSchema>;

export const updateCrewDocumentSchema = createCrewDocumentSchema
  .partial()
  .omit({ crew_id: true });

export type UpdateCrewDocumentInput = z.infer<typeof updateCrewDocumentSchema>;

// ─── CSV import ──────────────────────────────────────────────
export const crewCsvRowSchema = z.object({
  crew_code: crewCodeSchema,
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  phone: z.string().optional(),
  home_city: z.string().optional(),
  has_car: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1" || v === "ja"),
  has_license: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1" || v === "ja"),
  seniority: crewSenioritySchema.optional().default("sitecrew"),
});

export type CrewCsvRow = z.infer<typeof crewCsvRowSchema>;
