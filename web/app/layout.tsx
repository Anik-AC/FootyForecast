import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "FootyForecast",
  description:
    "Calibrated probabilistic predictions for every FIFA World Cup 2026 match.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="bg-slate-950 text-slate-100">
      <body className="min-h-screen antialiased">
        <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
            <Link href="/" className="font-semibold text-lg tracking-tight">
              FootyForecast
              <span className="ml-2 text-xs font-normal text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">
                WC 2026
              </span>
            </Link>
            <nav className="flex items-center gap-6 text-sm text-slate-400">
              <Link href="/" className="hover:text-slate-100 transition-colors">
                Matches
              </Link>
              <Link href="/bracket" className="hover:text-slate-100 transition-colors">
                Bracket
              </Link>
              <Link href="/calibration" className="hover:text-slate-100 transition-colors">
                Calibration
              </Link>
            </nav>
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-4 py-8">{children}</main>
        <footer className="border-t border-slate-800 mt-16">
          <div className="max-w-5xl mx-auto px-4 py-6 text-xs text-slate-500 flex items-center justify-between">
            <span>
              Predictions update after every match. Probabilities are not
              betting advice.
            </span>
            <span>FootyForecast · Anik Chakraborti</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
