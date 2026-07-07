import type { TriviaFact } from "@/lib/types";

interface IconDef { bg: string; color: string; path: string }

const TEMPLATE_ICON_MAP: Record<string, IconDef> = {
  head_to_head: {
    bg: "#FF5D6A22", color: "#FF5D6A",
    path: "M6 6l12 12M18 6L6 18",
  },
  h2h_recent: {
    bg: "#FFC23D22", color: "#FFC23D",
    path: "M12 6v6l4 2M12 2a10 10 0 110 20A10 10 0 0112 2z",
  },
  form_home: {
    bg: "#2BE38A22", color: "#2BE38A",
    path: "M4 16l4.586-4.586a2 2 0 012.828 0L13 13l3.586-3.586a2 2 0 012.828 0L22 12",
  },
  form_away: {
    bg: "#2BE38A22", color: "#2BE38A",
    path: "M4 16l4.586-4.586a2 2 0 012.828 0L13 13l3.586-3.586a2 2 0 012.828 0L22 12",
  },
  unbeaten_streak_home: {
    bg: "#FF9B3D22", color: "#FF9B3D",
    path: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
  },
  unbeaten_streak_away: {
    bg: "#FF9B3D22", color: "#FF9B3D",
    path: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
  },
  scoring_streak_home: {
    bg: "#2BE38A22", color: "#2BE38A",
    path: "M12 3C7 3 3 7 3 12s4 9 9 9 9-4 9-9-4-9-9-9zm0 6l2 2-3 3 2 2-3 3",
  },
  scoring_streak_away: {
    bg: "#2BE38A22", color: "#2BE38A",
    path: "M12 3C7 3 3 7 3 12s4 9 9 9 9-4 9-9-4-9-9-9zm0 6l2 2-3 3 2 2-3 3",
  },
};

const DEFAULT_ICON: IconDef = {
  bg: "#5B8CFF22", color: "#5B8CFF",
  path: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
};

function FactIcon({ template }: { template: string }) {
  const icon = TEMPLATE_ICON_MAP[template] ?? DEFAULT_ICON;
  return (
    <div style={{
      width: 38,
      height: 38,
      borderRadius: 10,
      background: icon.bg,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={icon.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={icon.path} />
      </svg>
    </div>
  );
}

interface Props {
  facts: TriviaFact[];
}

export default function TriviaFacts({ facts }: Props) {
  if (!facts || facts.length === 0) return null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }} className="ff-grid-2col">
      {facts.map((fact, i) => (
        <div
          key={i}
          style={{
            background: "#120F1E",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 14,
            padding: "16px 18px",
            display: "flex",
            alignItems: "flex-start",
            gap: 14,
          }}
        >
          <FactIcon template={fact.template} />
          <p style={{ fontSize: 13.5, color: "#C8C3D6", lineHeight: 1.55, margin: 0 }}>{fact.text}</p>
        </div>
      ))}
    </div>
  );
}
