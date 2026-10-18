import { NextResponse } from 'next/server';
import { getStore } from '@/lib/db';
import { clean, fail, forCreate, parseCollection, validate, withErrors } from '@/lib/api';
import { record, titleOf } from '@/lib/activity';

export const dynamic = 'force-dynamic';
type P = { params: Promise<{ collection: string }> };

export const GET = withErrors(async (_req: Request, { params }: P) => {
  const c = parseCollection((await params).collection);
  if (!c) return fail('Unknown collection', 404);
  return NextResponse.json(await getStore().list(c));
});

export const POST = withErrors(async (req: Request, { params }: P) => {
  const c = parseCollection((await params).collection);
  if (!c) return fail('Unknown collection', 404);
  const data = clean(c, await req.json());
  const err = validate(c, data);
  if (err) return fail(err);
  const doc = await getStore().create(c, forCreate(c, data));
  await record({ action: 'create', collection: c, docId: String(doc._id), title: titleOf(c, doc), snapshot: doc, undoable: true });
  return NextResponse.json(doc, { status: 201 });
});
