import { describe, it, expect } from "vitest";
import {
  computeOccupancyStatus,
  distanceKm,
  parseLeadDays,
  daysBetween,
  businessDate,
  monthLabelNl,
  availabilitySubject,
  eventReminderMessage,
  availabilityReminderMessage,
  documentExpiryStatus,
  parseWarnDays,
  documentExpirySubject,
  documentExpiryMessage,
} from "./index.js";
import { matchCrew } from "../matching/index.js";
import type { CrewWithAvailability, MatchRequest } from "../types/index.js";

// ─── computeOccupancyStatus ───────────────────────────────────
describe("computeOccupancyStatus", () => {
  it("promotes planned → confirmed once enough crew are secured", () => {
    expect(
      computeOccupancyStatus({
        crew_needed: 2,
        current_status: "planned",
        assignment_statuses: ["confirmed", "confirmed", "proposed"],
      })
    ).toBe("confirmed");
  });

  it("counts checked_in as secured", () => {
    expect(
      computeOccupancyStatus({
        crew_needed: 2,
        current_status: "planned",
        assignment_statuses: ["confirmed", "checked_in"],
      })
    ).toBe("confirmed");
  });

  it("demotes confirmed → planned when a confirmation drops out", () => {
    expect(
      computeOccupancyStatus({
        crew_needed: 3,
        current_status: "confirmed",
        assignment_statuses: ["confirmed", "confirmed", "declined"],
      })
    ).toBe("planned");
  });

  it("returns null when nothing should change", () => {
    expect(
      computeOccupancyStatus({
        crew_needed: 2,
        current_status: "confirmed",
        assignment_statuses: ["confirmed", "confirmed"],
      })
    ).toBeNull();
    expect(
      computeOccupancyStatus({
        crew_needed: 2,
        current_status: "planned",
        assignment_statuses: ["confirmed"],
      })
    ).toBeNull();
  });

  it("never touches draft, done or cancelled events", () => {
    for (const status of ["draft", "done", "cancelled"] as const) {
      expect(
        computeOccupancyStatus({
          crew_needed: 1,
          current_status: status,
          assignment_statuses: ["confirmed", "confirmed"],
        })
      ).toBeNull();
    }
  });

  it("treats crew_needed 0 as never-enough (avoids spurious confirm)", () => {
    expect(
      computeOccupancyStatus({
        crew_needed: 0,
        current_status: "planned",
        assignment_statuses: [],
      })
    ).toBeNull();
  });
});

// ─── distanceKm ───────────────────────────────────────────────
describe("distanceKm", () => {
  it("returns null when a coordinate is missing", () => {
    expect(distanceKm({ latitude: 51.7, longitude: 5.3 }, { latitude: null, longitude: 5 })).toBeNull();
  });

  it("is 0 for the same point", () => {
    expect(distanceKm({ latitude: 51.7, longitude: 5.3 }, { latitude: 51.7, longitude: 5.3 })).toBe(0);
  });

  it("approximates Amsterdam → Eindhoven (~30 km)", () => {
    const d = distanceKm({ latitude: 51.6978, longitude: 5.3037 }, { latitude: 51.4416, longitude: 5.4697 });
    expect(d).not.toBeNull();
    expect(d!).toBeGreaterThan(25);
    expect(d!).toBeLessThan(35);
  });
});

// ─── reminder helpers ─────────────────────────────────────────
describe("parseLeadDays", () => {
  it("parses, sorts and de-dupes", () => {
    expect(parseLeadDays("3,1,7,3")).toEqual([1, 3, 7]);
  });
  it("falls back to [3] for empty/invalid", () => {
    expect(parseLeadDays(undefined)).toEqual([3]);
    expect(parseLeadDays("abc, -2, 0")).toEqual([3]);
  });
});

describe("daysBetween", () => {
  it("counts whole days forward", () => {
    expect(daysBetween(new Date("2026-06-21T12:00:00Z"), new Date("2026-06-24T12:00:00Z"))).toBe(3);
  });

  // The previous implementation read the *server's* local date parts, so this
  // pair answered 3 under TZ=UTC and 4 under TZ=Europe/Amsterdam. 22:30Z on the
  // 24th is 00:30 on the 25th in Amsterdam, which is the day the crew member
  // actually works — so the answer must be 4 wherever this runs.
  it("counts the day the crew member experiences, not the server's", () => {
    const cronRun = new Date("2026-06-21T08:00:00Z");
    const shiftStart = new Date("2026-06-24T22:30:00Z");
    expect(daysBetween(cronRun, shiftStart)).toBe(4);
  });

  it("answers per timezone, and the default does not follow the server", () => {
    const a = new Date("2026-06-21T08:00:00Z");
    // 13:00Z is the 24th in Amsterdam (15:00 CEST) but already the 25th in
    // Auckland (01:00 NZST) — a genuine one-day disagreement.
    const b = new Date("2026-06-24T13:00:00Z");
    expect(daysBetween(a, b, "Europe/Amsterdam")).toBe(3);
    expect(daysBetween(a, b, "Pacific/Auckland")).toBe(4);
    // The default is the business timezone, never whatever TZ the process has.
    expect(daysBetween(a, b)).toBe(daysBetween(a, b, "Europe/Amsterdam"));
  });

  // Reminders are matched on an exact lead-day count with no catch-up, so a
  // shift that crosses midnight in the business timezone must not be counted
  // against the previous day.
  it("puts a shift starting just after local midnight on its own day", () => {
    expect(businessDate(new Date("2026-06-24T22:30:00Z"))).toBe("2026-06-25");
    expect(businessDate(new Date("2026-01-24T22:30:00Z"))).toBe("2026-01-24"); // CET, not CEST
  });
});

describe("message builders", () => {
  it("monthLabelNl + availabilitySubject embed the month for dedupe", () => {
    const d = new Date("2026-07-15T12:00:00Z");
    expect(monthLabelNl(d)).toBe("juli 2026");
    expect(availabilitySubject(d)).toBe("Beschikbaarheid juli 2026");
  });

  it("event reminder includes the confirm link only when provided", () => {
    const base = { crew_first_name: "Sam", event_name: "Zomerfestival", event_date: "za 27 jun", event_time: "18:00" };
    expect(eventReminderMessage(base)).not.toContain("Bevestig");
    expect(eventReminderMessage({ ...base, venue: "Megaland", confirm_url: "https://x/c/1" }))
      .toContain("https://x/c/1");
  });

  it("availability reminder mentions the month", () => {
    expect(
      availabilityReminderMessage({ crew_first_name: "Sam", month_label: "juli 2026" })
    ).toContain("juli 2026");
  });
});

// ─── document expiry ──────────────────────────────────────────
describe("documentExpiryStatus", () => {
  const today = new Date("2026-06-22T12:00:00Z");

  it("returns null when there is no expiry date", () => {
    expect(documentExpiryStatus(null, today, 30)).toBeNull();
    expect(documentExpiryStatus(undefined, today, 30)).toBeNull();
  });

  it("flags a past date as expired", () => {
    expect(documentExpiryStatus("2026-06-21", today, 30)).toBe("expired");
  });

  it("flags a date within the warn window as expiring_soon", () => {
    expect(documentExpiryStatus("2026-07-10", today, 30)).toBe("expiring_soon");
    expect(documentExpiryStatus("2026-06-22", today, 30)).toBe("expiring_soon"); // today = 0 days
  });

  it("treats a date beyond the window as ok", () => {
    expect(documentExpiryStatus("2026-08-01", today, 30)).toBe("ok");
  });

  it("is timezone-stable around midnight", () => {
    // Same calendar day regardless of the time component of `today`.
    expect(documentExpiryStatus("2026-06-22", new Date("2026-06-22T23:30:00Z"), 0)).toBe("expiring_soon");
  });
});

describe("parseWarnDays", () => {
  it("parses a positive integer", () => {
    expect(parseWarnDays("14")).toBe(14);
  });
  it("falls back for empty/invalid/non-positive", () => {
    expect(parseWarnDays(undefined)).toBe(30);
    expect(parseWarnDays("abc")).toBe(30);
    expect(parseWarnDays("0")).toBe(30);
    expect(parseWarnDays("-5", 7)).toBe(7);
  });
});

describe("document expiry messages", () => {
  it("subject embeds title + raw date for per-instance dedupe", () => {
    expect(documentExpirySubject("VCA 2024", "2026-12-31")).toBe(
      "Certificaat verloopt: VCA 2024 (2026-12-31)"
    );
  });

  it("body differs for expired vs expiring", () => {
    const base = { crew_first_name: "Sam", doc_title: "VCA 2024", expires_date: "31 dec 2026" };
    expect(documentExpiryMessage({ ...base, expired: false })).toContain("verloopt op");
    expect(documentExpiryMessage({ ...base, expired: true })).toContain("is verlopen op");
  });
});

// ─── conflict-aware matching ──────────────────────────────────
function makeCrew(overrides: Partial<CrewWithAvailability> = {}): CrewWithAvailability {
  return {
    id: "crew-1", crew_code: "CREW-0001", first_name: "Jan", last_name: "Jansen",
    phone: null, email: null, home_city: "Amsterdam", postcode: null,
    has_license: false, has_car: false, seniority: "sitecrew", status: "active",
    notes: null, external_id: null, user_id: null, street: null, address_2: null,
    date_of_birth: null, nationality: null, emergency_contact_name: null,
    emergency_contact_phone: null, shirt_size: null, start_date: null,
    drivers_license_number: null, iban: null, prospect_source: null,
    prospect_status: null, prospect_applied_on: null, prospect_next_action_on: null,
    prospect_notes: null, created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z", availability: [], ...overrides,
  };
}

const baseEvent: MatchRequest["event"] = {
  id: "event-1",
  start_datetime: "2025-06-15T09:00:00Z",
  end_datetime: "2025-06-15T18:00:00Z",
  crew_needed: 2,
};

describe("matchCrew — conflict awareness", () => {
  it("excludes crew listed in busy_crew_ids and sorts them last", () => {
    const free = makeCrew({
      id: "free", crew_code: "CREW-0002",
      availability: [{ id: "a1", crew_id: "free", date: "2025-06-15", status: "B", created_at: "", updated_at: "" }],
    });
    const busy = makeCrew({
      id: "busy", crew_code: "CREW-0003",
      availability: [{ id: "a2", crew_id: "busy", date: "2025-06-15", status: "B", created_at: "", updated_at: "" }],
    });
    const result = matchCrew({
      event: baseEvent,
      required_skills: [],
      crew_pool: [busy, free],
      busy_crew_ids: ["busy"],
    });
    const busyCandidate = result.candidates.find((c) => c.crew.id === "busy")!;
    expect(busyCandidate.excluded).toBe(true);
    expect(busyCandidate.exclusion_reason).toMatch(/overlappend/i);
    expect(result.candidates[0]?.crew.id).toBe("free"); // available crew first
  });

  it("keeps the X reason when crew is both unavailable and busy", () => {
    const both = makeCrew({
      id: "both", crew_code: "CREW-0004",
      availability: [{ id: "a3", crew_id: "both", date: "2025-06-15", status: "X", created_at: "", updated_at: "" }],
    });
    const result = matchCrew({
      event: baseEvent, required_skills: [], crew_pool: [both], busy_crew_ids: ["both"],
    });
    expect(result.candidates[0]?.exclusion_reason).toContain("(X)");
  });
});
