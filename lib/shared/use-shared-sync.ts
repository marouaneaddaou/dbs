"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readJSON, writeJSON } from "@/lib/storage";
import { useAdminAuth } from "@/lib/admin-auth";
import { SHARED_SYNC_EVENT, apiGet, apiPut, applySharedDataToLocal, collectLocalSharedData, type SharedSyncState } from "@/lib/shared/client-sync";

const POLL_INTERVAL = 10000;
const PUSH_DEBOUNCE = 500;
const MAX_PUSH_RETRY = 10000;
const PENDING_SYNC_KEY = "dbs_shared_pending_v1";

function persistPendingSync(pending: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (pending) window.localStorage.setItem(PENDING_SYNC_KEY, "1");
    else window.localStorage.removeItem(PENDING_SYNC_KEY);
  } catch {
    /* ignore */
  }
}

function readPendingSync(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(PENDING_SYNC_KEY) === "1";
  } catch {
    return false;
  }
}

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
  const pushTimerRef = useRef<any>(null);
  const retryRef = useRef<number>(0);
  const dirtyRef = useRef<boolean>(false);
  const writeVersionRef = useRef<number>(0);
  const applyingRemoteRef = useRef<boolean>(false);
  const schedulePushRef = useRef<(delay?: number) => void>(() => {});

  const markDirty = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
    persistPendingSync(dirty);
  }, []);

  const push = useCallback(async () => {
    if (!authed || pushingRef.current) return;
    pushingRef.current = true;
    const version = writeVersionRef.current;
    setState((s) => ({ ...s, syncing: true, error: null }));
    try {
      const local = collectLocalSharedData(readJSON);
      const res = await apiPut(local, revisionRef.current, etagRef.current);
      if (res.error === "conflict") {
        if (res.current) revisionRef.current = res.current.revision;
        etagRef.current = res.etag ?? etagRef.current;
        markDirty(true);
        retryRef.current += 1;
        const delay = Math.min(1000 * 2 ** (retryRef.current - 1), MAX_PUSH_RETRY);
        setState((s) => ({
          ...s,
          syncing: false,
          conflict: true,
          error: "Konflikt erkannt. Die lokalen Änderungen werden erneut gesendet.",
          revision: revisionRef.current,
        }));
        schedulePushRef.current(delay);
        return;
      }
      if (res.ok && res.state) {
        etagRef.current = res.etag ?? etagRef.current;
        revisionRef.current = res.state.revision;
        retryRef.current = 0;
        const stillDirty = writeVersionRef.current !== version;
        markDirty(stillDirty);
        setState((s) => ({
          ...s,
          syncing: false,
          conflict: false,
          error: null,
          revision: res.state!.revision,
          updatedAt: res.state!.updatedAt,
          lastSyncedAt: Date.now(),
        }));
        if (stillDirty) schedulePushRef.current(0);
        if (typeof window !== "undefined") window.dispatchEvent(new Event(SHARED_SYNC_EVENT));
        return;
      }
      throw new Error("failed");
    } catch (e: any) {
      if (e?.message === "unauthorized") {
        setState((s) => ({ ...s, enabled: false, syncing: false }));
      } else {
        retryRef.current += 1;
        const delay = Math.min(1000 * 2 ** (retryRef.current - 1), MAX_PUSH_RETRY);
        setState((s) => ({ ...s, syncing: false, error: "Synchronisierung fehlgeschlagen." }));
        schedulePushRef.current(delay);
      }
    } finally {
      pushingRef.current = false;
    }
  }, [authed, markDirty]);

  const pull = useCallback(async (force = false) => {
    if (!authed || pushingRef.current) return;
    try {
      const res = await apiGet();
      if (!force && (dirtyRef.current || pushingRef.current)) {
        schedulePushRef.current(0);
        return;
      }
      if (force) markDirty(false);
      etagRef.current = res.etag;
      revisionRef.current = res.state.revision;
      applyingRemoteRef.current = true;
      try {
        applySharedDataToLocal(res.state.data, writeJSON);
      } finally {
        applyingRemoteRef.current = false;
      }
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
  }, [authed, markDirty]);

  const schedulePush = useCallback((delay = PUSH_DEBOUNCE) => {
    if (!authed || pushTimerRef.current !== null) return;
    pushTimerRef.current = window.setTimeout(() => {
      pushTimerRef.current = null;
      if (pushingRef.current) {
        schedulePushRef.current(200);
        return;
      }
      void push();
    }, delay);
  }, [authed, push]);

  useEffect(() => {
    schedulePushRef.current = schedulePush;
  }, [schedulePush]);

  useEffect(() => {
    if (!authed) {
      setState((s) => ({ ...s, enabled: false }));
      if (timerRef.current) clearInterval(timerRef.current);
      if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
      timerRef.current = null;
      pushTimerRef.current = null;
      return;
    }
    dirtyRef.current = readPendingSync();
    setState((s) => ({ ...s, enabled: true }));
    if (dirtyRef.current) schedulePush(0);
    else pull();
    timerRef.current = setInterval(pull, POLL_INTERVAL);
    const onFocus = () => pull();
    const onVis = () => { if (document.visibilityState === "visible") pull(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    const onWritten = () => {
      if (applyingRemoteRef.current) return;
      writeVersionRef.current += 1;
      markDirty(true);
      schedulePush();
    };
    window.addEventListener("dbs-storage-written", onWritten as EventListener);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
      timerRef.current = null;
      pushTimerRef.current = null;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("dbs-storage-written", onWritten as EventListener);
    };
  }, [authed, pull, push, markDirty, schedulePush]);

  const forcePush = useCallback(async () => {
    revisionRef.current = 0;
    markDirty(true);
    writeVersionRef.current += 1;
    await push();
  }, [push, markDirty]);

  const forcePull = useCallback(async () => {
    await pull(true);
  }, [pull]);

  return { ...state, push, pull: forcePull, forcePush };
}
