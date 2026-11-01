import { normalizeNames } from "@/lib/randomization";

export const GROUP_NAME_MAX_LENGTH = 120;
export const GROUP_TIME_MAX_LENGTH = 80;
export const GROUP_PARTICIPANTS_MAX = 500;

export interface GroupInput {
  name: string;
  time: string;
  participants: string[];
}

export type GroupValidationResult =
  | { ok: true; value: GroupInput }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function sanitizeGroupInput(input: unknown): GroupValidationResult {
  if (!isRecord(input)) return { ok: false, error: "group_invalid" };

  const name = typeof input.name === "string" ? input.name.trim() : "";
  const time = typeof input.time === "string" ? input.time.trim() : "";
  const participants = normalizeNames(
    Array.isArray(input.participants)
      ? input.participants.filter((entry): entry is string => typeof entry === "string")
      : [],
  );

  if (!name) return { ok: false, error: "group_name_required" };
  if (name.length > GROUP_NAME_MAX_LENGTH) return { ok: false, error: "group_name_too_long" };
  if (!time) return { ok: false, error: "group_time_required" };
  if (time.length > GROUP_TIME_MAX_LENGTH) return { ok: false, error: "group_time_too_long" };
  if (participants.length === 0) {
    return { ok: false, error: "group_participants_required" };
  }
  if (participants.length > GROUP_PARTICIPANTS_MAX) {
    return { ok: false, error: "group_participants_too_many" };
  }

  return { ok: true, value: { name, time, participants } };
}
