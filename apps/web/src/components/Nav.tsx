"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { t } from "@/lib/i18n";

const LINKS = [
  { href: "/dashboard", label: t.nav.dashboard },
  { href: "/office", label: t.nav.office },
  { href: "/tasks", label: t.nav.tasks },
  { href: "/accounts", label: t.nav.accounts },
  { href: "/connect", label: t.nav.connect },
];
const SOON = [t.nav.calendar, t.nav.analytics, t.nav.pricing];

export function Nav({ pending }: { pending: number }) {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Asosiy menyu">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} className={path.startsWith(l.href) ? "on" : undefined}>
          {l.label}
          {l.href === "/tasks" && pending > 0 && <span className="badge accent">{pending}</span>}
        </Link>
      ))}
      {SOON.map((s) => (
        <span key={s} className="dis">
          {s} <small>{t.nav.soon}</small>
        </span>
      ))}
    </nav>
  );
}
