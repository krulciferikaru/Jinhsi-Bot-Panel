import { getStore, type Activity, type ActivityAction } from './db';
import { COLLECTIONS, getPath, isCollection, type CollectionKey } from './schema';

/** Readable label for a record, e.g. "Jinhsi · Molten Rift" or "Aero Predator". */
export function titleOf(c: CollectionKey, d: Record<string, any>): string {
  const cfg = COLLECTIONS[c];
  const main = String(getPath(d, cfg.titleKey) ?? '').trim() || 'Untitled';
  const sub = cfg.subtitleKey ? String(getPath(d, cfg.subtitleKey) ?? '').trim() : '';
  return sub ? `${sub} · ${main}` : main;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Fields of `data` whose value differs from the previous record. */
export function diffChanges(before: Record<string, any> | null, data: Record<string, any>) {
  return Object.entries(data)
    .map(([key, to]) => ({ key, from: before ? (getPath(before, key) ?? null) : null, to: to ?? null }))
    .filter((c) => !same(c.from, c.to));
}

/** Never let logging break the action that was just performed. */
export async function record(entry: Omit<Activity, 'at'>) {
  try { await getStore().logAdd({ ...entry, at: new Date() }); }
  catch (e) { console.error('activity log failed:', e); }
}

export const actionFor = (changes: { key: string; to: unknown }[]): ActivityAction => {
  if (changes.length === 1 && changes[0].key === 'archived') return changes[0].to ? 'archive' : 'restore';
  return 'update';
};

export class UndoConflict extends Error {
  constructor(public keys: string[]) { super(`These fields changed since: ${keys.join(', ')}.`); }
}

/** Reverse one logged action. Throws UndoConflict when a later edit touched the same fields (unless forced). */
export async function undoEntry(id: string, force = false) {
  const store = getStore();
  const e = await store.logGet(id);
  if (!e) throw new Error('That activity entry no longer exists.');
  if (e.undone) throw new Error('This change was already undone.');
  if (!e.undoable || !isCollection(e.collection)) throw new Error('This kind of change cannot be undone from here.');
  const c = e.collection as CollectionKey;
  const docId = String(e.docId ?? '');

  if (e.action === 'create') {
    if (!(await store.remove(c, docId))) throw new Error('The record is already gone.');
  } else if (e.action === 'import') {
    // Remove what the import created and put updated records back, as one unit.
    const snap = (e.snapshot ?? {}) as { created?: string[]; updated?: { id: string; before: Record<string, any> }[] };
    for (const id of snap.created ?? []) await store.remove(c, id);
    for (const u of snap.updated ?? []) await store.update(c, u.id, u.before);
  } else if (e.action === 'delete') {
    if (await store.get(c, docId)) throw new Error('A record with this id already exists.');
    if (!e.snapshot) throw new Error('No copy of the deleted record was saved.');
    await store.restore(c, e.snapshot);
  } else {
    const current = await store.get(c, docId);
    if (!current) throw new Error('The record no longer exists, so the change cannot be undone.');
    const changes = e.changes ?? [];
    const moved = changes.filter((ch) => !same(getPath(current, ch.key), ch.to)).map((ch) => ch.key);
    if (moved.length && !force) throw new UndoConflict(moved);
    const back: Record<string, any> = {};
    changes.forEach((ch) => { back[ch.key] = ch.from ?? null; });
    await store.update(c, docId, back);
  }
  await store.logMark(id, { undone: true, undoneAt: new Date() });
  return { collection: c, docId };
}

