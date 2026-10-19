"use client";

/**
 * Demo-only admin gate for the DBS app.
 *
 * SECURITY NOTE: this is a frontend-only application. The password lives in
 * client-side code, so this gate is for local/demo setups only — it is NOT
 * production-grade authentication against anyone who inspects the source.
 * A real private admin area requires server-side authentication.
 *
 * The admin session is stored in sessionStorage so closing the tab (or the
 * browser) requires logging in again. Nothing about the password is persisted.
 */

import { useCallback, useEffect, useState } from "react";
import { readSession, removeSession, writeSession } from "@/lib/storage";

const ADMIN_PASSWORD = "123456";
const ADMIN_SESSION_KEY = "dbs_admin_session_v1";
const AUTH_EVENT = "dbs-admin-auth-changed";

export function isAdminAuthenticated(): boolean {
  return readSession<boolean>(ADMIN_SESSION_KEY, false) === true;
}

/** Returns true when the password matches. The session lives in sessionStorage only. */
export function loginAdmin(password: string): boolean {
  if (password !== ADMIN_PASSWORD) return false;
  writeSession(ADMIN_SESSION_KEY, true);
  window.dispatchEvent(new Event(AUTH_EVENT));
  return true;
}

export function logoutAdmin(): void {
  removeSession(ADMIN_SESSION_KEY);
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export interface AdminAuthState {
  authed: boolean;
  hydrated: boolean;
}

/**
 * Reactive admin-session hook.
 * Stays in sync across components in the same tab (login/logout broadcast an
 * event) and across tabs (window "storage" events from sessionStorage).
 */
export function useAdminAuth(): AdminAuthState {
  const [state, setState] = useState<AdminAuthState>({ authed: false, hydrated: false });

  useEffect(() => {
    const sync = () => setState({ authed: isAdminAuthenticated(), hydrated: true });
    sync();
    window.addEventListener(AUTH_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(AUTH_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return state;
}

/** Convenience callback for the login form. */
export function useAdminLogin(): (password: string) => boolean {
  return useCallback((password: string) => loginAdmin(password), []);
}
