"use client";

import { HardDrive } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { DbsLogo } from "@/components/layout/DbsLogo";

export function Footer() {
  const [year, setYear] = useState<number | null>(null);

  useEffect(() => {
    setYear(new Date().getFullYear());
  }, []);

  return (
    <footer className="mt-16 border-t border-gray-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-md">
            <DbsLogo size="sm" />
            <p className="mt-3 text-sm text-gray-500">
              A simple playground for random boxes, polls and quizzes. Runs entirely in your browser &mdash;
              no accounts, no database, no servers.
            </p>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500 md:max-w-sm">
            <HardDrive className="mt-0.5 h-5 w-5 shrink-0 text-gold-600" />
            <p>
              <span className="font-medium text-gray-800">Local storage only.</span>{" "}
              Your data is saved in this browser. It does not sync across devices or browsers &mdash;
              use JSON export/import to move rooms manually.
            </p>
          </div>
        </div>
        <div className="mt-8 flex flex-col gap-3 border-t border-gray-200 pt-6 text-xs text-gray-500 sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {year ?? new Date().getFullYear()} DBS &mdash; Deutsch-Bildungsstudio. Built with Next.js.</p>
          <div className="flex flex-wrap gap-4">
            <Link className="transition-colors hover:text-gray-900" href="/">
              Home
            </Link>
            <Link className="transition-colors hover:text-gray-900" href="/quiz/">
              Quiz
            </Link>
            <Link className="transition-colors hover:text-gray-900" href="/votes/">
              Votes
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
