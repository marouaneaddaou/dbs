import type { BoxConfig } from "@/types/boxes";
import type { BoxGroupRecord } from "@/types/participants";

export interface BoxGroup {
  id: string;
  letter: string;
  label: string;
  names: readonly string[];
}

export const GROUP_BOX_COUNT = 6;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function sanitizeGroupNames(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const names: string[] = [];
  for (const entry of input) {
    if (typeof entry !== "string") continue;
    const name = entry.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

export function boxGroupLabel(name: string, time: string): string {
  const cleanName = name.trim();
  const cleanTime = time.trim();
  return cleanTime ? `${cleanName}: ${cleanTime}` : cleanName;
}

export function boxGroupLetter(name: string): string {
  const cleanName = name.trim();
  const match = cleanName.match(/^gruppe\s+(.+)$/i);
  const rest = (match ? match[1] : cleanName).trim();
  return rest.split(":")[0]?.trim() || "?";
}

export function boxGroupFromRecord(
  record: BoxGroupRecord,
  names: readonly string[] = record.participants,
): BoxGroup {
  return {
    id: record.id,
    letter: boxGroupLetter(record.name),
    label: boxGroupLabel(record.name, record.time),
    names: [...names],
  };
}

export function sanitizeBoxGroupRecords(
  input: unknown,
  now: number = Date.now(),
): BoxGroupRecord[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const records: BoxGroupRecord[] = [];

  for (const entry of input) {
    if (!isRecord(entry)) continue;
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    const time = typeof entry.time === "string" ? entry.time.trim() : "";
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    const createdAt =
      typeof entry.createdAt === "number" && Number.isFinite(entry.createdAt)
        ? entry.createdAt
        : now;
    records.push({
      id,
      name,
      time,
      participants: sanitizeGroupNames(entry.participants),
      createdAt,
      updatedAt:
        typeof entry.updatedAt === "number" && Number.isFinite(entry.updatedAt)
          ? entry.updatedAt
          : createdAt,
    });
  }

  return records;
}

function emptyGroupContents(group: BoxGroup, count: number): BoxConfig["contents"] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${group.id}-box-${index + 1}`,
    type: "text",
    text: "",
  }));
}

export function createGroupConfig(
  group: BoxGroup,
  createdAt = Date.now(),
  participants: readonly string[] = group.names,
): BoxConfig {
  const now = Date.now();
  return {
    id: group.id,
    name: group.label,
    boxCount: GROUP_BOX_COUNT,
    participants: [...participants],
    contents: emptyGroupContents(group, GROUP_BOX_COUNT),
    createdAt,
    updatedAt: now,
    saveState: "draft",
    savedAt: null,
    draftUpdatedAt: now,
  };
}

export function withGroupParticipants(
  config: BoxConfig,
  group: BoxGroup,
  participants: readonly string[] = group.names,
): BoxConfig {
  const participantsChanged =
    config.participants.length !== participants.length ||
    config.participants.some((name, index) => name !== participants[index]);

  let boxCount = config.boxCount;
  let contents = config.contents;
  let cleanedLegacy = false;
  const legacyShape =
    config.boxCount === group.names.length && config.contents.length === group.names.length;

  if (legacyShape) {
    const hasManualQuestions = config.contents.some(
      (content, index) => content.text.trim() !== "" && content.text !== group.names[index],
    );

    if (!hasManualQuestions) {
      boxCount = GROUP_BOX_COUNT;
      contents = emptyGroupContents(group, GROUP_BOX_COUNT);
      cleanedLegacy = true;
    } else {
      const cleaned = config.contents.map((content, index) =>
        content.text === group.names[index] ? { ...content, text: "" } : content,
      );
      if (cleaned.some((content, index) => content.text !== config.contents[index].text)) {
        contents = cleaned;
        cleanedLegacy = true;
      }
    }
  }

  if (!participantsChanged && !cleanedLegacy) return config;

  const now = Date.now();
  return {
    ...config,
    participants: [...participants],
    boxCount,
    contents,
    updatedAt: now,
    ...(config.saveState === "draft" ? { draftUpdatedAt: now } : {}),
  };
}
