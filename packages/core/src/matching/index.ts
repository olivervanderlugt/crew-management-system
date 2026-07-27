import type {
  MatchCandidate,
  MatchFactor,
  MatchRequest,
  MatchResult,
  CrewWithAvailability,
  AvailabilityStatus,
} from "../types/index.js";

// ─── Score weights ────────────────────────────────────────────
const WEIGHTS: Record<MatchFactor, number> = {
  availability: 40,
  skill_match: 25,
  transport: 15,
  seniority: 10,
  workload_balance: 10,
};

// ─── Availability scoring ─────────────────────────────────────
function scoreAvailability(
  status: AvailabilityStatus | undefined
): { score: number; label: string } {
  switch (status) {
    case "B":
      return { score: 1.0, label: "Beschikbaar (B)" };
    case "M":
      return { score: 0.5, label: "Misschien beschikbaar (M)" };
    case "X":
      return { score: 0, label: "Niet beschikbaar (X)" };
    case "W":
      return { score: 0.3, label: "Status W (zie callsheet)" };
    case "V":
      return { score: 0.3, label: "Status V (zie callsheet)" };
    default:
      return { score: 0.2, label: "Geen beschikbaarheid opgegeven" };
  }
}

// ─── Main matching function ───────────────────────────────────
/**
 * Pure function: scores and ranks crew candidates for an event.
 * No side effects, no I/O — safe to test in isolation.
 */
export function matchCrew(request: MatchRequest): MatchResult {
  const { event, required_skills, crew_pool } = request;
  const eventDate = event.start_datetime.split("T")[0] ?? "";

  // Pre-compute skill IDs required
  const requiredSkillIds = new Set(required_skills.map((s) => s.skill_id));

  // Conflict-aware matching: crew already booked on a time-overlapping event are
  // excluded so the planner can't double-book. The caller resolves the overlaps
  // (the pure function only needs the resulting id set).
  const busyCrewIds = new Set(request.busy_crew_ids ?? []);

  // Build a map of crew_id → recent assignment count for workload balancing.
  // In the pure function we rely on whatever the caller passes; the DB layer
  // can enrich crew objects with a recent_assignment_count field.
  const candidates: MatchCandidate[] = crew_pool.map((crew) => {
    const reasons: MatchCandidate["reasons"] = [];
    let excluded = false;
    let exclusion_reason: string | null = null;

    // 1. Availability
    const todayAvailability = crew.availability.find(
      (a) => a.date === eventDate
    );
    const avail = scoreAvailability(todayAvailability?.status);
    const availScore = avail.score * WEIGHTS.availability;

    if (todayAvailability?.status === "X") {
      excluded = true;
      exclusion_reason = "Niet beschikbaar op eventdatum (X)";
    }

    // Conflict-aware: already booked on a time-overlapping event. Keep the X
    // reason if both apply (unavailability is the more fundamental block).
    if (!excluded && busyCrewIds.has(crew.id)) {
      excluded = true;
      exclusion_reason = "Al ingepland op een overlappend event";
    }

    reasons.push({
      factor: "availability",
      score: availScore,
      label: avail.label,
    });

    // 2. Skill match
    const crewSkillIds = new Set(
      (
        crew as CrewWithAvailability & {
          crew_skills?: Array<{ skill_id: string }>;
        }
      ).crew_skills?.map((s) => s.skill_id) ?? []
    );
    let skillScore = 0;
    if (requiredSkillIds.size === 0) {
      skillScore = WEIGHTS.skill_match;
      reasons.push({
        factor: "skill_match",
        score: skillScore,
        label: "Geen specifieke skills vereist",
      });
    } else {
      let matched = 0;
      requiredSkillIds.forEach((id) => {
        if (crewSkillIds.has(id)) matched++;
      });
      const ratio = matched / requiredSkillIds.size;
      skillScore = ratio * WEIGHTS.skill_match;
      reasons.push({
        factor: "skill_match",
        score: skillScore,
        label:
          ratio === 1
            ? "Alle vereiste skills aanwezig"
            : ratio > 0
              ? `${matched}/${requiredSkillIds.size} vereiste skills`
              : "Geen vereiste skills",
      });
    }

    // 3. Transport
    let transportScore = 0;
    if (crew.has_car) {
      transportScore = WEIGHTS.transport;
      reasons.push({
        factor: "transport",
        score: transportScore,
        label: "Eigen auto beschikbaar",
      });
    } else if (crew.has_license) {
      transportScore = WEIGHTS.transport * 0.5;
      reasons.push({
        factor: "transport",
        score: transportScore,
        label: "Rijbewijs aanwezig (geen eigen auto)",
      });
    } else {
      reasons.push({
        factor: "transport",
        score: 0,
        label: "Geen auto of rijbewijs",
      });
    }

    // 4. Seniority / role fit
    let seniorityScore = 0;
    if (crew.seniority === "teamlead") {
      seniorityScore = WEIGHTS.seniority;
      reasons.push({
        factor: "seniority",
        score: seniorityScore,
        label: "Teamleider",
      });
    } else if (crew.seniority === "senior") {
      seniorityScore = WEIGHTS.seniority * 0.7;
      reasons.push({
        factor: "seniority",
        score: seniorityScore,
        label: "Senior crewlid",
      });
    } else {
      seniorityScore = WEIGHTS.seniority * 0.4;
      reasons.push({
        factor: "seniority",
        score: seniorityScore,
        label: "Sitecrew",
      });
    }

    // 5. Workload balance (prefer crew with fewer recent assignments)
    const recentAssignments =
      (
        crew as CrewWithAvailability & { recent_assignment_count?: number }
      ).recent_assignment_count ?? 0;
    const workloadScore =
      WEIGHTS.workload_balance * Math.max(0, 1 - recentAssignments / 10);
    reasons.push({
      factor: "workload_balance",
      score: workloadScore,
      label:
        recentAssignments === 0
          ? "Weinig recente opdrachten"
          : `${recentAssignments} recente opdrachten`,
    });

    const totalScore =
      availScore + skillScore + transportScore + seniorityScore + workloadScore;

    return {
      crew,
      score: Math.round(totalScore * 10) / 10,
      reasons,
      excluded,
      exclusion_reason,
    };
  });

  // Sort: non-excluded first, then by score descending
  candidates.sort((a, b) => {
    if (a.excluded !== b.excluded) return a.excluded ? 1 : -1;
    return b.score - a.score;
  });

  return {
    candidates,
    total_available: candidates.filter((c) => !c.excluded).length,
    total_excluded: candidates.filter((c) => c.excluded).length,
  };
}

export type { MatchRequest, MatchResult, MatchCandidate };
