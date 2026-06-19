"use client";

import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  ReferenceLine,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { MomentumPoint } from "@/lib/types";

interface GoalEvent {
  minute: number;
  isHome: boolean;
}

interface Props {
  data: MomentumPoint[];
  homeTeam: string;
  awayTeam: string;
  breakMinutes?: number[];
  goalEvents?: GoalEvent[];
}

interface TooltipPayload {
  payload: { minute: number; value: number };
}

function CustomTooltip({
  active,
  payload,
  homeTeam,
  awayTeam,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  homeTeam: string;
  awayTeam: string;
}) {
  if (!active || !payload?.length) return null;
  const { minute, value } = payload[0].payload;
  const side = value > 0 ? homeTeam : value < 0 ? awayTeam : "Level";
  return (
    <div className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200">
      <span className="font-mono">{minute}&apos;</span>{" "}
      <span className={value > 0 ? "text-emerald-400" : value < 0 ? "text-blue-400" : "text-slate-400"}>
        {side}
      </span>{" "}
      {value !== 0 && <>({Math.abs(value).toFixed(1)})</>}
    </div>
  );
}

// Custom X-axis tick: only render at notable minutes, not every minute.
function CustomTick({
  x,
  y,
  payload,
  breakMinutes,
  goalEvents,
  ...rest
}: {
  x?: number | string;
  y?: number | string;
  payload?: { value: number };
  breakMinutes?: number[];
  goalEvents?: GoalEvent[];
  [key: string]: unknown;
}) {
  void rest;
  if (x == null || y == null || payload == null) return null;
  const nx = Number(x);
  const ny = Number(y);
  const m = payload.value;

  if (m === 45) {
    return (
      <text x={nx} y={ny + 14} textAnchor="middle" fontSize={9} fill="#475569">
        HT
      </text>
    );
  }
  if ((breakMinutes ?? []).includes(m)) {
    return (
      <text x={nx} y={ny + 14} textAnchor="middle" fontSize={9} fill="#f59e0b">
        {m}&apos;
      </text>
    );
  }
  if ((goalEvents ?? []).some((g) => g.minute === m)) {
    return (
      <text x={nx} y={ny + 14} textAnchor="middle" fontSize={9} fill="#94a3b8">
        {m}&apos;
      </text>
    );
  }
  return null;
}

export default function MomentumChart({ data, homeTeam, awayTeam, breakMinutes, goalEvents }: Props) {
  if (!data.length) return null;

  // Build the set of notable ticks: HT + hydration breaks + goal minutes
  const notableTicks = Array.from(
    new Set([
      45,
      ...(breakMinutes ?? []),
      ...(goalEvents ?? []).map((g) => g.minute),
    ])
  ).sort((a, b) => a - b);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-1">
        Match Momentum
      </h2>
      <div className="flex items-center gap-4 text-xs text-slate-500 mb-4">
        <span>
          <span className="inline-block w-2 h-2 rounded-sm bg-emerald-500 mr-1" />
          {homeTeam}
        </span>
        <span>
          <span className="inline-block w-2 h-2 rounded-sm bg-blue-500 mr-1" />
          {awayTeam}
        </span>
        {(breakMinutes?.length ?? 0) > 0 && (
          <span>
            <span className="inline-block w-2 h-2 rounded-sm bg-amber-500 mr-1" />
            Hydration break
          </span>
        )}
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <BarChart
          data={data}
          margin={{ top: 8, right: 4, bottom: 20, left: -20 }}
          barCategoryGap={0}
          barGap={0}
        >
          <XAxis
            dataKey="minute"
            type="number"
            domain={[1, data[data.length - 1]?.minute ?? 90]}
            ticks={notableTicks}
            tick={(props) => (
              <CustomTick
                {...props}
                breakMinutes={breakMinutes}
                goalEvents={goalEvents}
              />
            )}
            tickLine={false}
            axisLine={false}
          />
          <YAxis hide domain={["auto", "auto"]} />

          <ReferenceLine y={0} stroke="#334155" strokeWidth={1} />

          {/* Half-time line */}
          <ReferenceLine
            x={45}
            stroke="#334155"
            strokeDasharray="4 3"
            label={{ value: "", fill: "#475569", fontSize: 9 }}
          />

          {/* Hydration break lines */}
          {breakMinutes?.map((m, i) => (
            <ReferenceLine
              key={`hb-${i}-${m}`}
              x={m}
              stroke="#f59e0b"
              strokeDasharray="4 3"
              strokeWidth={1.5}
            />
          ))}

          {/* Goal lines */}
          {goalEvents?.map((ev, i) => (
            <ReferenceLine
              key={`goal-${i}`}
              x={ev.minute}
              stroke={ev.isHome ? "#10b981" : "#3b82f6"}
              strokeWidth={1.5}
              strokeDasharray="2 2"
            />
          ))}

          {/* Bars colored by sign: emerald = home pressure, blue = away pressure */}
          <Bar dataKey="value" isAnimationActive={false} maxBarSize={5}>
            {data.map((d, i) => (
              <Cell
                key={`bar-${i}`}
                fill={d.value >= 0 ? "#10b981" : "#3b82f6"}
                fillOpacity={Math.min(Math.abs(d.value) * 0.25 + 0.5, 1)}
              />
            ))}
          </Bar>

          <Tooltip
            content={<CustomTooltip homeTeam={homeTeam} awayTeam={awayTeam} />}
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
          />
        </BarChart>
      </ResponsiveContainer>

      <p className="text-[10px] text-slate-600 mt-1">
        Derived from commentary. Green bars = {homeTeam} pressure · Blue bars = {awayTeam} pressure.
        Amber lines = hydration breaks.
      </p>
    </div>
  );
}
