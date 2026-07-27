// Costing — pure, no I/O. Computes labour cost and margin per crew / per event
// from charge + cost rates and hours. Mirrors the matching/automation packages:
// the UI feeds in already-fetched rows, this decides the numbers. Backed by
// crew.hourly_cost + events.charge_rate (migration 0015, flag NEXT_PUBLIC_COSTING).

import type { CrewSeniority } from "../types/index.js";

/**
 * Indicative default hourly cost (EUR) per seniority, used when a crew member
 * has no explicit hourly_cost yet — so the margin view shows a usable estimate
 * from day one. These are placeholders; set real rates per crew member.
 */
export const DEFAULT_HOURLY_COST_BY_SENIORITY: Record<CrewSeniority, number> = {
  sitecrew: 18,
  senior: 23,
  teamlead: 28,
};

/** Hours between two ISO datetimes, rounded to 2 decimals, never negative. */
export function eventDurationHours(start_iso: string, end_iso: string): number {
  const start = Date.parse(start_iso);
  const end = Date.parse(end_iso);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 0;
  return Math.round(((end - start) / 3_600_000) * 100) / 100;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface CostingLineInput {
  /** Stable id for the row (assignment id) — passed through to the result. */
  id: string;
  seniority: CrewSeniority;
  /** Explicit cost rate; falls back to the seniority default when null. */
  hourly_cost?: number | null;
  /** Actual worked hours; falls back to planned_hours when null. */
  hours_worked?: number | null;
  /** Only secured crew (confirmed/checked_in) count toward cost + margin. */
  secured: boolean;
}

export interface EventCostingInput {
  /** Hourly charge to the client per crew-hour; null = revenue unknown. */
  charge_rate?: number | null;
  /** Planned shift length, used when a line has no worked hours yet. */
  planned_hours: number;
  /** Optional override of the seniority default costs. */
  default_cost?: Partial<Record<CrewSeniority, number>>;
  lines: CostingLineInput[];
}

export interface CostingLine {
  id: string;
  seniority: CrewSeniority;
  hours: number;
  cost_rate: number;
  /** True when cost_rate came from a default, not the crew's own hourly_cost. */
  cost_estimated: boolean;
  line_cost: number;
  /** Revenue/margin are null when no charge_rate is set. */
  line_revenue: number | null;
  line_margin: number | null;
}

export interface EventCosting {
  revenue: number | null;
  cost: number;
  margin: number | null;
  /** Margin as a fraction of revenue (0..1), or null when revenue is unknown/0. */
  margin_pct: number | null;
  /** Total billable hours across secured crew. */
  hours: number;
  /** True when any line fell back to a default cost rate. */
  has_estimates: boolean;
  lines: CostingLine[];
}

/**
 * Computes labour cost + margin for an event. Only secured crew contribute.
 * Revenue is only produced when charge_rate is set; otherwise revenue/margin are
 * null (cost is still computed so the planner sees the wage bill regardless).
 */
export function computeEventCosting(input: EventCostingInput): EventCosting {
  const { charge_rate, planned_hours, default_cost, lines } = input;
  const defaults = { ...DEFAULT_HOURLY_COST_BY_SENIORITY, ...default_cost };
  const hasCharge = charge_rate != null && charge_rate > 0;

  const resultLines: CostingLine[] = [];
  let totalCost = 0;
  let totalRevenue = 0;
  let totalHours = 0;
  let hasEstimates = false;

  for (const line of lines) {
    if (!line.secured) continue;
    const hours = line.hours_worked != null ? line.hours_worked : planned_hours;
    const ownRate = line.hourly_cost != null;
    const costRate = ownRate ? line.hourly_cost! : defaults[line.seniority];
    if (!ownRate) hasEstimates = true;

    const lineCost = round2(hours * costRate);
    const lineRevenue = hasCharge ? round2(hours * charge_rate!) : null;
    const lineMargin = lineRevenue != null ? round2(lineRevenue - lineCost) : null;

    totalCost += lineCost;
    totalHours += hours;
    if (lineRevenue != null) totalRevenue += lineRevenue;

    resultLines.push({
      id: line.id,
      seniority: line.seniority,
      hours: round2(hours),
      cost_rate: round2(costRate),
      cost_estimated: !ownRate,
      line_cost: lineCost,
      line_revenue: lineRevenue,
      line_margin: lineMargin,
    });
  }

  const cost = round2(totalCost);
  const revenue = hasCharge ? round2(totalRevenue) : null;
  const margin = revenue != null ? round2(revenue - cost) : null;
  const margin_pct = revenue != null && revenue > 0 ? round2(margin! / revenue) : null;

  return {
    revenue,
    cost,
    margin,
    margin_pct,
    hours: round2(totalHours),
    has_estimates: hasEstimates,
    lines: resultLines,
  };
}
