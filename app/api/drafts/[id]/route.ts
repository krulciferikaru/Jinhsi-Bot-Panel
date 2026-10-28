import { NextResponse } from 'next/server';
import { getStore } from '@/lib/db';
import { fail, withErrors } from '@/lib/api';

export const dynamic = 'force-dynamic';
type P = { params: Promise<{ id: string }> };

/** GET one draft (to resume it). */
export const GET = withErrors(async (_req: Request, { params }: P) => {
  const d = await getStore().draftGet((await params).id);
  return d ? NextResponse.json(d) : fail('Draft not found.', 404);
});

/** DELETE one draft (finished or abandoned). */
export const DELETE = withErrors(async (_req: Request, { params }: P) => {
  const ok = await getStore().draftDelete((await params).id);
  return ok ? NextResponse.json({ ok: true }) : fail('Draft not found.', 404);
});
