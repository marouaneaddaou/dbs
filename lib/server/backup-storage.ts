import { randomBytes } from "crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "fs/promises";
import { join } from "path";
import { get, list, put } from "@vercel/blob";
import { isSharedStateDocument, type SharedStateDocument } from "@/lib/shared/schema";
import { isBlobConfigured } from "@/lib/server/shared-storage";

export const BACKUP_PREFIX = "dbs/backups/";
const BACKUP_PATTERN = /^dbs\/backups\/[A-Za-z0-9._-]+\.json$/;
const LOCAL_BACKUP_DIR = () => join(process.cwd(), ".data", "backups");

export interface BackupInfo {
  pathname: string;
  createdAt: number;
  size: number;
}

function backupFilename(reason: string, now: number): string {
  const safeReason = reason.replace(/[^a-z0-9-]/gi, "-").slice(0, 32) || "backup";
  const stamp = new Date(now).toISOString().replace(/[:.]/g, "-");
  const suffix = randomBytes(3).toString("hex");
  return `${BACKUP_PREFIX}${stamp}-${safeReason}-${suffix}.json`;
}

function isValidBackupPath(pathname: string): boolean {
  return BACKUP_PATTERN.test(pathname);
}

async function readLocalBackup(pathname: string): Promise<SharedStateDocument | null> {
  if (!isValidBackupPath(pathname)) return null;
  const filename = pathname.slice(BACKUP_PREFIX.length);
  try {
    const text = await readFile(join(LOCAL_BACKUP_DIR(), filename), "utf8");
    const parsed = JSON.parse(text);
    return isSharedStateDocument(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function readBlobBackup(pathname: string): Promise<SharedStateDocument | null> {
  if (!isValidBackupPath(pathname)) return null;
  const result = await get(pathname, { access: "private" as any, useCache: false } as any);
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  const reader = result.stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  return isSharedStateDocument(parsed) ? parsed : null;
}

export async function createBackup(
  state: SharedStateDocument,
  reason: string = "manual",
  now: number = Date.now(),
): Promise<BackupInfo> {
  const pathname = backupFilename(reason, now);
  const json = JSON.stringify(state);
  if (isBlobConfigured()) {
    await put(pathname, json, {
      access: "private",
      contentType: "application/json",
      allowOverwrite: false,
    } as any);
    return { pathname, createdAt: now, size: Buffer.byteLength(json) };
  }

  await mkdir(LOCAL_BACKUP_DIR(), { recursive: true });
  const filename = pathname.slice(BACKUP_PREFIX.length);
  await writeFile(join(LOCAL_BACKUP_DIR(), filename), json, { encoding: "utf8", flag: "wx" });
  return { pathname, createdAt: now, size: Buffer.byteLength(json) };
}

export async function listBackups(limit: number = 50): Promise<BackupInfo[]> {
  if (isBlobConfigured()) {
    const found: BackupInfo[] = [];
    let cursor: string | undefined;
    do {
      const result = await list({ prefix: BACKUP_PREFIX, cursor, limit: 1000 });
      for (const blob of result.blobs) {
        if (!isValidBackupPath(blob.pathname)) continue;
        found.push({
          pathname: blob.pathname,
          createdAt: blob.uploadedAt.getTime(),
          size: blob.size,
        });
      }
      cursor = result.hasMore ? result.cursor : undefined;
    } while (cursor);
    return found.sort((a, b) => b.createdAt - a.createdAt).slice(0, Math.max(1, limit));
  }

  try {
    const dir = LOCAL_BACKUP_DIR();
    const names = (await readdir(dir)).filter((name) => name.endsWith(".json"));
    const rows = await Promise.all(
      names.map(async (name) => {
        const info = await stat(join(dir, name));
        return {
          pathname: `${BACKUP_PREFIX}${name}`,
          createdAt: info.mtimeMs,
          size: info.size,
        };
      }),
    );
    return rows.sort((a, b) => b.createdAt - a.createdAt).slice(0, Math.max(1, limit));
  } catch {
    return [];
  }
}

export async function readBackup(pathname: string): Promise<SharedStateDocument | null> {
  if (!isValidBackupPath(pathname)) return null;
  if (isBlobConfigured()) return readBlobBackup(pathname);
  return readLocalBackup(pathname);
}

export async function ensureDailyBackup(
  state: SharedStateDocument,
  now: number = Date.now(),
): Promise<BackupInfo | null> {
  const newest = (await listBackups(1))[0];
  if (newest && now - newest.createdAt < 24 * 60 * 60 * 1000) return null;
  return createBackup(state, "daily", now);
}
