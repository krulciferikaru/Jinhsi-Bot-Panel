import { NextResponse } from 'next/server';
import { getStore } from '@/lib/db';
import { withErrors } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** GET /api/activity?page=1&collection=echoes&action=update&q=aero */
export const GET = withErrors(async (req: Request) => {
  const sp = new URL(req.url).searchParams;
  const limit = Math.min(Math.max(Number(sp.get('limit')) || 20, 1), 100);
  const page = Math.max(Number(sp.get('page')) || 1, 1);
  const { items, total } = await getStore().logList({
    limit, skip: (page - 1) * limit,
    collection: sp.get('collection') || undefined,
    action: sp.get('action') || undefined,
    q: sp.get('q')?.trim() || undefined,
  });
  return NextResponse.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
});
