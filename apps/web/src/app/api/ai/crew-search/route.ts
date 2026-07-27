import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAIService, naturalLanguageCrewSearch } from "@crewops/core";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { query } = await request.json() as { query: string };
  if (!query?.trim()) {
    return NextResponse.json({ error: "Query is required" }, { status: 400 });
  }

  const apiKey = process.env["AI_API_KEY"];
  const service = createAIService(apiKey);

  if (!service.isAvailable()) {
    return NextResponse.json(
      { available: false, message: "AI-functie beschikbaar — voeg AI_API_KEY toe aan .env.local" },
      { status: 200 }
    );
  }

  // Get context for the AI
  const [crewCount, skillsList, citiesList] = await Promise.all([
    supabase.from("crew").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("skills").select("name"),
    supabase.from("crew").select("home_city").eq("status", "active").not("home_city", "is", null),
  ]);

  const skills = ((skillsList.data ?? []) as Array<{ name: string }>).map((s) => s.name);
  const cities = [...new Set(((citiesList.data ?? []) as Array<{ home_city: string | null }>).map((c) => c.home_city).filter(Boolean))];

  const response = await naturalLanguageCrewSearch(service, query, {
    totalCrew: crewCount.count ?? 0,
    skills,
    cities: cities as string[],
  });

  return NextResponse.json({ available: true, response });
}
