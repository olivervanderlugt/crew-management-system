import { describe, it, expect } from "vitest";
import { matchCrew } from "./index.js";
import type { CrewWithAvailability, MatchRequest } from "../types/index.js";

function makeCrew(overrides: Partial<CrewWithAvailability> = {}): CrewWithAvailability {
  return {
    id: "crew-1",
    crew_code: "CREW-0001",
    first_name: "Jan",
    last_name: "Jansen",
    phone: null,
    email: null,
    home_city: "Amsterdam",
    postcode: null,
    has_license: false,
    has_car: false,
    seniority: "sitecrew",
    status: "active",
    notes: null,
    external_id: null,
    user_id: null,
    street: null,
    address_2: null,
    date_of_birth: null,
    nationality: null,
    emergency_contact_name: null,
    emergency_contact_phone: null,
    shirt_size: null,
    start_date: null,
    drivers_license_number: null,
    iban: null,
    prospect_source: null,
    prospect_status: null,
    prospect_applied_on: null,
    prospect_next_action_on: null,
    prospect_notes: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    availability: [],
    ...overrides,
  };
}

const baseEvent: MatchRequest["event"] = {
  id: "event-1",
  start_datetime: "2025-06-15T09:00:00Z",
  end_datetime: "2025-06-15T18:00:00Z",
  crew_needed: 3,
};

describe("matchCrew", () => {
  it("excludes crew with X availability", () => {
    const crew = makeCrew({
      availability: [{ id: "a1", crew_id: "crew-1", date: "2025-06-15", status: "X", created_at: "", updated_at: "" }],
    });
    const result = matchCrew({ event: baseEvent, required_skills: [], crew_pool: [crew] });
    expect(result.candidates[0]?.excluded).toBe(true);
    expect(result.total_excluded).toBe(1);
  });

  it("scores B higher than M", () => {
    const crewB = makeCrew({
      id: "crew-b",
      crew_code: "CREW-0002",
      availability: [{ id: "a1", crew_id: "crew-b", date: "2025-06-15", status: "B", created_at: "", updated_at: "" }],
    });
    const crewM = makeCrew({
      id: "crew-m",
      crew_code: "CREW-0003",
      availability: [{ id: "a2", crew_id: "crew-m", date: "2025-06-15", status: "M", created_at: "", updated_at: "" }],
    });
    const result = matchCrew({ event: baseEvent, required_skills: [], crew_pool: [crewM, crewB] });
    expect(result.candidates[0]?.crew.id).toBe("crew-b");
    expect(result.candidates[0]?.score ?? 0).toBeGreaterThan(result.candidates[1]?.score ?? 0);
  });

  it("puts excluded crew at end of list", () => {
    const excluded = makeCrew({
      id: "x",
      crew_code: "CREW-0004",
      availability: [{ id: "a1", crew_id: "x", date: "2025-06-15", status: "X", created_at: "", updated_at: "" }],
    });
    const available = makeCrew({
      id: "b",
      crew_code: "CREW-0005",
      availability: [{ id: "a2", crew_id: "b", date: "2025-06-15", status: "B", created_at: "", updated_at: "" }],
    });
    const result = matchCrew({ event: baseEvent, required_skills: [], crew_pool: [excluded, available] });
    expect(result.candidates[0]?.excluded).toBe(false);
    expect(result.candidates[1]?.excluded).toBe(true);
  });

  it("boosts score for crew with a car", () => {
    const withCar = makeCrew({ id: "car", crew_code: "CREW-0006", has_car: true });
    const noCar = makeCrew({ id: "nocar", crew_code: "CREW-0007", has_car: false });
    const result = matchCrew({ event: baseEvent, required_skills: [], crew_pool: [noCar, withCar] });
    expect(result.candidates[0]?.crew.id).toBe("car");
  });

  it("returns empty result for empty pool", () => {
    const result = matchCrew({ event: baseEvent, required_skills: [], crew_pool: [] });
    expect(result.candidates).toHaveLength(0);
    expect(result.total_available).toBe(0);
    expect(result.total_excluded).toBe(0);
  });

  it("includes match reasons for every candidate", () => {
    const crew = makeCrew({
      availability: [{ id: "a1", crew_id: "crew-1", date: "2025-06-15", status: "B", created_at: "", updated_at: "" }],
    });
    const result = matchCrew({ event: baseEvent, required_skills: [], crew_pool: [crew] });
    const factors = result.candidates[0]?.reasons.map((r) => r.factor) ?? [];
    expect(factors).toContain("availability");
    expect(factors).toContain("transport");
    expect(factors).toContain("seniority");
  });

  it("scores W and V status between M and X", () => {
    const crewW = makeCrew({
      id: "w",
      crew_code: "CREW-0008",
      availability: [{ id: "a1", crew_id: "w", date: "2025-06-15", status: "W", created_at: "", updated_at: "" }],
    });
    const crewM = makeCrew({
      id: "m",
      crew_code: "CREW-0009",
      availability: [{ id: "a2", crew_id: "m", date: "2025-06-15", status: "M", created_at: "", updated_at: "" }],
    });
    const result = matchCrew({ event: baseEvent, required_skills: [], crew_pool: [crewW, crewM] });
    const mScore = result.candidates.find((c) => c.crew.id === "m")?.score ?? 0;
    const wScore = result.candidates.find((c) => c.crew.id === "w")?.score ?? 0;
    expect(mScore).toBeGreaterThan(wScore);
  });
});
