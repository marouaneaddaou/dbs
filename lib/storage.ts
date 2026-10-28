/**
 * Reusable, SSR-safe localStorage utilities.
 *
 * Everything the app persists lives under a versioned key so we can migrate
 * data in the future without ever losing user content unexpectedly.
 *
 * localStorage is browser-specific: it does NOT sync between devices,
 * browsers, or even tabs automatically. Use the JSON export/import feature
 * to move data around manually.
 */

export const STORAGE_VERSION = 1;

export const STORAGE_KEYS = {
  meta: "dbs_meta_v1",
  settings: "dbs_app_settings_v1",
  boxConfigs: "dbs_random_boxes_configs_v1",
  boxGames: "dbs_random_boxes_games_v1",
  votingRooms: "dbs_voting_rooms_v1",
  quizRooms: "dbs_quiz_rooms_v1",
  quizSessions: "dbs_quiz_sessions_v1",
  quizHistory: "dbs_quiz_history_v1",
  boxGroupMembers: "dbs_box_group_members_v1",
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

export interface StorageMeta {
  version: number;
  updatedAt: number;
}

/** True when running in the browser (never touch localStorage on the server). */
export function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/** Parse JSON defensively so corrupted stored data never crashes the app. */
export function safeParse<T>(raw: string | null, fallback: T): T {
  if (raw === null || raw === undefined || raw === "") return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed === null || parsed === undefined ? fallback : (parsed as T);
  } catch {
    return fallback;
  }
}

export function readJSON<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    return safeParse<T>(window.localStorage.getItem(key), fallback);
  } catch {
    return fallback;
  }
}

export function writeJSON<T>(key: string, value: T): boolean {
  if (!isBrowser()) return false;
  try {
    const serialized = JSON.stringify(value);
    if (window.localStorage.getItem(key) === serialized) return true;
    window.localStorage.setItem(key, serialized);
    touchMeta();
    try {
      window.dispatchEvent(new Event("dbs-storage-written"));
      window.dispatchEvent(new StorageEvent("storage", { key }));
    } catch {
      /* ignore */
    }
    return true;
  } catch {
    // Quota exceeded or storage disabled.
    return false;
  }
}

export function removeKey(key: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Record the last time we wrote anything, purely informational. */
function touchMeta(): void {
  try {
    const meta: StorageMeta = { version: STORAGE_VERSION, updatedAt: Date.now() };
    window.localStorage.setItem(STORAGE_KEYS.meta, JSON.stringify(meta));
  } catch {
    /* ignore */
  }
}

export function getMeta(): StorageMeta {
  return readJSON<StorageMeta>(STORAGE_KEYS.meta, {
    version: STORAGE_VERSION,
    updatedAt: 0,
  });
}

/**
 * Migration hook. Runs once on first client load. Because today's schema is
 * version 1 there is nothing to migrate yet, but the plumbing is in place so
 * future versions can transform old data instead of discarding it.
 */
export function runMigrations(): void {
  if (!isBrowser()) return;
  const meta = getMeta();
  if (meta.version === STORAGE_VERSION) return;
  // Future: if (meta.version < 2) { ...transform... }
  writeJSON(STORAGE_KEYS.meta, { version: STORAGE_VERSION, updatedAt: Date.now() });
}

export interface BackupPayload {
  app: string;
  version: number;
  exportedAt: number;
  data: Record<string, unknown>;
}

/** Export every known key into a portable JSON backup. */
export function exportBackup(): BackupPayload {
  const data: Record<string, unknown> = {};
  if (isBrowser()) {
    for (const key of Object.values(STORAGE_KEYS)) {
      if (key === STORAGE_KEYS.meta) continue;
      const raw = window.localStorage.getItem(key);
      if (raw === null) continue;
      data[key] = safeParse(raw, null);
    }
  }
  return {
    app: "dbs-zentrum",
    version: STORAGE_VERSION,
    exportedAt: Date.now(),
    data,
  };
}

export interface ImportResult {
  ok: boolean
  imported: number;
  error?: string;
}

/** Import a JSON backup, forgivingly. Unknown keys are ignored. */
export function importBackup(payload: unknown): ImportResult {
  if (!isBrowser()) return { ok: false, imported: 0, error: "Nicht im Browser verfügbar" };
  if (!payload || typeof payload !== "object") {
    return { ok: false, imported: 0, error: "Das Backup ist kein gültiges Objekt" };
  }
  const obj = payload as Partial<BackupPayload>;
  if (!obj.data || typeof obj.data !== "object") {
    return { ok: false, imported: 0, error: "Das Backup enthält keinen Datenbereich" };
  }
  const validKeys = new Set<string>(Object.values(STORAGE_KEYS));
  let imported = 0;
  for (const [key, value] of Object.entries(obj.data)) {
    if (!validKeys.has(key)) continue;
    if (writeJSON(key, value)) imported += 1;
  }
  return { ok: true, imported };
}

/** Remove every key this app owns. Requires explicit user confirmation. */
export function clearAllAppData(): void {
  if (!isBrowser()) return;
  for (const key of Object.values(STORAGE_KEYS)) {
    removeKey(key);
  }
}

/* ------------------------------------------------------------------ */
/* sessionStorage helpers — for temporary, per-session information.    */
/* ------------------------------------------------------------------ */

export function readSession<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    return safeParse<T>(window.sessionStorage.getItem(key), fallback);
  } catch {
    return fallback;
  }
}

export function writeSession<T>(key: string, value: T): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function removeSession(key: string): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Small unique id helper that works in every browser we target. */
export function uid(prefix = "id"): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

/** Generate a short, readable, uppercase room code (local identifier only). */
export function generateRoomCode(length = 6): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const cryptoObj = typeof window !== "undefined" ? window.crypto : undefined;
  for (let i = 0; i < length; i += 1) {
    let value: number;
    if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
      const buf = new Uint32Array(1);
      cryptoObj.getRandomValues(buf);
      value = buf[0];
    } else {
      value = Math.floor(Math.random() * 0xffffffff);
    }
    out += alphabet[value % alphabet.length];
  }
  return out;
}

/**
 * Generate a room code that is guaranteed not to collide with existing codes.
 *
 * `exists` receives the candidate code and returns true when it is already in
 * use (case-insensitive). We retry a bounded number of times, then fall back to
 * a longer code so we can never hand back a duplicate.
 *
 * Note: codes are LOCAL identifiers. Uniqueness is only meaningful within the
 * browser storage the caller checks — there is no server to reserve codes on.
 */
export function generateUniqueCode(
  exists: (code: string) => boolean,
  length = 6,
): string {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const candidate = generateRoomCode(length);
    if (!exists(candidate)) return candidate;
  }
  // Extremely unlikely fallback: widen the code space until it is unique.
  let candidate = generateRoomCode(length + 2);
  while (exists(candidate)) candidate = generateRoomCode(length + 2);
  return candidate;
}
