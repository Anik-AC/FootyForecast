"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Props {
  href: string;
  children: React.ReactNode;
  exact?: boolean;
}

export function NavLink({ href, children, exact = false }: Props) {
  const pathname = usePathname();
  const isActive = exact ? pathname === href : pathname.startsWith(href) && href !== "/";

  if (isActive) {
    return (
      <span style={{
        cursor: "default",
        padding: "8px 16px",
        borderRadius: 11,
        fontSize: 14.5,
        fontWeight: 700,
        color: "#2BE38A",
        background: "linear-gradient(180deg, rgba(43,227,138,0.18), rgba(43,227,138,0.05))",
        border: "1px solid rgba(43,227,138,0.38)",
        boxShadow: "0 2px 16px rgba(43,227,138,0.16)",
      }}>
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className="ff-nav-item"
      style={{
        padding: "8px 14px",
        borderRadius: 11,
        fontSize: 14.5,
        fontWeight: 500,
        color: "#9E99B0",
        background: "transparent",
        border: "1px solid transparent",
        textDecoration: "none",
        transition: "all .18s",
      }}
    >
      {children}
    </Link>
  );
}
