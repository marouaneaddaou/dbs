"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readJSON, writeJSON } from "@/lib/storage";
import { useAdminAuth } from "@/lib/admin-auth";
import { SHARED_SYNC_EVENT, apiGet, apiPut, applySharedDataToLocal, collectLocalSharedData, type SharedSyncState } from "@/lib/shared/client-sync";
import { createEmptySharedData, createEmptySharedState } from "@/lib/shared/schema";

const POLL_INTERVAL = 10000;

export function useSharedSync() {
  const { authed } = useAdminAuth();
  const [state, setState] = useState<SharedSyncState>({
    enabled: false,
    syncing: false,
    error: null,
    conflict: false,
    revision: 0,
    updatedAt: null,
    lastSyncedAt: null,
  });
  const etagRef = useRef<string | null>(null);
  const revisionRef = useRef<number>(0);
  const pushingRef = useRef<boolean>(false);
  const timerRef = useRef<any>(null);

  const push = useCallback(async () => {
    if (!authed || pushingRef.current) return;
    pushingRef.current = true;
    setState((s) => ({ ...s, syncing: true, error: null }));
    try {
      const local = collectLocalSharedData(readJSON);
      const res = await apiPut(local, revisionRef.current, etagRef.current);
      if (res.error === "conflict") {
        // Pull latest
        const latest = await apiGet();
        etagRef.current = latest.etag;
        revisionRef.current = latest.state.revision;
        applySharedDataToLocal(latest.state.data, writeJSON);
        setState((s) => ({
          ...s,
          syncing: false,
          conflict: true,
          error: "Conflict detected. Latest remote state applied.",
          revision: latest.state.revision,
          updatedAt: latest.state.updatedAt,
          lastSyncedAt: Date.now(),
        }));
        if (typeof window !== "undefined") window.dispatchEvent(new Event(SHARED_SYNC_EVENT));
        return;
      }
      if (res.ok && res.state) {
        etagRef.current = res.etag ?? etagRef.current;
        revisionRef.current = res.state.revision;
        setState((s) => ({
          ...s,
          syncing: false,
          conflict: false,
          error: null,
          revision: res.state!.revision,
          updatedAt: res.state!.updatedAt,
          lastSyncedAt: Date.now(),
        }));
        if (typeof window !== "undefined") window.dispatchEvent(new Event(SHARED_SYNC_EVENT));
        return;
      }
      setState((s) => ({ ...s, syncing: false, error: res.error || "Sync failed" }));
    } catch (e: any) {
      if (e?.message === "unauthorized") {
        setState((s) => ({ ...s, enabled: false, syncing: false }));
      } else {
        setState((s) => ({ ...s, syncing: false, error: "Sync failed" }));
      }
    } finally {
      pushingRef.current = false;
    }
  }, [authed]);

  const pull = useCallback(async () => {
    if (!authed || pushingRef.current) return;
    try {
      const res = await apiGet();
      etagRef.current = res.etag;
      revisionRef.current = res.state.revision;
      applySharedDataToLocal(res.state.data, writeJSON);
      setState((s) => ({
        ...s,
        enabled: true,
        syncing: false,
        conflict: false,
        error: null,
        revision: res.state.revision,
        updatedAt: res.state.updatedAt,
        lastSyncedAt: Date.now(),
      }));
      if (typeof window !== "undefined") window.dispatchEvent(new Event(SHARED_SYNC_EVENT));
    } catch (e: any) {
      if (e?.message === "unauthorized") {
        setState((s) => ({ ...s, enabled: false }));
      }
    }
  }, [authed]);

  useEffect(() => {
    if (!authed) {
      setState((s) => ({ ...s, enabled: false }));
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }
    setState((s) => ({ ...s, enabled: true }));
    pull();
    timerRef.current = setInterval(pull, POLL_INTERVAL);
    const onFocus = () => pull();
    const onVis = () => { if (document.visibilityState === "visible") pull(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    const onWritten = () => {
      // Debounce push
      setTimeout(() => push(), 500);
    };
    window.addEventListener("dbs-storage-written", onWritten as EventListener);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("dbs-storage-written", onWritten as EventListener);
    };
  }, [authed, pull, push]);

  const forcePush = useCallback(async () => {
    revisionRef.current = 0; // force push local as base
    await push();
  }, [push]);

  const forcePull = useCallback(async () => {
    await pull();
  }, [pull]);

  return { ...state, push, pull: forcePull, forcePush };
}
