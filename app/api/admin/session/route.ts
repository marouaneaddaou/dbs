import { NextRequest, NextResponse } from 'next/server';
import { getAdminCookieName, verifyAdminSessionToken } from '@/lib/server/admin-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(getAdminCookieName())?.value;
  if (!token || !verifyAdminSessionToken(token)) {
    return NextResponse.json({ authed: false }, { status: 200 });
  }
  return NextResponse.json({ authed: true });
}
