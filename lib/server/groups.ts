import type { SharedData } from "@/lib/shared/schema";
import { assertSharedPayloadSize, sanitizeSharedData } from "@/lib/shared/schema";
import { readSharedState, writeSharedState, type SharedStateResult } from "@/lib/server/shared-storage";
import { GROUP_SEED_VERSION } from "@/lib/group-seed";
import { migrateGroupSeeds } from "@/lib/group-migration";
import { boxGroupLabel } from "@/lib/box-groups";
import { membershipIdsForNames, registerParticipantNames } from "@/lib/participants";
import type { GroupInput } from "@/lib/groups";

export class GroupNotFoundError extends Error {
  constructor() {
    super("group_not_found");
    this.name = "GroupNotFoundError";
  }
}

interface MutationOutcome {
  changed: boolean;
  data?: SharedData;
  groupId?: string;
}

export interface MutationResult {
  state: SharedStateResult;
  data: SharedData;
  groupId?: string;
}

const MAX_MUTATION_ATTEMPTS = 4;

function isConflict(error: unknown): boolean {
  const value = error as { name?: string; message?: string } | null;
  return (
    value?.name === "BlobPreconditionFailedError" ||
    value?.message?.toLowerCase().includes("precondition") === true
  );
}

async function mutateGroups(
  initial: SharedStateResult,
  mutate: (data: SharedData) => MutationOutcome,
  updatedBy: string,
): Promise<MutationResult> {
  for (let attempt = 0; attempt < MAX_MUTATION_ATTEMPTS; attempt += 1) {
    const current = attempt === 0 ? initial : await readSharedState();
    const draft = structuredClone(current.state.data);
    const outcome = mutate(draft);
    if (!outcome.changed) {
      return { state: current, data: current.state.data, groupId: outcome.groupId };
    }

    const nextData = sanitizeSharedData(outcome.data ?? draft);
    const nextState = {
      ...current.state,
      schemaVersion: 1,
      revision: current.state.revision + 1,
      updatedAt: Date.now(),
      updatedBy,
      data: nextData,
    };
    assertSharedPayloadSize(JSON.stringify(nextState));

    try {
      const written = await writeSharedState(nextState, current.etag ?? undefined);
      return {
        state: { state: nextState, etag: written.etag ?? null },
        data: nextData,
        groupId: outcome.groupId,
      };
    } catch (error) {
      if (!isConflict(error) || attempt === MAX_MUTATION_ATTEMPTS - 1) throw error;
    }
  }

  throw new Error("group_mutation_failed");
}

function migrate(draft: SharedData, now: number): SharedData {
  return migrateGroupSeeds(draft, now).data;
}

export async function ensureGroupsMigrated(): Promise<SharedStateResult> {
  const initial = await readSharedState();
  if (initial.state.data.boxGroupSeedVersion >= GROUP_SEED_VERSION) {
    return initial;
  }
  const result = await mutateGroups(
    initial,
    (draft) => ({ changed: true, data: migrate(draft, Date.now()) }),
    "groups-migration",
  );
  return result.state;
}

export async function updateGroup(id: string, input: GroupInput): Promise<MutationResult> {
  const initial = await readSharedState();
  return mutateGroups(
    initial,
    (draft) => {
      const now = Date.now();
      const data = migrate(draft, now);
      const index = data.boxGroups.findIndex((group) => group.id === id);
      if (index < 0) throw new GroupNotFoundError();

      const existing = data.boxGroups[index];
      const participants = registerParticipantNames(
        data.boxParticipants,
        input.participants,
        now,
      );
      const nextGroup = {
        ...existing,
        name: input.name,
        time: input.time,
        participants: [...input.participants],
        updatedAt: now,
      };
      const nextGroups = data.boxGroups.slice();
      nextGroups[index] = nextGroup;

      data.boxGroups = nextGroups;
      data.boxParticipants = participants;
      data.boxGroupMemberships = {
        ...data.boxGroupMemberships,
        [id]: membershipIdsForNames(participants, input.participants),
      };
      data.boxConfigs = data.boxConfigs.map((config) =>
        config.id === id
          ? {
              ...config,
              name: boxGroupLabel(input.name, input.time),
              participants: [...input.participants],
              updatedAt: now,
            }
          : config,
      );
      data.boxGroupSeedVersion = Math.max(data.boxGroupSeedVersion, GROUP_SEED_VERSION);
      return { changed: true, data, groupId: id };
    },
    "groups",
  );
}

export async function deleteGroup(id: string): Promise<MutationResult> {
  const initial = await readSharedState();
  return mutateGroups(
    initial,
    (draft) => {
      const now = Date.now();
      const data = migrate(draft, now);
      const existing = data.boxGroups.find((group) => group.id === id);
      if (!existing) throw new GroupNotFoundError();

      data.boxGroups = data.boxGroups.filter((group) => group.id !== id);
      const memberships = { ...data.boxGroupMemberships };
      delete memberships[id];
      data.boxGroupMemberships = memberships;
      data.boxConfigs = data.boxConfigs.filter((config) => config.id !== id);
      if (id in data.boxGames) {
        const games = { ...data.boxGames };
        delete games[id];
        data.boxGames = games;
      }
      data.boxGroupSeedVersion = Math.max(data.boxGroupSeedVersion, GROUP_SEED_VERSION);
      return { changed: true, data, groupId: id };
    },
    "groups",
  );
}
