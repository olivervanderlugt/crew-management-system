import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CrewTable } from "@/components/crew/CrewTable";
import { isoDate, cn } from "@/lib/utils";
import { getMyAdminPerms } from "@/lib/admin/perms";
import { can } from "@/lib/admin/modules";
import type { Crew } from "@crewops/core";
import { Plus, Upload, ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE = 50;

type SortField = "crew_code" | "first_name" | "last_name" | "home_city" | "seniority" | "status";
const SORT_FIELDS: SortField[] = ["crew_code", "first_name", "last_name", "home_city", "seniority", "status"];

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function CrewPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const q = params.q ?? "";
  const city = params.city ?? "";
  // Default to active only — inactive crew are hidden unless explicitly requested.
  const status = params.status ?? "active";
  const seniority = params.seniority ?? "";
  const car = params.car === "1";
  const license = params.license === "1";
  const vog = params.vog ?? ""; // "" | valid | expired | missing
  const sort = (SORT_FIELDS.includes(params.sort as SortField) ? params.sort : "last_name") as SortField;
  const dir = params.dir === "desc" ? "desc" : "asc";
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const offset = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();
  const canCrew = can(await getMyAdminPerms(), "crew");

  // ── VOG filter: resolve the crew_id set from crew_documents ──
  const vogValidIds = new Set<string>();
  const vogExpiredIds = new Set<string>();
  if (vog) {
    const today = isoDate(new Date());
    const { data: vogDocs } = await supabase
      .from("crew_documents")
      .select("crew_id, expires_on")
      .eq("doc_type", "vog");
    for (const d of (vogDocs ?? []) as { crew_id: string; expires_on: string | null }[]) {
      if (!d.expires_on || d.expires_on >= today) vogValidIds.add(d.crew_id);
      else vogExpiredIds.add(d.crew_id);
    }
  }

  const NO_MATCH = "00000000-0000-0000-0000-000000000000";

  // Apply the shared filters to a crew query builder (count + data share these).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function applyFilters(qb: any): any {
    if (status !== "all") qb = qb.eq("status", status);
    if (seniority) qb = qb.eq("seniority", seniority);
    if (car) qb = qb.eq("has_car", true);
    if (license) qb = qb.eq("has_license", true);
    if (city) qb = qb.ilike("home_city", `%${city}%`);
    if (q) qb = qb.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,crew_code.ilike.%${q}%`);
    if (vog === "valid") {
      const ids = [...vogValidIds];
      qb = qb.in("id", ids.length ? ids : [NO_MATCH]);
    } else if (vog === "expired") {
      const ids = [...vogExpiredIds].filter((id) => !vogValidIds.has(id));
      qb = qb.in("id", ids.length ? ids : [NO_MATCH]);
    } else if (vog === "missing") {
      // crew with NO valid VOG = NOT IN the valid set. supabase-js .not(col,'in',value)
      // interpolates value as-is, so the "(a,b,c)" string is the correct PostgREST form.
      const ids = [...vogValidIds];
      if (ids.length) qb = qb.not("id", "in", `(${ids.join(",")})`);
    }
    return qb;
  }

  const { count } = await applyFilters(
    supabase.from("crew").select("id", { count: "exact", head: true })
  );
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const { data: crew } = await applyFilters(
    supabase
      .from("crew")
      .select("*")
      .order(sort, { ascending: dir === "asc" })
      .range(offset, offset + PAGE_SIZE - 1)
  );
  const rows = (crew ?? []) as Crew[];

  // VOG status for the displayed page (small targeted query).
  const pageIds = rows.map((r) => r.id);
  const vogByCrew = new Map<string, "valid" | "expired">();
  if (pageIds.length) {
    const today = isoDate(new Date());
    const { data: docs } = await supabase
      .from("crew_documents")
      .select("crew_id, expires_on")
      .eq("doc_type", "vog")
      .in("crew_id", pageIds);
    for (const d of (docs ?? []) as { crew_id: string; expires_on: string | null }[]) {
      const valid = !d.expires_on || d.expires_on >= today;
      const cur = vogByCrew.get(d.crew_id);
      if (valid) vogByCrew.set(d.crew_id, "valid");
      else if (cur !== "valid") vogByCrew.set(d.crew_id, "expired");
    }
  }

  function buildUrl(overrides: Record<string, string | undefined>) {
    const next: Record<string, string> = {};
    if (q) next.q = q;
    if (city) next.city = city;
    // Always encode the resolved status (defaults to "active") so sort/page links
    // keep the current filter in the URL.
    if (status) next.status = status;
    if (seniority) next.seniority = seniority;
    if (car) next.car = "1";
    if (license) next.license = "1";
    if (vog) next.vog = vog;
    if (params.sort) next.sort = params.sort;
    if (params.dir) next.dir = params.dir;
    if (page > 1) next.page = String(page);
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined || v === "") delete next[k];
      else next[k] = v;
    }
    const qs = new URLSearchParams(next).toString();
    return `/crew${qs ? `?${qs}` : ""}`;
  }

  const statusOptions = [
    { value: "active", label: "Actief" },
    { value: "prospect", label: "Prospect" },
    { value: "inactive", label: "Inactief" },
    { value: "all", label: "Alle" },
  ];
  const seniorityOptions = [
    { value: "", label: "Alle functies" },
    { value: "sitecrew", label: "Sitecrew" },
    { value: "senior", label: "Senior" },
    { value: "teamlead", label: "Teamleider" },
  ];
  const vogOptions = [
    { value: "", label: "VOG: alle" },
    { value: "valid", label: "VOG geldig" },
    { value: "expired", label: "VOG verlopen" },
    { value: "missing", label: "VOG ontbreekt" },
  ];

  function Pill({ active, href, children }: { active: boolean; href: string; children: React.ReactNode }) {
    return (
      <Link
        href={href}
        className={cn(
          "px-3 py-1 rounded-md text-xs font-medium transition-colors",
          active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
        )}
      >
        {children}
      </Link>
    );
  }

  // Precompute sort links (each toggles direction if already active) for the
  // client table, so it doesn't need to know about the URL/filter scheme.
  const buildSortUrl: Record<string, string> = {};
  for (const field of SORT_FIELDS) {
    const active = sort === field;
    const nextDir = active && dir === "asc" ? "desc" : "asc";
    buildSortUrl[field] = buildUrl({ sort: field, dir: nextDir, page: undefined });
  }

  const vogRecord: Record<string, "valid" | "expired"> = {};
  for (const [id, state] of vogByCrew) vogRecord[id] = state;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Topbar
        title={`Crew${total > 0 ? ` (${total})` : ""}`}
        actions={
          canCrew ? (
            <>
              <Button asChild variant="outline" size="sm">
                <Link href="/crew/import"><Upload /> Importeer CSV</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/crew/new"><Plus /> Nieuw crewlid</Link>
              </Button>
            </>
          ) : undefined
        }
      />

      {/* Filter bar */}
      <div className="flex flex-col gap-2 px-4 py-2 border-b bg-background shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <form method="get" action="/crew" className="flex items-center gap-2">
            {/* preserve non-search filters on submit */}
            {params.status && <input type="hidden" name="status" value={params.status} />}
            {seniority && <input type="hidden" name="seniority" value={seniority} />}
            {car && <input type="hidden" name="car" value="1" />}
            {license && <input type="hidden" name="license" value="1" />}
            {vog && <input type="hidden" name="vog" value={vog} />}
            {params.sort && <input type="hidden" name="sort" value={params.sort} />}
            {params.dir && <input type="hidden" name="dir" value={params.dir} />}
            <Input name="q" defaultValue={q} placeholder="Zoek op naam of crew ID…" className="h-8 w-56 text-sm" />
            <Input name="city" defaultValue={city} placeholder="Woonplaats…" className="h-8 w-36 text-sm" />
            <Button type="submit" size="sm" variant="outline" className="h-8">Filter</Button>
          </form>

          <div className="flex items-center gap-1 ml-auto">
            {statusOptions.map((opt) => (
              <Pill key={opt.value} active={status === opt.value} href={buildUrl({ status: opt.value, page: undefined })}>
                {opt.label}
              </Pill>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-wrap text-xs">
          {seniorityOptions.map((opt) => (
            <Pill key={opt.value || "all"} active={seniority === opt.value} href={buildUrl({ seniority: opt.value || undefined, page: undefined })}>
              {opt.label}
            </Pill>
          ))}
          <span className="mx-1 text-border">|</span>
          <Pill active={car} href={buildUrl({ car: car ? undefined : "1", page: undefined })}>🚗 Auto</Pill>
          <Pill active={license} href={buildUrl({ license: license ? undefined : "1", page: undefined })}>🪪 Rijbewijs</Pill>
          <span className="mx-1 text-border">|</span>
          {vogOptions.map((opt) => (
            <Pill key={opt.value || "all"} active={vog === opt.value} href={buildUrl({ vog: opt.value || undefined, page: undefined })}>
              {opt.label}
            </Pill>
          ))}
        </div>
      </div>

      {/* Table (client island: selection, bulk status, CSV export) */}
      <CrewTable
        rows={rows}
        vog={vogRecord}
        canCrew={canCrew}
        sort={sort}
        dir={dir}
        buildSortUrl={buildSortUrl}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2 border-t bg-background shrink-0">
          <span className="text-xs text-muted-foreground">{offset + 1}–{Math.min(offset + PAGE_SIZE, total)} van {total}</span>
          <div className="flex items-center gap-1">
            <Button asChild variant="outline" size="sm" className="h-7 px-2" aria-disabled={page <= 1}>
              <Link href={buildUrl({ page: page > 1 ? String(page - 1) : undefined })}><ChevronLeft className="h-3 w-3" /></Link>
            </Button>
            <span className="text-xs px-2 text-muted-foreground">{page} / {totalPages}</span>
            <Button asChild variant="outline" size="sm" className="h-7 px-2" aria-disabled={page >= totalPages}>
              <Link href={buildUrl({ page: page < totalPages ? String(page + 1) : String(page) })}><ChevronRight className="h-3 w-3" /></Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
