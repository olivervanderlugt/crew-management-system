import type { Metadata } from "next";
import { LoginForm } from "@/components/portal/LoginForm";

export const metadata: Metadata = { title: "Inloggen — Crew Portaal" };

export default async function PortalLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reden?: string }>;
}) {
  const { reden } = await searchParams;
  const notLinked = reden === "niet-gekoppeld" || reden === "ongeldig";

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-white font-bold text-xl">
            F
          </div>
          <h1 className="text-2xl font-bold">Crew Portaal</h1>
          <p className="text-sm text-muted-foreground">CrewOps</p>
        </div>

        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-base font-semibold">Inloggen met e-mail</h2>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">
            Vul je e-mailadres in. Je krijgt een inloglink toegestuurd — geen
            wachtwoord nodig.
          </p>
          <LoginForm notLinked={notLinked} />
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Beheerder?{" "}
          <a href="/login" className="underline underline-offset-2">
            Log in via het beheerportaal
          </a>
          .
        </p>
      </div>
    </div>
  );
}
