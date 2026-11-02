"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BoxGroupRecord } from "@/types/participants";
import type { GroupInput } from "@/lib/groups";
import { SHARED_SYNC_EVENT } from "@/lib/shared/client-sync";

const POLL_INTERVAL = 10000;

interface GroupsResponse {
  groups?: BoxGroupRecord[];
  group?: BoxGroupRecord;
  error?: string;
}

function errorMessage(code?: string): string {
  switch (code) {
    case "unauthorized":
      return "Anmeldung erforderlich. Bitte melde dich erneut an.";
    case "group_name_required":
      return "Bitte gib einen Gruppennamen ein.";
    case "group_name_too_long":
      return "Der Gruppenname ist zu lang.";
    case "group_time_required":
      return "Bitte gib eine Uhrzeit ein.";
    case "group_time_too_long":
      return "Die Uhrzeit ist zu lang.";
    case "group_participants_required":
      return "Füge mindestens eine teilnehmende Person hinzu.";
    case "group_participants_too_many":
      return "Die Gruppe enthält zu viele Namen.";
    case "group_not_found":
      return "Diese Gruppe wurde bereits entfernt.";
    case "payload_too_large":
      return "Die Gruppendaten sind zu groß.";
    default:
      return "Die Gruppen konnten nicht gespeichert werden.";
  }
}

async function readGroups(res: Response): Promise<BoxGroupRecord[]> {
  const data = (await res.json().catch(() => ({}))) as GroupsResponse;
  if (!res.ok || !Array.isArray(data.groups)) {
    throw new Error(errorMessage(data.error));
  }
  return data.groups;
}

export function useGroups() {
  const [groups, setGroups] = useState<BoxGroupRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const loadedRef = useRef(false);
  const requestRef = useRef(0);
  const mutationRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    const mutation = mutationRef.current;
    if (!loadedRef.current) setLoading(true);
    try {
      const res = await fetch("/api/groups", {
        cache: "no-store",
        credentials: "include",
      });
      const nextGroups = await readGroups(res);
      if (
        !mountedRef.current ||
        request !== requestRef.current ||
        mutation !== mutationRef.current
      ) {
        return;
      }
      setGroups(nextGroups);
      setError(null);
    } catch (loadError) {
      if (
        !mountedRef.current ||
        request !== requestRef.current ||
        mutation !== mutationRef.current
      ) {
        return;
      }
      setError(loadError instanceof Error ? loadError.message : errorMessage());
    } finally {
      if (mountedRef.current && request === requestRef.current) {
        loadedRef.current = true;
        setLoading(false);
      }
    }
  }, []);

  const mutate = useCallback(
    async (url: string, method: "PUT" | "DELETE", body?: GroupInput) => {
      mutationRef.current += 1;
      setSaving(true);
      try {
        const res = await fetch(url, {
          method,
          headers: body ? { "Content-Type": "application/json" } : undefined,
          credentials: "include",
          body: body ? JSON.stringify(body) : undefined,
        });
        const nextGroups = await readGroups(res);
        mutationRef.current += 1;
        if (!mountedRef.current) return;
        setGroups(nextGroups);
        setError(null);
      } finally {
        mutationRef.current += 1;
        if (mountedRef.current) setSaving(false);
      }
    },
    [],
  );

  useEffect(() => {
    mountedRef.current = true;
    void load();
    const timer = window.setInterval(() => void load(), POLL_INTERVAL);
    const onFocus = () => void load();
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    const onOnline = () => void load();
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    window.addEventListener(SHARED_SYNC_EVENT, onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      mountedRef.current = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      window.removeEventListener(SHARED_SYNC_EVENT, onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const updateGroup = useCallback(
    (id: string, input: GroupInput) =>
      mutate(`/api/groups/${encodeURIComponent(id)}`, "PUT", input),
    [mutate],
  );

  const deleteGroup = useCallback(
    (id: string) => mutate(`/api/groups/${encodeURIComponent(id)}`, "DELETE"),
    [mutate],
  );

  return {
    groups,
    loading,
    saving,
    error,
    refresh: load,
    updateGroup,
    deleteGroup,
  } as const;
}
