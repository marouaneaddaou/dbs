"use client";

import type { ReactNode } from "react";
import { useAdminAuth } from "@/lib/admin-auth";
import { AdminLogin } from "@/components/admin/AdminLogin";

/**
 * Protects admin-only routes and screens.
 * Without an active admin session (sessionStorage) the login screen is shown
 * instead of the protected content — links are never merely hidden.
 */
export function AdminGate({
  children,
  title,
  description,
}: {
  children: ReactNode;
  title?: string;
  description?: string;
}) {
  const { authed, hydrated } = useAdminAuth();

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="mx-auto h-64 max-w-md animate-pulse rounded-2xl border border-gray-200 bg-white shadow-card" />
      </div>
    );
  }

  if (!authed) {
    return <AdminLogin title={title} description={description} />;
  }

  return <>{children}</>;
}
