"use client";

import { useEffect, type ReactNode } from "react";
import { ToastProvider } from "@/components/ui/Toast";
import { runMigrations } from "@/lib/storage";

/** Client-side providers + one-time storage migration on first load. */
export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    runMigrations();
  }, []);

  return <ToastProvider>{children}</ToastProvider>;
}
