import { NextRequest, NextResponse } from 'next/server';
import { createAdminSessionToken, getAdminCookieName, getAdminCookieMaxAge, getAdminPassword } from '@/lib/server/admin-auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const password = typeof body?.password === 'string' ? body.password : '';

    if (password !== getAdminPassword()) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const token = createAdminSessionToken();
    const res = NextResponse.json({ ok: true });
    const isProd = process.env.NODE_ENV === 'production';
    res.cookies.set(getAdminCookieName(), token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: getAdminCookieMaxAge(),
    });
    return res;
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
