import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/server/request-auth";
import {
  deleteGroup,
  GroupNotFoundError,
  updateGroup,
  type MutationResult,
} from "@/lib/server/groups";
import { sanitizeGroupInput } from "@/lib/groups";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function groupError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

function groupResponse(result: MutationResult, id: string, status = 200) {
  const group = result.data.boxGroups.find((entry) => entry.id === id);
  return NextResponse.json(
    {
      group,
      groups: result.data.boxGroups,
      revision: result.state.state.revision,
      updatedAt: result.state.state.updatedAt,
    },
    { status, headers: NO_STORE },
  );
}

function mutationError(error: unknown) {
  if (error instanceof GroupNotFoundError) return groupError("group_not_found", 404);
  if (error instanceof Error && error.message.includes("payload too large")) {
    return groupError("payload_too_large", 413);
  }
  return groupError("groups_save_failed", 500);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAdminRequest(req)) return groupError("unauthorized", 401);
  const { id } = await params;
  if (!id) return groupError("group_not_found", 404);

  const body = await req.json().catch(() => null);
  const parsed = sanitizeGroupInput(body);
  if (!parsed.ok) return groupError(parsed.error, 400);

  try {
    const result = await updateGroup(id, parsed.value);
    return groupResponse(result, id);
  } catch (error) {
    return mutationError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAdminRequest(req)) return groupError("unauthorized", 401);
  const { id } = await params;
  if (!id) return groupError("group_not_found", 404);

  try {
    const result = await deleteGroup(id);
    return NextResponse.json(
      {
        ok: true,
        groups: result.data.boxGroups,
        revision: result.state.state.revision,
        updatedAt: result.state.state.updatedAt,
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    return mutationError(error);
  }
}
