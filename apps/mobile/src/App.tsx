/**
 * CrewOps Mobile — minimal scaffold
 * Demonstrates that packages/core logic (matching engine + types) is importable
 * in a React Native context. UI is intentionally trivial — this is not Phase 1.
 *
 * Phase 2: build out crew portal, availability, and assignment views.
 */
import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View, ScrollView } from "react-native";
import { matchCrew, type MatchRequest } from "@crewops/core";

const DEMO_EVENT: MatchRequest["event"] = {
  id: "demo-event-1",
  start_datetime: "2026-07-10T09:00:00Z",
  end_datetime: "2026-07-10T22:00:00Z",
  crew_needed: 3,
};

const DEMO_CREW = [
  {
    id: "1", crew_code: "CREW-0042", first_name: "Sam", last_name: "de Vries",
    phone: null, email: null, home_city: "Demostad", postcode: null,
    has_license: true, has_car: true, seniority: "senior" as const,
    status: "active" as const, notes: null, external_id: null,
    created_at: "", updated_at: "",
    availability: [{ id: "a1", crew_id: "1", date: "2026-07-10", status: "B" as const, created_at: "", updated_at: "" }],
  },
  {
    id: "2", crew_code: "CREW-0005", first_name: "Robin", last_name: "Jansen",
    phone: null, email: null, home_city: "Voorbeeldstad", postcode: null,
    has_license: false, has_car: false, seniority: "sitecrew" as const,
    status: "active" as const, notes: null, external_id: null,
    created_at: "", updated_at: "",
    availability: [{ id: "a2", crew_id: "2", date: "2026-07-10", status: "M" as const, created_at: "", updated_at: "" }],
  },
];

// Run matching engine — proves core logic works in React Native context
const result = matchCrew({
  event: DEMO_EVENT,
  required_skills: [],
  crew_pool: DEMO_CREW,
});

export default function App() {
  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.logo}>C</Text>
        <Text style={styles.title}>CrewOps Mobile</Text>
        <Text style={styles.subtitle}>Scaffold</Text>
      </View>
      <ScrollView style={styles.content}>
        <Text style={styles.sectionTitle}>Matching engine (packages/core) ✓</Text>
        <Text style={styles.label}>Demo event: Zomerfestival 2026</Text>
        {result.candidates.map((c) => (
          <View key={c.crew.id} style={styles.card}>
            <Text style={styles.name}>{c.crew.first_name} {c.crew.last_name}</Text>
            <Text style={styles.code}>{c.crew.crew_code}</Text>
            <Text style={styles.score}>Score: {c.score}/100</Text>
            {c.reasons.map((r) => (
              <Text key={r.factor} style={styles.reason}>• {r.label}</Text>
            ))}
          </View>
        ))}
        <Text style={styles.note}>
          Dit scherm bewijst dat packages/core importeerbaar is in React Native.{"\n"}
          Fase 2: crew-portaal, beschikbaarheid, toewijzingen.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0c1219" },
  header: { backgroundColor: "#2563EB", paddingTop: 60, paddingBottom: 20, paddingHorizontal: 20, alignItems: "center" },
  logo: { fontSize: 32, fontWeight: "700", color: "white" },
  title: { fontSize: 20, fontWeight: "700", color: "white", marginTop: 4 },
  subtitle: { fontSize: 13, color: "rgba(255,255,255,0.8)", marginTop: 2 },
  content: { flex: 1, padding: 16 },
  sectionTitle: { color: "#4ade80", fontSize: 13, fontWeight: "600", marginBottom: 12 },
  label: { color: "#9ca3af", fontSize: 13, marginBottom: 12 },
  card: { backgroundColor: "#1a2332", borderRadius: 8, padding: 12, marginBottom: 8 },
  name: { color: "white", fontWeight: "600", fontSize: 14 },
  code: { color: "#2563EB", fontSize: 12, marginTop: 2 },
  score: { color: "#9ca3af", fontSize: 12, marginTop: 4 },
  reason: { color: "#6b7280", fontSize: 11, marginTop: 2 },
  note: { color: "#4b5563", fontSize: 11, marginTop: 20, lineHeight: 18 },
});
