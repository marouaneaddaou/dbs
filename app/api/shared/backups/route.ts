import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/server/request-auth";
import { isBlobConfigured, readSharedState } from "@/lib/server/shared-storage";
import { createBackup, ensureDailyBackup, listBackups } from "@/lib/server/backup-storage";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const current = await readSharedState();
    const created = await ensureDailyBackup(current.state);
    const backups = await listBackups(100);
    return NextResponse.json({ backups, created, storage: isBlobConfigured() ? "blob" : "local" });
  } catch {
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const current = await readSharedState();
    const backup = await createBackup(current.state, "manual");
    return NextResponse.json({ ok: true, backup });
  } catch {
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
