import { readSharedState, writeSharedState } from "@/lib/server/shared-storage";
import { ensureDailyBackup, type BackupInfo } from "@/lib/server/backup-storage";
import { assertSharedPayloadSize } from "@/lib/shared/schema";
import { pruneExpiredDrafts, type RemovedDrafts } from "@/lib/shared/retention";

export interface MaintenanceResult {
  backup: BackupInfo | null;
  removed: RemovedDrafts;
  changed: boolean;
  revision: number;
}

export async function runMaintenance(): Promise<MaintenanceResult> {
  const initial = await readSharedState();
  const backup = await ensureDailyBackup(initial.state);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = attempt === 0 ? initial : await readSharedState();
    const pruned = pruneExpiredDrafts(current.state.data);
    if (!pruned.changed) {
      return { backup, removed: pruned.removed, changed: false, revision: current.state.revision };
    }

    const nextState = {
      ...current.state,
      schemaVersion: 1,
      revision: current.state.revision + 1,
      updatedAt: Date.now(),
      updatedBy: "retention",
      data: pruned.data,
    };
    assertSharedPayloadSize(JSON.stringify(nextState));

    try {
      await writeSharedState(nextState, current.etag ?? undefined);
      return { backup, removed: pruned.removed, changed: true, revision: nextState.revision };
    } catch (error: any) {
      const conflict =
        error?.name === "BlobPreconditionFailedError" || error?.message?.includes("precondition");
      if (!conflict || attempt === 2) throw error;
    }
  }

  throw new Error("retention_failed");
}
