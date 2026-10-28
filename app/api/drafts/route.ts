import { NextResponse } from 'next/server';
import { getStore, type Draft } from '@/lib/db';
import { fail, withErrors } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** GET: every saved setup draft, newest first. */
export const GET = withErrors(async () => NextResponse.json(await getStore().draftList()));

/** POST { _id?, title, resonatorId?, step }: create a draft, or update one by _id. */
export const POST = withErrors(async (req: Request) => {
  const b = await req.json();
  if (typeof b.title !== 'string' || typeof b.step !== 'number') return fail('A draft needs a title and a step.');
  const draft: Draft = {
    _id: b._id ? String(b._id) : undefined,
    kind: 'resonator-setup',
    title: b.title,
    resonatorId: b.resonatorId ? String(b.resonatorId) : undefined,
    step: b.step,
    updatedAt: new Date(),
  };
  return NextResponse.json(await getStore().draftSave(draft));
});
