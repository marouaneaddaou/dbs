import type { BoxConfig } from "@/types/boxes";
import type { SaveTracking } from "@/types/persistence";
import type { QuizRoom, QuizSessionRecord } from "@/types/quiz";
import type { VotingRoomRecord } from "@/types/voting";
import type { SharedData } from "@/lib/shared/schema";

export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export interface RemovedDrafts {
  boxConfigs: number;
  boxGames: number;
  votingRooms: number;
  quizRooms: number;
  quizSessions: number;
}

export interface PruneResult {
  data: SharedData;
  removed: RemovedDrafts;
  changed: boolean;
}

function normalizedCode(value: unknown): string {
  return typeof value === "string" ? value.replace(/[^a-z0-9]/gi, "").toUpperCase() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeSaveTracking<T extends SaveTracking>(record: T): T {
  if (!isRecord(record)) return record;
  if (record.saveState === "saved" || record.saveState === "draft") return record;
  return { ...record, saveState: "saved" };
}

export function markSaved<T extends SaveTracking>(record: T, at: number = Date.now()): T {
  return { ...record, saveState: "saved", savedAt: at };
}

export function markDraft<T extends SaveTracking>(record: T, at: number = Date.now()): T {
  return { ...record, saveState: "draft", savedAt: null, draftUpdatedAt: at };
}

export function touchDraft<T extends SaveTracking>(record: T, at: number = Date.now()): T {
  if (record.saveState !== "draft") return record;
  return { ...record, draftUpdatedAt: at };
}

function lastDraftTouch(record: SaveTracking & { updatedAt?: number; createdAt?: number }): number {
  if (typeof record.draftUpdatedAt === "number") return record.draftUpdatedAt;
  if (typeof record.updatedAt === "number") return record.updatedAt;
  if (typeof record.createdAt === "number") return record.createdAt;
  return 0;
}

export function isSaved(record: SaveTracking): boolean {
  return record.saveState !== "draft";
}

export function draftExpiresAt(
  record: SaveTracking & { updatedAt?: number; createdAt?: number },
): number | null {
  if (record.saveState !== "draft") return null;
  return lastDraftTouch(record) + DRAFT_TTL_MS;
}

export function isExpiredDraft(
  record: SaveTracking & { updatedAt?: number; createdAt?: number },
  now: number = Date.now(),
): boolean {
  if (record.saveState !== "draft") return false;
  return now - lastDraftTouch(record) >= DRAFT_TTL_MS;
}

export function pruneExpiredDrafts(data: SharedData, now: number = Date.now()): PruneResult {
  const configs = Array.isArray(data.boxConfigs) ? data.boxConfigs : [];
  const boxConfigs = configs.filter((config) => !isExpiredDraft(config, now));
  const expiredBoxIds = new Set(
    configs.filter((config) => isExpiredDraft(config, now)).map((config) => config.id),
  );

  const games = isRecord(data.boxGames) ? data.boxGames : {};
  const boxGames = Object.fromEntries(
    Object.entries(games).filter(([id, game]) => {
      if (!isRecord(game)) return true;
      if (expiredBoxIds.has(id)) return false;
      const configId = typeof game.configId === "string" ? game.configId : "";
      return !expiredBoxIds.has(configId);
    }),
  );

  const voting = Array.isArray(data.votingRooms) ? data.votingRooms : [];
  const votingRooms = voting.filter((record) => {
    const room = isRecord(record) && isRecord(record.room) ? (record.room as VotingRoomRecord["room"]) : null;
    return !room || !isExpiredDraft(room, now);
  });

  const quizzes = Array.isArray(data.quizRooms) ? data.quizRooms : [];
  const expiredQuizCodes = new Set(
    quizzes
      .filter((room) => isExpiredDraft(room, now))
      .map((room) => normalizedCode(room.code))
      .filter(Boolean),
  );
  const quizRooms = quizzes.filter((room) => !expiredQuizCodes.has(normalizedCode(room.code)));

  const sessions = isRecord(data.quizSessions) ? data.quizSessions : {};
  const quizSessions = Object.fromEntries(
    Object.entries(sessions).filter(([key, record]) => {
      if (expiredQuizCodes.has(normalizedCode(key))) return false;
      if (!isRecord(record)) return true;
      const session = isRecord(record.session) ? record.session : null;
      const code = session && typeof session.roomCode === "string" ? session.roomCode : "";
      return !expiredQuizCodes.has(normalizedCode(code));
    }),
  ) as Record<string, QuizSessionRecord>;

  const removed: RemovedDrafts = {
    boxConfigs: configs.length - boxConfigs.length,
    boxGames: Object.keys(games).length - Object.keys(boxGames).length,
    votingRooms: voting.length - votingRooms.length,
    quizRooms: quizzes.length - quizRooms.length,
    quizSessions: Object.keys(sessions).length - Object.keys(quizSessions).length,
  };

  return {
    data: {
      ...data,
      boxConfigs,
      boxGames,
      votingRooms,
      quizRooms,
      quizSessions,
    },
    removed,
    changed:
      removed.boxConfigs + removed.boxGames + removed.votingRooms + removed.quizRooms + removed.quizSessions >
      0,
  };
}

export function countDrafts(data: SharedData): number {
  const configs = data.boxConfigs.filter((item) => item.saveState === "draft").length;
  const voting = data.votingRooms.filter((item) => item.room?.saveState === "draft").length;
  const quizzes = data.quizRooms.filter((item) => item.saveState === "draft").length;
  return configs + voting + quizzes;
}

export function normalizeSharedSaveTracking(data: SharedData): SharedData {
  return {
    ...data,
    boxConfigs: data.boxConfigs.map((config) => normalizeSaveTracking(config)),
    votingRooms: data.votingRooms.map((record) =>
      isRecord(record) && isRecord(record.room)
        ? { ...record, room: normalizeSaveTracking(record.room as VotingRoomRecord["room"]) }
        : record,
    ),
    quizRooms: data.quizRooms.map((room) => normalizeSaveTracking(room)),
  };
}

export function isQuizRoom(record: unknown): record is QuizRoom {
  return isRecord(record) && typeof record.code === "string";
}

export function isBoxConfig(record: unknown): record is BoxConfig {
  return isRecord(record) && typeof record.id === "string";
}
