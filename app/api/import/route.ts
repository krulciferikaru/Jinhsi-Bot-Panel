import { NextResponse } from 'next/server';
import { getStore } from '@/lib/db';
import { clean, fail, forCreate, parseCollection, validate, withDerived, withErrors } from '@/lib/api';
import { actionFor, diffChanges, record, titleOf } from '@/lib/activity';
import { MAX_IMPORT_ROWS, identity, normalizeRow, requiredErrors, type Ctx } from '@/lib/import';
import { getPath } from '@/lib/schema';
import { withIdempotency } from '@/lib/idempotency';

export const dynamic = 'force-dynamic';

type Status = 'new' | 'update' | 'skip' | 'incomplete' | 'error';
type RowResult = { index: number; status: Status; title: string; message: string };

/**
 * POST { collection, rows: object[], mode: "skip" | "update", dryRun?: boolean, skipInvalid?: boolean }
 * - A row whose identity (name; or resonator + build/skill) already exists is a duplicate: "skip" leaves it alone,
 *   "update" changes only the columns that were provided.
 * - A dry run reports what would happen and writes nothing.
 * - If any row is invalid the import is refused unless skipInvalid is true (then only the valid rows are imported).
 * - One Activity entry covers the whole import and can be undone as a unit.
 */
export const POST = withErrors(withIdempotency(async (req: Request) => {
  const body = await req.json();
  const c = parseCollection(String(body.collection ?? ''));
  if (!c) return fail('Unknown collection.');
  if (!Array.isArray(body.rows) || body.rows.length === 0) return fail('There are no rows to import.');
  if (body.rows.length > MAX_IMPORT_ROWS) return fail(`Import at most ${MAX_IMPORT_ROWS} rows at a time.`);
  if (body.mode !== 'skip' && body.mode !== 'update') return fail('mode must be "skip" or "update".');

  const store = getStore();
  const resonators = await store.list('resonators');
  const ctx: Ctx = {
    resonators: new Set(resonators.map((r) => String(r.name).toLowerCase())),
    resonatorNames: new Map(resonators.map((r) => [String(r.name).trim().toLowerCase().replace(/\s+/g, ' '), String(r.name)])),
  };
  const existing = new Map((await store.list(c)).map((d) => [identity(c, d), d]));

  // Classify every row.
  const results: RowResult[] = [];
  const plan: { index: number; status: Status; values: Record<string, any>; doc?: any }[] = [];
  const seen = new Map<string, number>();
  body.rows.forEach((raw: unknown, index: number) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      results.push({ index, status: 'error', title: `Row ${index + 1}`, message: 'Not a record.' }); return;
    }
    // Required fields only matter for NEW records: a row that updates an existing one may list just a few columns.
    const { values, errors } = normalizeRow(c, raw as Record<string, unknown>, ctx, false);
    const title = String(getPath(values, c === 'builds' || c === 'skills' ? 'resonator_id' : 'name') ?? '') + (c === 'builds' ? ` · ${values.build_name ?? ''}` : c === 'skills' ? ` · ${values.skill_type ?? ''}` : '');
    const key = identity(c, values);
    if (errors.length) { results.push({ index, status: 'error', title: title || `Row ${index + 1}`, message: errors.join(' ') }); return; }
    const doc = existing.get(key);
    // A new row that only lacks required values is "not filled in yet" (typical for a blank template),
    // not an error: it is left out automatically and never blocks the rest.
    if (!doc) {
      const missing = requiredErrors(c, values);
      if (missing.length) { results.push({ index, status: 'incomplete', title: title || `Row ${index + 1}`, message: missing.join(' ') }); return; }
    }
    if (seen.has(key)) { results.push({ index, status: 'error', title, message: `Same as row ${seen.get(key)! + 1} in this file.` }); return; }
    seen.set(key, index);
    if (doc) {
      const status: Status = body.mode === 'update' ? 'update' : 'skip';
      results.push({ index, status, title, message: status === 'update' ? 'Already exists, will be updated.' : 'Already exists, left as it is.' });
      plan.push({ index, status, values, doc });
    } else {
      results.push({ index, status: 'new', title, message: 'Will be added.' });
      plan.push({ index, status: 'new', values });
    }
  });
  results.sort((a, b) => a.index - b.index);
  const count = (s: Status) => results.filter((r) => r.status === s).length;
  const counts = { new: count('new'), update: count('update'), skip: count('skip'), incomplete: count('incomplete'), error: count('error') };

  if (body.dryRun) return NextResponse.json({ results, counts });
  if (counts.error > 0 && !body.skipInvalid) return NextResponse.json({ error: `${counts.error} row${counts.error === 1 ? ' has' : 's have'} problems. Fix them, or import only the valid rows.`, results, counts }, { status: 400 });

  const created: string[] = [];
  const updated: { id: string; before: Record<string, any> }[] = [];
  const failures: { index: number; message: string }[] = [];
  for (const p of plan) {
    try {
      if (p.status === 'new') {
        const data = clean(c, p.values);
        const err = validate(c, data);
        if (err) { failures.push({ index: p.index, message: err }); continue; }
        const doc = await store.create(c, forCreate(c, data));
        created.push(String(doc._id));
      } else if (p.status === 'update') {
        const data = withDerived(c, clean(c, p.values));
        const changes = diffChanges(p.doc, data);
        if (!changes.length) continue;
        const patch = Object.fromEntries(changes.map((ch) => [ch.key, ch.to]));
        const before = Object.fromEntries(changes.map((ch) => [ch.key, ch.from]));
        await store.update(c, String(p.doc._id), patch);
        updated.push({ id: String(p.doc._id), before });
      }
    } catch (e: any) { failures.push({ index: p.index, message: e?.message ?? 'Failed.' }); }
  }

  if (created.length || updated.length) {
    await record({
      action: 'import', collection: c, title: `${created.length + updated.length} record${created.length + updated.length === 1 ? '' : 's'} imported`,
      detail: `${created.length} added, ${updated.length} updated, ${counts.skip} skipped${counts.incomplete ? `, ${counts.incomplete} not filled in` : ''}${counts.error ? `, ${counts.error} invalid rows left out` : ''}`,
      snapshot: { created, updated }, undoable: true,
    });
  }
  return NextResponse.json({ created: created.length, updated: updated.length, skipped: counts.skip, incomplete: counts.incomplete, invalid: counts.error, failures });
}));
