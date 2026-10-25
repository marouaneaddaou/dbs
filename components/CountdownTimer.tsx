"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/cn";
import { useHydrated } from "@/lib/hooks";

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (days > 0) return `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export function CountdownTimer({
  deadline,
  onExpire,
  totalMs,
  className,
  compact,
}: {
  deadline: number | null;
  onExpire?: () => void;
  /** When provided, renders a progress bar against this total duration. */
  totalMs?: number;
  className?: string;
  compact?: boolean;
}) {
  const hydrated = useHydrated();
  const [now, setNow] = useState(() => deadline ?? 0);

  useEffect(() => {
    if (deadline === null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [deadline]);

  useEffect(() => {
    if (deadline === null || !onExpire) return;
    if (now >= deadline) onExpire();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, deadline]);

  if (deadline === null) {
    return (
      <span className={cn("inline-flex items-center gap-2 text-sm text-gray-500", className)}>
        <Clock className="h-4 w-4" />
Kein Zeitlimit
      </span>
    );
  }

  const remaining = hydrated ? Math.max(0, deadline - now) : 0;
  const expired = hydrated && remaining <= 0;
  const ratio = totalMs && totalMs > 0 ? Math.min(1, Math.max(0, remaining / totalMs)) : null;
  const urgent = remaining > 0 && remaining <= 15000;

  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-center justify-between gap-3">
        <span
          className={cn(
            "inline-flex items-center gap-2 text-sm font-medium",
            urgent ? "text-brand-600" : "text-gold-700",
          )}
        >
          <Clock className={cn("h-4 w-4", urgent && "animate-pulse")} />
          {expired ? "Zeit abgelaufen" : formatRemaining(remaining)}
        </span>
        {compact ? null : <span className="text-xs uppercase tracking-wide text-gray-400">verbleibend</span>}
      </div>
      {ratio !== null ? (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className={cn("h-full rounded-full transition-all duration-1000", urgent ? "bg-brand-600" : "bg-gold-500")}
            style={{ width: `${(ratio * 100).toFixed(1)}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

