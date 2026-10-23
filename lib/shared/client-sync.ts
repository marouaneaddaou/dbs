"use client";

import type { SharedData, SharedStateDocument } from "@/lib/shared/schema";
import { STORAGE_KEYS } from "@/lib/storage";

export const SHARED_SYNC_EVENT = "dbs-shared-sync-changed";

export interface SharedSyncState {
  enabled: boolean;
  syncing: boolean;
  error: string | null;
  conflict: boolean;
  revision: number;
  updatedAt: number | null;
  lastSyncedAt: number | null;
}

interface GetResponse {
  state?: SharedStateDocument;
  etag?: string | null;
}

interface PutResponse {
  ok?: boolean;
  state?: SharedStateDocument;
  etag?: string | null;
  error?: string;
  current?: SharedStateDocument;
}

export async function apiGet(): Promise<{ state: SharedStateDocument; etag: string | null }> {
  const res = await fetch("/api/shared", { cache: "no-store", credentials: "include" });
  if (res.status === 401) throw new Error("unauthorized");
  const data = (await res.json().catch(() => ({}))) as GetResponse;
  return { state: data.state as SharedStateDocument, etag: data.etag ?? null };
}

export async function apiPut(data: SharedData, baseRevision: number, ifMatch?: string | null): Promise<PutResponse> {
  const res = await fetch("/api/shared", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ data, baseRevision, ifMatch }),
  });
  return (await res.json().catch(() => ({}))) as PutResponse;
}

export function collectLocalSharedData(readJSONFn: <T>(key: string, fallback: T) => T): SharedData {
  return {
    boxConfigs: readJSONFn(STORAGE_KEYS.boxConfigs, [] as any),
    boxGames: readJSONFn(STORAGE_KEYS.boxGames, {} as any),
    votingRooms: readJSONFn(STORAGE_KEYS.votingRooms, [] as any),
    quizRooms: readJSONFn(STORAGE_KEYS.quizRooms, [] as any),
    quizSessions: readJSONFn(STORAGE_KEYS.quizSessions, {} as any),
    quizHistory: readJSONFn(STORAGE_KEYS.quizHistory, {} as any),
  };
}

export function applySharedDataToLocal(
  data: SharedData,
  writeJSONFn: <T>(key: string, value: T) => boolean,
): void {
  try {
    writeJSONFn(STORAGE_KEYS.boxConfigs, data.boxConfigs ?? []);
    writeJSONFn(STORAGE_KEYS.boxGames, data.boxGames ?? {});
    writeJSONFn(STORAGE_KEYS.votingRooms, data.votingRooms ?? []);
    writeJSONFn(STORAGE_KEYS.quizRooms, data.quizRooms ?? []);
    writeJSONFn(STORAGE_KEYS.quizSessions, data.quizSessions ?? {});
    writeJSONFn(STORAGE_KEYS.quizHistory, data.quizHistory ?? {});
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("dbs-storage-written"));
    }
  } catch {
    /* ignore */
  }
}
