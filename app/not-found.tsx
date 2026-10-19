import Link from "next/link";
import { Compass, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gold-50 text-gold-600 ring-1 ring-gold-200">
        <Compass className="h-8 w-8" />
      </span>
      <h1 className="mt-6 text-4xl font-extrabold text-ink-900">404</h1>
      <p className="mt-2 text-gray-500">
        We couldn’t find that page. It may have moved, or the room code lives in a different browser.
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex h-11 items-center gap-2 rounded-xl bg-brand-600 px-6 text-sm font-semibold text-white shadow-glow transition-colors hover:bg-brand-700"
      >
        <Home className="h-4 w-4" />
        Back home
      </Link>
    </div>
  );
}
