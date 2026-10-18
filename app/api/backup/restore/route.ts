import { NextResponse } from 'next/server';
import { getStore } from '@/lib/db';
import { fail, withErrors } from '@/lib/api';
import { BackupError, planRestore } from '@/lib/backup';
import { record } from '@/lib/activity';
import { COLLECTION_KEYS } from '@/lib/schema';

export const dynamic = 'force-dynamic';

/**
 * POST { file, mode: "missing" | "overwrite", dryRun?: boolean }
 * "missing" only adds records that are not in the database. "overwrite" also replaces records whose content differs.
 * Nothing is ever deleted. A dry run reports what would happen and writes nothing.
 */
export const POST = withErrors(async (req: Request) => {
  const { file, mode, dryRun } = await req.json();
  if (mode !== 'missing' && mode !== 'overwrite') return fail('mode must be "missing" or "overwrite".');

  let plan;
  try { plan = await planRestore(file); }
  catch (e) { if (e instanceof BackupError) return fail(e.message); throw e; }

  if (dryRun) return NextResponse.json({ summary: plan.summary, samples: plan.samples });

  const store = getStore();
  let added = 0, replaced = 0;
  for (const c of COLLECTION_KEYS) {
    if (!plan.add[c]) continue;
    const r = await store.importDocs(c, { add: plan.add[c], replace: mode === 'overwrite' ? plan.replace[c] : [] });
    added += r.added; replaced += r.replaced;
  }
  await record({
    action: 'backup-restore', collection: 'backup', title: 'Restored from backup file', undoable: false,
    detail: `${added} added${mode === 'overwrite' ? `, ${replaced} overwritten` : ' (existing records kept)'}`,
  });
  return NextResponse.json({ added, replaced });
});
