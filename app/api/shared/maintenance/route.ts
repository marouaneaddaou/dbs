import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/server/request-auth";
import { runMaintenance } from "@/lib/server/maintenance";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runMaintenance();
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ error: "maintenance_failed" }, { status: 500 });
  }
}
