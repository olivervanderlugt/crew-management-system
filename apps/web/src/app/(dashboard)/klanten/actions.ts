"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hasPerm } from "@/lib/admin/perms";

type Result = { ok: true } | { ok: false; error: string };

export type ClientInput = {
  name: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  venue: string;
  address: string;
  notes: string;
};

function clean(i: ClientInput) {
  const nz = (s: string) => s.trim() || null;
  return {
    name: i.name.trim(),
    contact_name: nz(i.contact_name),
    contact_phone: nz(i.contact_phone),
    contact_email: nz(i.contact_email),
    venue: nz(i.venue),
    address: nz(i.address),
    notes: nz(i.notes),
  };
}

export async function createClientRecord(input: ClientInput): Promise<Result> {
  if (!(await hasPerm("events"))) return { ok: false, error: "Geen rechten voor klanten." };
  if (!input.name.trim()) return { ok: false, error: "Naam is verplicht." };
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("clients") as any).insert(clean(input));
  if (error) return { ok: false, error: error.message };
  revalidatePath("/klanten");
  return { ok: true };
}

export async function updateClientRecord(id: string, input: ClientInput): Promise<Result> {
  if (!(await hasPerm("events"))) return { ok: false, error: "Geen rechten voor klanten." };
  if (!input.name.trim()) return { ok: false, error: "Naam is verplicht." };
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("clients") as any).update(clean(input)).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/klanten");
  return { ok: true };
}

export async function deleteClientRecord(id: string): Promise<Result> {
  if (!(await hasPerm("events"))) return { ok: false, error: "Geen rechten voor klanten." };
  const supabase = await createClient();
  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/klanten");
  return { ok: true };
}
