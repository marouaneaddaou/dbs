import type { BoxConfig } from "@/types/boxes";
import type { BoxGroupMemberships, BoxParticipant } from "@/types/participants";
import { BOX_GROUPS, type BoxGroup } from "@/lib/box-groups";

const PARTICIPANT_ID_PREFIX = "participant:";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanName(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeParticipantName(name: string): string {
  return cleanName(name).toLowerCase();
}

export function participantIdForName(name: string): string {
  return `${PARTICIPANT_ID_PREFIX}${normalizeParticipantName(name)}`;
}

export function participantNameFromId(id: string): string {
  return id.startsWith(PARTICIPANT_ID_PREFIX) ? id.slice(PARTICIPANT_ID_PREFIX.length) : id;
}

function timestamp(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function sanitizeParticipantRecords(
  input: unknown,
  now: number = Date.now(),
): BoxParticipant[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const records: BoxParticipant[] = [];

  for (const entry of input) {
    if (!isRecord(entry)) continue;
    const id = typeof entry.id === "string" ? entry.id : "";
    const rawName =
      cleanName(entry.name) ||
      cleanName(entry.normalizedName) ||
      (id ? participantNameFromId(id) : "");
    const name = rawName.trim();
    const normalizedName = normalizeParticipantName(name);
    if (!normalizedName || seen.has(normalizedName)) continue;
    seen.add(normalizedName);
    const createdAt = timestamp(entry.createdAt, now);
    records.push({
      id: id || participantIdForName(name),
      name,
      normalizedName,
      createdAt,
      updatedAt: timestamp(entry.updatedAt, createdAt),
    });
  }

  return records;
}

export function sanitizeMemberships(input: unknown): BoxGroupMemberships {
  if (!isRecord(input)) return {};
  const memberships: BoxGroupMemberships = {};

  for (const [groupId, value] of Object.entries(input)) {
    if (!Array.isArray(value)) continue;
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const entry of value) {
      if (typeof entry !== "string" || entry.length === 0 || seen.has(entry)) continue;
      seen.add(entry);
      ids.push(entry);
    }
    memberships[groupId] = ids;
  }

  return memberships;
}

export function registerParticipantNames(
  participants: readonly BoxParticipant[],
  names: readonly string[],
  now: number = Date.now(),
): BoxParticipant[] {
  const byNormalizedName = new Map<string, BoxParticipant>();
  for (const participant of participants) {
    const key = participant.normalizedName || normalizeParticipantName(participant.name);
    if (!byNormalizedName.has(key)) byNormalizedName.set(key, participant);
  }

  let changed = false;
  for (const rawName of names) {
    const name = cleanName(rawName);
    const normalizedName = normalizeParticipantName(name);
    if (!normalizedName || byNormalizedName.has(normalizedName)) continue;
    changed = true;
    byNormalizedName.set(normalizedName, {
      id: participantIdForName(name),
      name,
      normalizedName,
      createdAt: now,
      updatedAt: now,
    });
  }

  return changed ? Array.from(byNormalizedName.values()) : (participants as BoxParticipant[]);
}

export function membershipIdsForNames(
  participants: readonly BoxParticipant[],
  names: readonly string[],
): string[] {
  const idByNormalizedName = new Map<string, string>();
  for (const participant of participants) {
    const key = participant.normalizedName || normalizeParticipantName(participant.name);
    if (!idByNormalizedName.has(key)) idByNormalizedName.set(key, participant.id);
  }

  const seen = new Set<string>();
  const ids: string[] = [];
  for (const rawName of names) {
    const normalizedName = normalizeParticipantName(rawName);
    if (!normalizedName) continue;
    const id = idByNormalizedName.get(normalizedName) ?? participantIdForName(rawName);
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function membershipNamesForIds(
  participants: readonly BoxParticipant[],
  ids: readonly string[],
): string[] {
  const byId = new Map<string, BoxParticipant>();
  for (const participant of participants) byId.set(participant.id, participant);

  const seen = new Set<string>();
  const names: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const name = byId.get(id)?.name ?? participantNameFromId(id);
    if (name) names.push(name);
  }
  return names;
}

function groupParticipantNames(
  group: BoxGroup,
  configs: readonly BoxConfig[],
  participants: readonly BoxParticipant[],
  memberships: BoxGroupMemberships,
): string[] {
  const membership = memberships[group.id];
  if (membership) return membershipNamesForIds(participants, membership);
  const config = configs.find((item) => item.id === group.id);
  return config ? [...config.participants] : [...group.names];
}

export interface ReconciledParticipantData {
  participants: BoxParticipant[];
  memberships: BoxGroupMemberships;
}

export function reconcileParticipantData(
  configs: readonly BoxConfig[],
  participantInput: unknown,
  membershipInput: unknown,
  now: number = Date.now(),
): ReconciledParticipantData {
  const configList = Array.isArray(configs) ? configs : [];
  const existingParticipants = sanitizeParticipantRecords(participantInput, now);
  const memberships = sanitizeMemberships(membershipInput);

  const namesToKeep: string[] = existingParticipants.map((participant) => participant.name);
  for (const config of configList) namesToKeep.push(...config.participants);
  for (const group of BOX_GROUPS) namesToKeep.push(...group.names);
  for (const ids of Object.values(memberships)) {
    for (const id of ids) namesToKeep.push(participantNameFromId(id));
  }

  const participants = registerParticipantNames(existingParticipants, namesToKeep, now);

  for (const group of BOX_GROUPS) {
    if (Object.prototype.hasOwnProperty.call(memberships, group.id)) continue;
    const names = groupParticipantNames(group, configList, participants, memberships);
    memberships[group.id] = membershipIdsForNames(participants, names);
  }

  for (const config of configList) {
    if (Object.prototype.hasOwnProperty.call(memberships, config.id)) continue;
    memberships[config.id] = membershipIdsForNames(participants, config.participants);
  }

  for (const ids of Object.values(memberships)) {
    for (const id of ids) {
      const name = participantNameFromId(id);
      if (!name) continue;
      const normalizedName = normalizeParticipantName(name);
      if (participants.some((participant) => participant.normalizedName === normalizedName)) continue;
      participants.push({
        id,
        name,
        normalizedName,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  return { participants, memberships };
}

export function syncParticipantDataForConfig(
  configId: string,
  names: readonly string[],
  participants: readonly BoxParticipant[],
  memberships: BoxGroupMemberships,
  now: number = Date.now(),
): ReconciledParticipantData {
  const nextParticipants = registerParticipantNames(participants, names, now);
  return {
    participants: nextParticipants,
    memberships: {
      ...memberships,
      [configId]: membershipIdsForNames(nextParticipants, names),
    },
  };
}

export function stringArraysEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
