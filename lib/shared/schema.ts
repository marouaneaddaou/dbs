import type { BoxConfig, BoxGame } from "@/types/boxes";
import type { BoxGroupMemberships, BoxParticipant } from "@/types/participants";
import type { VotingRoomRecord } from "@/types/voting";
import type { QuizHistoryMap, QuizRoom, QuizSessionRecord } from "@/types/quiz";
import { normalizeSharedSaveTracking } from "@/lib/shared/retention";
import { reconcileParticipantData, sanitizeMemberships, sanitizeParticipantRecords } from "@/lib/participants";

export const SHARED_SCHEMA_VERSION = 1;

export const SHARED_BLOB_PATH = "dbs/shared-state.json";

export interface SharedData {
  boxConfigs: BoxConfig[];
  boxGames: Record<string, BoxGame>;
  boxParticipants: BoxParticipant[];
  boxGroupMemberships: BoxGroupMemberships;
  votingRooms: VotingRoomRecord[];
  quizRooms: QuizRoom[];
  quizSessions: Record<string, QuizSessionRecord>;
  quizHistory: QuizHistoryMap;
}

export interface SharedStateDocument {
  schemaVersion: number;
  revision: number;
  updatedAt: number;
  updatedBy?: string | null;
  data: SharedData;
}

export function createEmptySharedData(): SharedData {
  return {
    boxConfigs: [],
    boxGames: {},
    boxParticipants: [],
    boxGroupMemberships: {},
    votingRooms: [],
    quizRooms: [],
    quizSessions: {},
    quizHistory: {},
  };
}

export function createEmptySharedState(): SharedStateDocument {
  const now = Date.now();
  return {
    schemaVersion: SHARED_SCHEMA_VERSION,
    revision: 0,
    updatedAt: now,
    updatedBy: null,
    data: createEmptySharedData(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isSharedStateDocument(value: unknown): value is SharedStateDocument {
  if (!isRecord(value)) return false;
  if (typeof value.schemaVersion !== "number") return false;
  if (typeof value.revision !== "number") return false;
  if (typeof value.updatedAt !== "number") return false;
  if (!isRecord(value.data)) return false;
  return true;
}

export function sanitizeSharedData(input: unknown): SharedData {
  if (!isRecord(input)) return createEmptySharedData();
  const data = input as Partial<SharedData>;
  const boxConfigs = Array.isArray(data.boxConfigs) ? (data.boxConfigs as BoxConfig[]) : [];
  const boxParticipants = sanitizeParticipantRecords(data.boxParticipants);
  const boxGroupMemberships = sanitizeMemberships(data.boxGroupMemberships);
  const reconciled = reconcileParticipantData(
    boxConfigs,
    boxParticipants,
    boxGroupMemberships,
  );

  return normalizeSharedSaveTracking({
    boxConfigs,
    boxGames: isRecord(data.boxGames) ? (data.boxGames as Record<string, BoxGame>) : {},
    boxParticipants: reconciled.participants,
    boxGroupMemberships: reconciled.memberships,
    votingRooms: Array.isArray(data.votingRooms) ? (data.votingRooms as VotingRoomRecord[]) : [],
    quizRooms: Array.isArray(data.quizRooms) ? (data.quizRooms as QuizRoom[]) : [],
    quizSessions: isRecord(data.quizSessions) ? (data.quizSessions as Record<string, QuizSessionRecord>) : {},
    quizHistory: isRecord(data.quizHistory) ? (data.quizHistory as QuizHistoryMap) : {},
  });
}

export function normalizeSharedStateDocument(state: SharedStateDocument): SharedStateDocument {
  return {
    ...state,
    data: sanitizeSharedData(state.data),
  };
}

export function mergeSharedData(base: SharedData, incoming: SharedData): SharedData {
  return {
    boxConfigs: incoming.boxConfigs ?? base.boxConfigs,
    boxGames: incoming.boxGames ?? base.boxGames,
    boxParticipants: incoming.boxParticipants ?? base.boxParticipants,
    boxGroupMemberships: incoming.boxGroupMemberships ?? base.boxGroupMemberships,
    votingRooms: incoming.votingRooms ?? base.votingRooms,
    quizRooms: incoming.quizRooms ?? base.quizRooms,
    quizSessions: incoming.quizSessions ?? base.quizSessions,
    quizHistory: incoming.quizHistory ?? base.quizHistory,
  };
}

const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024;

export function assertSharedPayloadSize(json: string): void {
  const bytes = new TextEncoder().encode(json).length;
  if (bytes > MAX_PAYLOAD_BYTES) {
    throw new Error(`Shared state payload too large (${bytes} bytes). Max is ${MAX_PAYLOAD_BYTES} bytes.`);
  }
}
