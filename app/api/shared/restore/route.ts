import { NextRequest, NextResponse } from "next/server";
import { BlobPreconditionFailedError } from "@vercel/blob";
import { isAdminRequest } from "@/lib/server/request-auth";
import { readSharedState, writeSharedState } from "@/lib/server/shared-storage";
import { createBackup, readBackup } from "@/lib/server/backup-storage";
import { assertSharedPayloadSize, sanitizeSharedData } from "@/lib/shared/schema";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const pathname = typeof body?.pathname === "string" ? body.pathname : "";
    const backup = await readBackup(pathname);
    if (!backup) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const current = await readSharedState();
    await createBackup(current.state, "before-restore");

    const nextState = {
      ...backup,
      schemaVersion: 1,
      revision: current.state.revision + 1,
      updatedAt: Date.now(),
      updatedBy: "restore",
      data: sanitizeSharedData(backup.data),
    };
    assertSharedPayloadSize(JSON.stringify(nextState));

    try {
      const result = await writeSharedState(nextState, current.etag ?? undefined);
      return NextResponse.json({ ok: true, state: nextState, etag: result.etag ?? null });
    } catch (error: any) {
      if (error?.name === "BlobPreconditionFailedError" || error instanceof BlobPreconditionFailedError) {
        return NextResponse.json({ error: "conflict" }, { status: 409 });
      }
      throw error;
    }
  } catch {
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
