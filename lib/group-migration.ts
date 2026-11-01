import type { SharedData } from "@/lib/shared/schema";
import { sanitizeSharedData } from "@/lib/shared/schema";
import { GROUP_SEEDS, GROUP_SEED_VERSION, type GroupSeed } from "@/lib/group-seed";
import { sanitizeGroupNames } from "@/lib/box-groups";
import {
  membershipIdsForNames,
  membershipNamesForIds,
  registerParticipantNames,
  stringArraysEqual,
} from "@/lib/participants";

function normalizedGroupName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function seedTime(seed: GroupSeed, time: string): string {
  if (!time.trim()) return seed.time;
  if (seed.id === "group-f-0700" && time.trim() === "07:00 Uhr") return "19:00 Uhr";
  return time;
}

export interface GroupSeedMigrationResult {
  data: SharedData;
  changed: boolean;
}

export function migrateGroupSeeds(
  data: SharedData,
  now: number = Date.now(),
): GroupSeedMigrationResult {
  if (data.boxGroupSeedVersion >= GROUP_SEED_VERSION) {
    return { data, changed: false };
  }

  const existingGroups = data.boxGroups.map((group) => ({
    ...group,
    participants: [...group.participants],
  }));
  let participants = [...data.boxParticipants];
  const memberships = { ...data.boxGroupMemberships };
  const used = new Set<number>();
  const seeded = [];

  for (const seed of GROUP_SEEDS) {
    const seedName = normalizedGroupName(seed.name);
    let index = existingGroups.findIndex(
      (group, groupIndex) => !used.has(groupIndex) && group.id === seed.id,
    );
    if (index < 0) {
      index = existingGroups.findIndex(
        (group, groupIndex) =>
          !used.has(groupIndex) && normalizedGroupName(group.name) === seedName,
      );
    }

    let group;
    if (index >= 0) {
      used.add(index);
      group = { ...existingGroups[index] };
      if (group.participants.length === 0) {
        const memberIds = memberships[group.id] ?? memberships[seed.id];
        const memberNames = memberIds
          ? membershipNamesForIds(participants, memberIds)
          : seed.participants;
        const names = sanitizeGroupNames(memberNames);
        if (names.length > 0) group.participants = names;
      }
      group.time = seedTime(seed, group.time);
    } else {
      const memberIds = memberships[seed.id];
      const memberNames = memberIds
        ? membershipNamesForIds(participants, memberIds)
        : seed.participants;
      const names = sanitizeGroupNames(memberNames);
      group = {
        id: seed.id,
        name: seed.name,
        time: seed.time,
        participants: names.length > 0 ? names : sanitizeGroupNames(seed.participants),
        createdAt: now,
        updatedAt: now,
      };
    }

    participants = registerParticipantNames(participants, group.participants, now);
    const memberIds = membershipIdsForNames(participants, group.participants);
    if (!stringArraysEqual(memberships[group.id] ?? [], memberIds)) {
      memberships[group.id] = memberIds;
    }
    seeded.push(group);
  }

  const customGroups = existingGroups.filter((_, index) => !used.has(index));
  const nextData = sanitizeSharedData({
    ...data,
    boxGroups: [...seeded, ...customGroups],
    boxParticipants: participants,
    boxGroupMemberships: memberships,
    boxGroupSeedVersion: GROUP_SEED_VERSION,
  });

  return { data: nextData, changed: true };
}
