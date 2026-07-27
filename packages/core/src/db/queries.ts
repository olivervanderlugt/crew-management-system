import type { SupabaseClient } from "./client.js";
import type { Crew, Event, Availability, Assignment } from "../types/index.js";
import type { CreateCrewInput, UpdateCrewInput, UpdateCrewProfileInput, CreateCrewDocumentInput, UpdateCrewDocumentInput, CreateEventInput, SetAvailabilityInput, BulkSetAvailabilityInput, CreateAssignmentInput } from "../schemas/index.js";
import type { Database } from "./database.types.js";

// ─── Crew queries ─────────────────────────────────────────────
export async function listCrew(
  client: SupabaseClient,
  opts: { status?: Database["public"]["Enums"]["crew_status"]; search?: string; limit?: number; offset?: number } = {}
) {
  let q = client
    .from("crew")
    .select("*, crew_skills(skill_id, level, certified, skills(name))")
    .order("last_name", { ascending: true });

  if (opts.status) q = q.eq("status", opts.status);
  if (opts.search) {
    q = q.or(
      `first_name.ilike.%${opts.search}%,last_name.ilike.%${opts.search}%,crew_code.ilike.%${opts.search}%`
    );
  }
  if (opts.limit) q = q.limit(opts.limit);
  if (opts.offset) q = q.range(opts.offset, opts.offset + (opts.limit ?? 50) - 1);

  return q;
}

export async function getCrewById(client: SupabaseClient, id: string) {
  return client
    .from("crew")
    .select("*, crew_skills(*, skills(*))")
    .eq("id", id)
    .single();
}

export async function createCrew(client: SupabaseClient, data: CreateCrewInput) {
  return client.from("crew").insert(data).select().single();
}

export async function updateCrew(
  client: SupabaseClient,
  id: string,
  data: UpdateCrewInput
) {
  return client.from("crew").update(data).eq("id", id).select().single();
}

export async function deactivateCrew(client: SupabaseClient, id: string) {
  return client
    .from("crew")
    .update({ status: "inactive" })
    .eq("id", id)
    .select()
    .single();
}

// ─── Crew portal (self-service) ───────────────────────────────
// The crew record linked to a given auth.users id (the portal session user).
export async function getCrewByUserId(client: SupabaseClient, userId: string) {
  return client
    .from("crew")
    .select("*, crew_skills(*, skills(name))")
    .eq("user_id", userId)
    .maybeSingle();
}

// Crew member updates their own contact details. Identity/status columns are
// rejected by the crew_guard_columns trigger, so only safe fields are passed.
export async function updateCrewProfile(
  client: SupabaseClient,
  crew_id: string,
  data: UpdateCrewProfileInput
) {
  return client.from("crew").update(data).eq("id", crew_id).select().single();
}

// ─── Crew documents & certificates (admin only via RLS) ───────
export async function listCrewDocuments(client: SupabaseClient, crew_id: string) {
  return client
    .from("crew_documents")
    .select("*")
    .eq("crew_id", crew_id)
    .order("created_at", { ascending: false });
}

export async function createCrewDocument(
  client: SupabaseClient,
  data: CreateCrewDocumentInput
) {
  return client.from("crew_documents").insert(data).select().single();
}

export async function updateCrewDocument(
  client: SupabaseClient,
  id: string,
  data: UpdateCrewDocumentInput
) {
  return client.from("crew_documents").update(data).eq("id", id).select().single();
}

export async function deleteCrewDocument(client: SupabaseClient, id: string) {
  return client.from("crew_documents").delete().eq("id", id);
}

// ─── Availability queries ─────────────────────────────────────
export async function getCrewAvailability(
  client: SupabaseClient,
  crew_id: string,
  from: string,
  to: string
) {
  return client
    .from("availability")
    .select("*")
    .eq("crew_id", crew_id)
    .gte("date", from)
    .lte("date", to)
    .order("date");
}

export async function setAvailability(
  client: SupabaseClient,
  data: SetAvailabilityInput
) {
  return client
    .from("availability")
    .upsert(data, { onConflict: "crew_id,date" })
    .select()
    .single();
}

export async function bulkSetAvailability(
  client: SupabaseClient,
  data: BulkSetAvailabilityInput
) {
  const rows = data.entries.map((e) => ({
    crew_id: data.crew_id,
    date: e.date,
    status: e.status,
  }));
  return client
    .from("availability")
    .upsert(rows, { onConflict: "crew_id,date" })
    .select();
}

export async function getMonthAvailabilityMatrix(
  client: SupabaseClient,
  year: number,
  month: number
) {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  return client
    .from("availability")
    .select("crew_id, date, status")
    .gte("date", from)
    .lte("date", to);
}

// ─── Event queries ────────────────────────────────────────────
export async function listEvents(
  client: SupabaseClient,
  opts: { status?: Database["public"]["Enums"]["event_status"]; from?: string; to?: string } = {}
) {
  let q = client
    .from("events")
    .select("*, event_required_skills(*, skills(name)), assignments(count)")
    .order("start_datetime", { ascending: true });

  if (opts.status) q = q.eq("status", opts.status);
  if (opts.from) q = q.gte("start_datetime", opts.from);
  if (opts.to) q = q.lte("start_datetime", opts.to);

  return q;
}

export async function getEventById(client: SupabaseClient, id: string) {
  return client
    .from("events")
    .select(
      "*, event_required_skills(*, skills(*)), assignments(*, crew(*))"
    )
    .eq("id", id)
    .single();
}

export async function createEvent(
  client: SupabaseClient,
  data: CreateEventInput
) {
  const { required_skills, ...eventData } = data;
  const { data: event, error } = await client
    .from("events")
    .insert(eventData)
    .select()
    .single();

  if (error || !event) return { data: null, error };

  if (required_skills && required_skills.length > 0) {
    await client.from("event_required_skills").insert(
      required_skills.map((s) => ({ event_id: event.id, ...s }))
    );
  }

  return { data: event, error: null };
}

export async function updateEvent(
  client: SupabaseClient,
  id: string,
  data: Partial<CreateEventInput>
) {
  const { required_skills, ...eventData } = data;
  return client.from("events").update(eventData).eq("id", id).select().single();
}

// ─── Assignment queries ───────────────────────────────────────
export async function createAssignment(
  client: SupabaseClient,
  data: CreateAssignmentInput
) {
  return client.from("assignments").insert(data).select().single();
}

export async function updateAssignmentStatus(
  client: SupabaseClient,
  id: string,
  status: Assignment["status"]
) {
  return client
    .from("assignments")
    .update({ status, responded_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
}

export async function getEventAssignments(
  client: SupabaseClient,
  event_id: string
) {
  return client
    .from("assignments")
    .select("*, crew(*)")
    .eq("event_id", event_id);
}

export async function getCrewAssignments(
  client: SupabaseClient,
  crew_id: string
) {
  return client
    .from("assignments")
    .select("*, events(*)")
    .eq("crew_id", crew_id)
    .order("created_at", { ascending: false })
    .limit(20);
}

// Upcoming assignments for a crew member (portal "toewijzingen" view).
// `events!inner` drops assignments whose event is already in the past.
export async function getUpcomingCrewAssignments(
  client: SupabaseClient,
  crew_id: string,
  fromIso: string
) {
  return client
    .from("assignments")
    .select("*, events!inner(*)")
    .eq("crew_id", crew_id)
    .gte("events.start_datetime", fromIso)
    .order("start_datetime", { referencedTable: "events", ascending: true });
}

// Crew confirms or declines their own assignment. Ownership + allowed status
// values are enforced by RLS and the assignment_guard_crew_response trigger.
export async function respondToAssignment(
  client: SupabaseClient,
  assignment_id: string,
  status: Extract<Assignment["status"], "confirmed" | "declined">
) {
  return client
    .from("assignments")
    .update({ status, responded_at: new Date().toISOString() })
    .eq("id", assignment_id)
    .select()
    .single();
}

// ─── Matching pool ────────────────────────────────────────────
export async function getMatchingPool(
  client: SupabaseClient,
  eventDate: string
) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: crewList } = await client
    .from("crew")
    .select("*, crew_skills(skill_id, level, certified)")
    .eq("status", "active");

  if (!crewList) return { data: [], error: null };

  const { data: avail } = await client
    .from("availability")
    .select("id, crew_id, date, status, created_at, updated_at")
    .eq("date", eventDate);

  const { data: recentAssignments } = await client
    .from("assignments")
    .select("crew_id")
    .gte("created_at", thirtyDaysAgo.toISOString())
    .in("status", ["confirmed", "checked_in"]);

  const assignmentCounts = (recentAssignments ?? []).reduce<
    Record<string, number>
  >((acc, a) => {
    acc[a.crew_id] = (acc[a.crew_id] ?? 0) + 1;
    return acc;
  }, {});

  const availMap = new Map(
    (avail ?? []).map((a) => [a.crew_id, a])
  );

  const pool = crewList.map((c) => ({
    ...c,
    availability: availMap.has(c.id) ? [availMap.get(c.id)!] : [],
    recent_assignment_count: assignmentCounts[c.id] ?? 0,
  }));

  return { data: pool, error: null };
}

// ─── Skills ──────────────────────────────────────────────────
export async function listSkills(client: SupabaseClient) {
  return client.from("skills").select("*").order("name");
}

// ─── Dashboard stats ──────────────────────────────────────────
export async function getDashboardStats(client: SupabaseClient) {
  const now = new Date().toISOString();
  const in30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const [crewCount, upcomingEvents, openSlots] = await Promise.all([
    client.from("crew").select("id", { count: "exact", head: true }).eq("status", "active"),
    client
      .from("events")
      .select("*, assignments(count)")
      .gte("start_datetime", now)
      .lte("start_datetime", in30)
      .in("status", ["planned", "confirmed"])
      .order("start_datetime"),
    client
      .from("events")
      .select("id, crew_needed, assignments(count)")
      .gte("start_datetime", now)
      .in("status", ["planned", "confirmed"]),
  ]);

  return { crewCount, upcomingEvents, openSlots };
}
