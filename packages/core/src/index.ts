// packages/core — public API
// ─────────────────────────────────────────────────────────────
// BOUNDARY RULE: This package exports LOGIC only, never UI.
// shadcn/ui, Tailwind classes, React components — stay in apps/web.
// ─────────────────────────────────────────────────────────────

export * from "./types/index.js";
export * from "./schemas/index.js";
export * from "./matching/index.js";
export * from "./automation/index.js";
export * from "./analytics/index.js";
export * from "./costing/index.js";
export * from "./payroll/index.js";
export * from "./timesheet/index.js";
export * from "./db/index.js";
export * from "./ai/index.js";
export * from "./adapters/index.js";
