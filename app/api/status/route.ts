import { NextResponse } from 'next/server';
import { getStore } from '@/lib/db';
import { COLLECTION_KEYS } from '@/lib/schema';
import { withErrors } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const GET = withErrors(async () => {
  const store = getStore();
  const counts: Record<string, { active: number; archived: number }> = {};
  for (const c of COLLECTION_KEYS) {
    const rows = await store.list(c);
    counts[c] = { active: rows.filter((r) => !r.archived).length, archived: rows.filter((r) => r.archived).length };
  }
  return NextResponse.json({ db: store.kind, counts });
});
