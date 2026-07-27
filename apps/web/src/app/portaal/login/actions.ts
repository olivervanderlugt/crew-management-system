"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type LoginState = { ok: boolean; message: string };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Sends a passwordless magic link — but only to an email that belongs to an
// active crew member. The response is deliberately identical whether or not the
// email is known, so the form can't be used to enumerate crew addresses.
export async function requestMagicLink(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!EMAIL_RE.test(email)) {
    return { ok: false, message: "Vul een geldig e-mailadres in." };
  }

  const generic: LoginState = {
    ok: true,
    message: "Als dit adres bij ons bekend is, ontvang je zo een inloglink. Check je mail.",
  };

  // Service role: look up crew by email, bypassing RLS.
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("crew")
    .select("id, status")
    .ilike("email", email)
    .limit(1);
  const crew = rows?.[0];

  if (!crew || crew.status !== "active") {
    return generic; // never reveal whether the email exists
  }

  const h = await headers();
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    h.get("origin") ??
    `http://${h.get("host") ?? "localhost:3000"}`;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${origin}/portaal/auth/callback`,
    },
  });

  if (error) {
    return { ok: false, message: "Versturen van de link is mislukt. Probeer het later opnieuw." };
  }
  return generic;
}
