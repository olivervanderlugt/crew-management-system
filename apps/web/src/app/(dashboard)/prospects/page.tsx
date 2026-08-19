import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { isoDate } from "@/lib/utils";
import type { Crew } from "@crewops/core";
import { ProspectBoard, type BoardProspect } from "@/components/prospects/ProspectBoard";
import type { PipelineStage } from "./actions";
import { getMyAdminPerms } from "@/lib/admin/perms";
import { can } from "@/lib/admin/modules";
import { UserPlus } from "lucide-react";

export const metadata = { title: "Prospects" };

export default async function ProspectsPage() {
  const supabase = await createClient();
  const canCrew = can(await getMyAdminPerms(), "crew");
  const calcomBase = process.env.NEXT_PUBLIC_CALCOM_URL;

  const { data } = await supabase
    .from("crew")
    .select("*")
    .eq("status", "prospect")
    .order("prospect_applied_on", { ascending: false, nullsFirst: false });

  const prospects: BoardProspect[] = ((data ?? []) as Crew[]).map((c) => ({
    id: c.id,
    crew_code: c.crew_code,
    first_name: c.first_name,
    last_name: c.last_name,
    phone: c.phone,
    email: c.email,
    prospect_source: c.prospect_source,
    prospect_next_action_on: c.prospect_next_action_on,
    prospect_status: (c.prospect_status ?? "new") as PipelineStage,
  }));

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Topbar
        title={`Prospects${prospects.length > 0 ? ` (${prospects.length})` : ""}`}
        actions={
          canCrew ? (
            <Button asChild size="sm">
              <Link href="/crew/new"><UserPlus /> Nieuwe prospect</Link>
            </Button>
          ) : undefined
        }
      />

      {!calcomBase && (
        <div className="px-4 py-2 text-xs text-muted-foreground border-b bg-muted/30">
          Tip: stel <code className="bg-muted px-1 rounded">NEXT_PUBLIC_CALCOM_URL</code> in (root <code className="bg-muted px-1 rounded">.env.local</code>) om intakegesprekken via Cal.com in te plannen.
        </div>
      )}

      <div className="flex-1 overflow-auto p-4">
        {prospects.length === 0 ? (
          <p className="text-sm text-muted-foreground py-12 text-center">Geen prospects. Voeg er een toe of zet een crewlid op status “Prospect”.</p>
        ) : (
          <ProspectBoard
            prospects={prospects}
            canCrew={canCrew}
            calcomBase={calcomBase}
            today={isoDate(new Date())}
          />
        )}
      </div>
    </div>
  );
}
