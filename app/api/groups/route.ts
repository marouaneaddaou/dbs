import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/server/request-auth";
import { ensureGroupsMigrated } from "@/lib/server/groups";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function groupError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return groupError("unauthorized", 401);
  try {
    const result = await ensureGroupsMigrated();
    return NextResponse.json(
      {
        groups: result.state.data.boxGroups,
        revision: result.state.revision,
        updatedAt: result.state.updatedAt,
      },
      { headers: NO_STORE },
    );
  } catch {
    return groupError("groups_load_failed", 500);
  }
}
