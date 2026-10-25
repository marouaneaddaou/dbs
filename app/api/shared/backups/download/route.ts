import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/server/request-auth";
import { readBackup } from "@/lib/server/backup-storage";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const pathname = req.nextUrl.searchParams.get("pathname") ?? "";
  const state = await readBackup(pathname);
  if (!state) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const filename = pathname.slice(pathname.lastIndexOf("/") + 1) || "dbs-backup.json";
  return new NextResponse(JSON.stringify(state, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
