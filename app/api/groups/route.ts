import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/server/request-auth";
import { createGroup, ensureGroupsMigrated } from "@/lib/server/groups";
import { sanitizeGroupInput } from "@/lib/groups";

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

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return groupError("unauthorized", 401);
  const body = await req.json().catch(() => null);
  const parsed = sanitizeGroupInput(body);
  if (!parsed.ok) return groupError(parsed.error, 400);

  try {
    const result = await createGroup(parsed.value);
    const group = result.data.boxGroups.find((entry) => entry.id === result.groupId);
    if (!group) return groupError("groups_save_failed", 500);
    return NextResponse.json(
      {
        group,
        groups: result.data.boxGroups,
        revision: result.state.state.revision,
        updatedAt: result.state.state.updatedAt,
      },
      { status: 201, headers: NO_STORE },
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("payload too large")) {
      return groupError("payload_too_large", 413);
    }
    return groupError("groups_save_failed", 500);
  }
}
