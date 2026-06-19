import Link from "next/link";

export default function StandingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Standings</h1>
        <nav className="flex gap-1 mt-3">
          <StandingsTab href="/standings/groups" label="Group Stage" />
          <StandingsTab href="/standings/knockout" label="Knockout" />
        </nav>
      </div>
      {children}
    </div>
  );
}

function StandingsTab({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="px-4 py-1.5 rounded-full text-sm font-medium text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
    >
      {label}
    </Link>
  );
}
