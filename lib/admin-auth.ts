"use client";

import { useCallback, useEffect, useState } from "react";

const AUTH_EVENT = "dbs-admin-auth-changed";

export interface AdminAuthState {
  authed: boolean;
  hydrated: boolean;
}

async function fetchSession(): Promise<boolean> {
  try {
    const res = await fetch("/api/admin/session", { cache: "no-store", credentials: "include" });
    if (!res.ok) return false;
    const data = await res.json().catch(() => ({}));
    return data?.authed === true;
  } catch {
    return false;
  }
}

export async function loginAdmin(password: string): Promise<boolean> {
  try {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      window.dispatchEvent(new Event(AUTH_EVENT));
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function logoutAdmin(): Promise<void> {
  try {
    await fetch("/api/admin/logout", { method: "POST", credentials: "include" });
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export function useAdminAuth(): AdminAuthState {
  const [state, setState] = useState<AdminAuthState>({ authed: false, hydrated: false });

  useEffect(() => {
    let mounted = true;
    const sync = async () => {
      const authed = await fetchSession();
      if (mounted) setState({ authed, hydrated: true });
    };
    sync();
    window.addEventListener(AUTH_EVENT, sync);
    return () => {
      mounted = false;
      window.removeEventListener(AUTH_EVENT, sync);
    };
  }, []);

  return state;
}

export function useAdminLogin(): (password: string) => Promise<boolean> {
  return useCallback((password: string) => loginAdmin(password), []);
}
