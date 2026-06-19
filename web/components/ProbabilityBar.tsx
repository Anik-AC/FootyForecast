import type { OutcomeProbabilities } from "@/lib/types";

const MONO = "'JetBrains Mono',monospace";

interface Props {
  probs: OutcomeProbabilities;
  homeLabel: string;
  awayLabel: string;
}

export function ProbabilityBar({ probs, homeLabel, awayLabel }: Props) {
  const hw = Math.round(probs.home_win * 100);
  const dw = Math.round(probs.draw * 100);
  const aw = Math.round(probs.away_win * 100);

  return (
    <div>
      <div style={{ display: "flex", height: 10, borderRadius: 99, overflow: "hidden", background: "#1D1A2A" }}>
        <div style={{ width: `${hw}%`, background: "linear-gradient(90deg,#2BE38A,#1FD0C0)" }} />
        <div style={{ width: `${dw}%`, background: "#FFC23D" }} />
        <div style={{ width: `${aw}%`, background: "linear-gradient(90deg,#5B8CFF,#A35CFF)" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 13, marginTop: 10, color: "#9E99B0" }}>
        <span>
          <b style={{ color: "#2BE38A" }}>{hw}%</b> {homeLabel}
        </span>
        <span style={{ color: "#FFC23D" }}>{dw}% draw</span>
        <span>
          {awayLabel} <b style={{ color: "#5B8CFF" }}>{aw}%</b>
        </span>
      </div>
    </div>
  );
}
