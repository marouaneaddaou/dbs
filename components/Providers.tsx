"use client";

import { useEffect, type ReactNode } from "react";
import { ToastProvider } from "@/components/ui/Toast";
import { runMigrations } from "@/lib/storage";
import { useSharedSync } from "@/lib/shared/use-shared-sync";

/** Client-side providers + one-time storage migration on first load. */
function SharedSyncProvider() {
  useSharedSync();
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    runMigrations();
  }, []);

  return (
    <ToastProvider>
      <SharedSyncProvider />
      {children}
    </ToastProvider>
  );
}
