import { NextRequest, NextResponse } from 'next/server';
import { getAdminCookieName, verifyAdminSessionToken } from '@/lib/server/admin-auth';
import { readSharedState, writeSharedState } from '@/lib/server/shared-storage';
import { createEmptySharedState, assertSharedPayloadSize, sanitizeSharedData } from '@/lib/shared/schema';
import { BlobPreconditionFailedError } from '@vercel/blob';

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
    return NextResponse.json({
      state: result.state,
      etag: result.etag ?? null,
    });
  } catch {
    return NextResponse.json({ state: createEmptySharedState(), etag: null });
  }
}

export async function PUT(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const incomingData = sanitizeSharedData(body?.data);
    const baseRevision = typeof body?.baseRevision === 'number' ? body.baseRevision : null;
    const ifMatch = typeof body?.ifMatch === 'string' && body.ifMatch.length > 0 ? body.ifMatch : undefined;

    const current = await readSharedState();
    if (baseRevision !== null && baseRevision !== current.state.revision) {
      return NextResponse.json(
        { error: 'conflict', current: current.state, etag: current.etag ?? null },
        { status: 409 },
      );
    }

    const nextState = {
      schemaVersion: 1,
      revision: current.state.revision + 1,
      updatedAt: Date.now(),
      updatedBy: 'admin',
      data: incomingData,
    };

    const json = JSON.stringify(nextState);
    assertSharedPayloadSize(json);

    try {
      const writeResult = await writeSharedState(nextState, ifMatch ?? current.etag ?? undefined);
      return NextResponse.json({ ok: true, state: nextState, etag: writeResult.etag ?? null });
    } catch (err: any) {
      if (err?.name === 'BlobPreconditionFailedError' || err instanceof BlobPreconditionFailedError) {
        const latest = await readSharedState();
        return NextResponse.json(
          { error: 'conflict', current: latest.state, etag: latest.etag ?? null },
          { status: 409 },
        );
      }
      throw err;
    }
  } catch (e: any) {
    if (e?.message?.includes('payload too large')) {
      return NextResponse.json({ error: e.message }, { status: 413 });
    }
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
