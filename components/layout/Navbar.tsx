"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Boxes, Menu, Settings, ShieldCheck, Trophy, Vote, X, Home } from "lucide-react";
import { cn } from "@/lib/cn";
import { useAdminAuth } from "@/lib/admin-auth";
import { DbsLogo } from "@/components/layout/DbsLogo";

/** Pages every visitor sees. */
const publicLinks = [
  { href: "/", label: "Home", icon: Home },
  { href: "/quiz", label: "Quiz", icon: Trophy },
  { href: "/votes", label: "Votes", icon: Vote },
];

/** Admin-only pages — rendered only with an active admin session. */
const adminLinks = [
  { href: "/admin", label: "Admin", icon: ShieldCheck },
  { href: "/boxes", label: "Boxes", icon: Boxes },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { authed, hydrated } = useAdminAuth();

  const links = hydrated && authed ? [...publicLinks, ...adminLinks] : publicLinks;

  function isActive(href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="group flex items-center" onClick={() => setOpen(false)}>
          <DbsLogo size="sm" className="transition-transform group-hover:scale-[1.02]" />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((link) => {
            const active = isActive(link.href);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-gold-50 text-ink-900 ring-1 ring-gold-200"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                )}
              >
                <Icon className={cn("h-4 w-4", active ? "text-brand-600" : "text-gray-400")} />
                {link.label}
              </Link>
            );
          })}
        </nav>

        <button
          type="button"
          className="rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {open ? (
        <nav className="border-t border-gray-200 bg-white px-4 py-3 md:hidden">
          {links.map((link) => {
            const active = isActive(link.href);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors",
                  active ? "bg-gold-50 text-ink-900" : "text-gray-700 hover:bg-gray-50",
                )}
              >
                <Icon className={cn("h-4 w-4", active ? "text-brand-600" : "text-gray-400")} />
                {link.label}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </header>
  );
}
