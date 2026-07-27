import { NextResponse } from "next/server";
import {
  documentExpiryStatus,
  documentExpiryMessage,
  documentExpirySubject,
  parseWarnDays,
  DOCUMENT_EXPIRY_SUBJECT_PREFIX,
} from "@crewops/core";
import { createServiceClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import {
  authorizeCron,
  contactFor,
  notificationsTableExists,
} from "@/lib/automation/cron";

// Enqueue "certificaat verloopt / is verlopen" reminders into the notifications
// outbox for crew whose documents (crew_documents.expires_on) are expired or
// expiring within the warn window. Idempotent: a document already holding a
// queued/sent reminder is skipped (deduped on crew_id + the subject, which
// embeds the document title + its expiry date), so a daily cron won't re-enqueue
// until the document is renewed (which yields a new expiry date → new subject).
//
// Trigger: GET/POST /api/cron/document-expiry  (Bearer CRON_SECRET, or admin).
// Config:  DOCUMENT_EXPIRY_WARN_DAYS=30 (default 30).

const TZ = "Europe/Amsterdam";
function formatExpiry(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: TZ,
  });
}

type DocRow = {
  id: string;
  crew_id: string;
  title: string;
  expires_on: string | null;
  crew: { first_name: string; phone: string | null; email: string | null; status: string } | null;
};

async function handle(request: Request) {
  const auth = await authorizeCron(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = await createServiceClient();
  if (!(await notificationsTableExists(supabase))) {
    return NextResponse.json(
      { skipped: true, reason: "notifications-tabel ontbreekt — pas migratie 0011 toe" },
      { status: 200 }
    );
  }

  const warnDays = parseWarnDays(process.env.DOCUMENT_EXPIRY_WARN_DAYS);
  const now = new Date();
  // Upper bound: only documents expiring within the window (or already expired)
  // are interesting. Cap the look-ahead at warnDays; no lower bound so we still
  // chase long-expired certificates until they are renewed.
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + warnDays);
  const horizonDay = horizon.toISOString().slice(0, 10);

  const { data: docData, error: docErr } = await supabase
    .from("crew_documents")
    .select("id, crew_id, title, expires_on, crew(first_name, phone, email, status)")
    .not("expires_on", "is", null)
    .lte("expires_on", horizonDay)
    .order("expires_on", { ascending: true });

  if (docErr) {
    console.error("document-expiry: query failed", docErr);
    return NextResponse.json({ error: "Kon documenten niet ophalen" }, { status: 500 });
  }

  const docs = (docData ?? []) as unknown as DocRow[];

  // Keep only active crew with a document that is expired or expiring soon.
  const flagged = docs.filter((d) => {
    if (!d.crew || d.crew.status !== "active") return false;
    const status = documentExpiryStatus(d.expires_on, now, warnDays);
    return status === "expired" || status === "expiring_soon";
  });
  if (flagged.length === 0) {
    return NextResponse.json({ queued: 0, documents_considered: docs.length });
  }

  // Dedupe: existing expiry notifications (subject starts with the shared prefix).
  const crewIds = [...new Set(flagged.map((d) => d.crew_id))];
  const { data: existing } = await supabase
    .from("notifications")
    .select("crew_id, subject")
    .like("subject", `${DOCUMENT_EXPIRY_SUBJECT_PREFIX}:%`)
    .in("status", ["queued", "sent"])
    .in("crew_id", crewIds);
  const alreadySent = new Set(
    ((existing ?? []) as { crew_id: string | null; subject: string }[]).map(
      (r) => `${r.crew_id}:${r.subject}`
    )
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: Record<string, any>[] = [];
  for (const d of flagged) {
    const crew = d.crew!;
    const subject = documentExpirySubject(d.title, d.expires_on!);
    if (alreadySent.has(`${d.crew_id}:${subject}`)) continue;
    const { channel, to } = contactFor(crew);
    if (!to) continue;

    const expired = documentExpiryStatus(d.expires_on, now, warnDays) === "expired";
    const body = documentExpiryMessage({
      crew_first_name: crew.first_name,
      doc_title: d.title,
      expires_date: formatExpiry(d.expires_on!),
      expired,
    });

    rows.push({
      crew_id: d.crew_id,
      event_id: null,
      channel,
      to_address: to,
      subject,
      body,
      status: "queued",
    });
  }

  if (rows.length === 0) {
    return NextResponse.json({ queued: 0, documents_considered: docs.length, flagged: flagged.length });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("notifications") as any).insert(rows).select("id");
  if (error) {
    console.error("document-expiry: insert failed", error);
    return NextResponse.json({ error: "Kon herinneringen niet in de wachtrij zetten" }, { status: 500 });
  }

  await writeAudit({
    action: "INSERT",
    table_name: "notifications",
    new_data: { kind: "document_expiry", queued: rows.length, warn_days: warnDays },
  });

  return NextResponse.json({ queued: (data ?? []).length, flagged: flagged.length });
}

export async function GET(request: Request) {
  return handle(request);
}
export async function POST(request: Request) {
  return handle(request);
}
