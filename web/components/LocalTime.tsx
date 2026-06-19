"use client";

import { useEffect, useState } from "react";

// All supported display formats. Add new ones here rather than passing raw Intl options inline,
// which avoids React hooks dep-array churn from object-literal reference inequality.
const FORMATS = {
  kickoff:    { day: "numeric", month: "short",  hour: "2-digit", minute: "2-digit", timeZoneName: "short" },
  datetime:   { day: "numeric", month: "long",   year: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" },
  dayheading: { weekday: "long",  day: "numeric", month: "long" },
  dateonly:   { day: "numeric", month: "short" },
} satisfies Record<string, Intl.DateTimeFormatOptions>;

export type TimeVariant = keyof typeof FORMATS;

interface Props {
  iso: string;
  variant?: TimeVariant;
  className?: string;
}

export default function LocalTime({ iso, variant = "kickoff", className }: Props) {
  const opts = FORMATS[variant];

  // Initial value renders the same way as the server (UTC) so React hydration passes cleanly.
  // After mount, useEffect swaps to the browser's own timezone and locale.
  const [text, setText] = useState(() =>
    new Date(iso).toLocaleString("en-GB", { ...opts, timeZone: "UTC" })
  );

  useEffect(() => {
    setText(new Date(iso).toLocaleString(undefined, opts));
  // opts is derived from a module-level constant — safe to omit from deps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iso]);

  return className ? <span className={className}>{text}</span> : <>{text}</>;
}
