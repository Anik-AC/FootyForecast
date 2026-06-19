import type { TriviaFact } from "@/lib/types";

interface Props {
  facts: TriviaFact[];
}

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

export default function TriviaFacts({ facts }: Props) {
  if (!facts || facts.length === 0) return null;

  return (
    <section className="rounded-xl border border-slate-700 bg-slate-800/50 p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-slate-400">
        Pre-Match Facts
      </h2>
      <ul className="space-y-3">
        {facts.map((fact, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-0.5 shrink-0 text-base" aria-hidden>
              {TEMPLATE_ICONS[fact.template] ?? "📊"}
            </span>
            <p className="text-sm leading-relaxed text-slate-300">{fact.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
