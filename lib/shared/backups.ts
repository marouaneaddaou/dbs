"use client";

import type { SharedStateDocument } from "@/lib/shared/schema";

export interface BackupEntry {
  pathname: string;
  createdAt: number;
  size: number;
}

export interface BackupListResponse {
  backups: BackupEntry[];
  created: BackupEntry | null;
  storage: "blob" | "local";
}

export interface MaintenanceResponse {
  ok: boolean;
  changed: boolean;
  revision: number;
  removed: {
    boxConfigs: number;
    boxGames: number;
    votingRooms: number;
    quizRooms: number;
    quizSessions: number;
  };
}

async function parse<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data?.error || "request_failed");
  return data;
}

export async function fetchBackups(): Promise<BackupListResponse> {
  const res = await fetch("/api/shared/backups", { cache: "no-store", credentials: "include" });
  return parse<BackupListResponse>(res);
}

export async function createManualBackup(): Promise<BackupEntry> {
  const res = await fetch("/api/shared/backups", {
    method: "POST",
    credentials: "include",
  });
  const data = await parse<{ backup: BackupEntry }>(res);
  return data.backup;
}

export async function restoreBackup(pathname: string): Promise<SharedStateDocument> {
  const res = await fetch("/api/shared/restore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ pathname }),
  });
  const data = await parse<{ state: SharedStateDocument }>(res);
  return data.state;
}

export async function runMaintenance(): Promise<MaintenanceResponse> {
  const res = await fetch("/api/shared/maintenance", {
    method: "POST",
    credentials: "include",
  });
  return parse<MaintenanceResponse>(res);
}

export function backupDownloadUrl(pathname: string): string {
  return `/api/shared/backups/download?pathname=${encodeURIComponent(pathname)}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round((bytes / 1024) * 10) / 10} KB`;
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
}
