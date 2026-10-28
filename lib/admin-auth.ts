"use client";

import { useCallback, useEffect, useState } from "react";

const AUTH_EVENT = "dbs-admin-auth-changed";

export interface AdminAuthState {
  authed: boolean;
  hydrated: boolean;
}

type SessionCheck = "authed" | "unauthed" | "unknown";

async function fetchSession(): Promise<SessionCheck> {
  try {
    const res = await fetch("/api/admin/session", { cache: "no-store", credentials: "include" });
    if (!res.ok) return "unknown";
    const data = await res.json().catch(() => null);
    if (!data || typeof data.authed !== "boolean") return "unknown";
    return data.authed ? "authed" : "unauthed";
  } catch {
    return "unknown";
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
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    const sync = async () => {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      const result = await fetchSession();
      if (!mounted) return;
      if (result === "unknown") {
        attempts += 1;
        const delay = Math.min(1000 * 2 ** (attempts - 1), 10000);
        retryTimer = setTimeout(sync, delay);
        return;
      }
      attempts = 0;
      setState({ authed: result === "authed", hydrated: true });
    };

    sync();
    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    window.addEventListener(AUTH_EVENT, sync);
    window.addEventListener("online", sync);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      mounted = false;
      if (retryTimer) clearTimeout(retryTimer);
      window.removeEventListener(AUTH_EVENT, sync);
      window.removeEventListener("online", sync);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return state;
}

export function useAdminLogin(): (password: string) => Promise<boolean> {
  return useCallback((password: string) => loginAdmin(password), []);
}
