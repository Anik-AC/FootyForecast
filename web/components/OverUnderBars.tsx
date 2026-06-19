import type { TotalsProbabilities } from "@/lib/types";

const MONO = "'JetBrains Mono',monospace";

interface Props {
  totals: TotalsProbabilities;
  showBTTS?: boolean;
}

const ITEMS = [
  { key: "over_1_5" as keyof TotalsProbabilities, label: "Over 1.5 goals" },
  { key: "over_2_5" as keyof TotalsProbabilities, label: "Over 2.5 goals" },
  { key: "over_3_5" as keyof TotalsProbabilities, label: "Over 3.5 goals" },
];

function barColor(prob: number): string {
  if (prob >= 0.65) return "#2BE38A";
  if (prob >= 0.40) return "#1FD0C0";
  return "#4A4560";
}

export default function OverUnderBars({ totals, showBTTS = false }: Props) {
  const items = showBTTS
    ? [...ITEMS, { key: "btts" as keyof TotalsProbabilities, label: "Both teams to score" }]
    : ITEMS;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {items.map(({ key, label }) => {
        const prob = totals[key] as number;
        const pct = (prob * 100).toFixed(1);

        return (
          <div key={key}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
              <span style={{ fontSize: 14, color: "#C8C3D6" }}>{label}</span>
              <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: barColor(prob) }}>{pct}%</span>
            </div>
            <div style={{ height: 7, background: "#1D1A2A", borderRadius: 99, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  borderRadius: 99,
                  width: `${Math.min(prob * 100, 100)}%`,
                  background: barColor(prob),
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
