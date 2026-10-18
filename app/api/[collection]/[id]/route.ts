import { NextResponse } from 'next/server';
import { getStore } from '@/lib/db';
import { clean, fail, parseCollection, validate, withDerived, withErrors } from '@/lib/api';
import { actionFor, diffChanges, record, titleOf } from '@/lib/activity';

export const dynamic = 'force-dynamic';
type P = { params: Promise<{ collection: string; id: string }> };

export const GET = withErrors(async (_req: Request, { params }: P) => {
  const { collection, id } = await params;
  const c = parseCollection(collection);
  if (!c) return fail('Unknown collection', 404);
  const doc = await getStore().get(c, id);
  return doc ? NextResponse.json(doc) : fail('Not found', 404);
});

export const PATCH = withErrors(async (req: Request, { params }: P) => {
  const { collection, id } = await params;
  const c = parseCollection(collection);
  if (!c) return fail('Unknown collection', 404);
  const data = withDerived(c, clean(c, await req.json()));
  const err = validate(c, data, true);
  if (err) return fail(err);
  const store = getStore();
  const before = await store.get(c, id);
  const doc = await store.update(c, id, data);
  if (!doc) return fail('Not found', 404);
  const changes = diffChanges(before, data);
  if (changes.length) {
    await record({ action: actionFor(changes), collection: c, docId: id, title: titleOf(c, doc), changes, undoable: true });
  }
  return NextResponse.json(doc);
});

export const DELETE = withErrors(async (_req: Request, { params }: P) => {
  const { collection, id } = await params;
  const c = parseCollection(collection);
  if (!c) return fail('Unknown collection', 404);
  const store = getStore();
  const before = await store.get(c, id);
  if (!before || !(await store.remove(c, id))) return fail('Not found', 404);
  await record({ action: 'delete', collection: c, docId: id, title: titleOf(c, before), snapshot: before, undoable: true });
  return NextResponse.json({ ok: true });
});
