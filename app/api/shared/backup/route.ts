import { NextRequest, NextResponse } from 'next/server';
import { getAdminCookieName, verifyAdminSessionToken } from '@/lib/server/admin-auth';
import { readSharedState } from '@/lib/server/shared-storage';

export const dynamic = 'force-dynamic';

function requireAdmin(req: NextRequest): boolean {
  const token = req.cookies.get(getAdminCookieName())?.value;
  if (!token) return false;
  return verifyAdminSessionToken(token);
}

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const result = await readSharedState();
    const payload = {
      app: 'dbs-zentrum-shared',
      version: 1,
      exportedAt: Date.now(),
      state: result.state,
    };
    const json = JSON.stringify(payload, null, 2);
    const filename = 'dbs-shared-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    return new NextResponse(json, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="' + filename + '"',
      },
    });
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
