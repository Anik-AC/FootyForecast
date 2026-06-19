import type { TriviaFact } from "@/lib/types";

const TEMPLATE_ICONS: Record<string, string> = {
  head_to_head: "⚔",
  h2h_recent: "🕐",
  form_home: "📈",
  form_away: "📈",
  unbeaten_streak_home: "🔥",
  unbeaten_streak_away: "🔥",
  scoring_streak_home: "⚽",
  scoring_streak_away: "⚽",
};

interface Props {
  facts: TriviaFact[];
}

export default function TriviaFacts({ facts }: Props) {
  if (!facts || facts.length === 0) return null;

  return (
    <div style={{
      background: "#120F1E",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 16,
      padding: "20px 24px",
    }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {facts.map((fact, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <span style={{ fontSize: 16, flexShrink: 0, lineHeight: 1, marginTop: 2 }} aria-hidden>
              {TEMPLATE_ICONS[fact.template] ?? "📊"}
            </span>
            <p style={{ fontSize: 14, color: "#C8C3D6", lineHeight: 1.6, margin: 0 }}>{fact.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
