import { NextResponse } from 'next/server';
import { fail, withErrors } from '@/lib/api';
import { UndoConflict, undoEntry } from '@/lib/activity';

export const dynamic = 'force-dynamic';

/** POST { force?: boolean }. A 409 means a later edit touched the same fields. */
export const POST = withErrors(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { force } = await req.json().catch(() => ({}));
  try {
    return NextResponse.json({ ok: true, ...(await undoEntry(id, Boolean(force))) });
  } catch (e: any) {
    if (e instanceof UndoConflict) return NextResponse.json({ error: e.message, conflict: e.keys }, { status: 409 });
    return fail(e?.message ?? 'Could not undo.', 400);
  }
});
