import { getStore } from './db';
import { COLLECTION_KEYS, COLLECTIONS, getPath, type CollectionKey } from './schema';

export const BACKUP_VERSION = 1;
export type BackupFile = {
  app: 'jinhsi-bot';
  version: number;
  exportedAt: string;
  database: string;
  collections: Record<CollectionKey, Record<string, any>[]>;
};

/** Everything the dashboard manages, as plain JSON (ObjectIds become hex strings, Dates become ISO strings). */
export async function buildBackup(): Promise<BackupFile> {
  const store = getStore();
  const collections = {} as BackupFile['collections'];
  for (const c of COLLECTION_KEYS) collections[c] = JSON.parse(JSON.stringify(await store.list(c)));
  return {
    app: 'jinhsi-bot', version: BACKUP_VERSION, exportedAt: new Date().toISOString(),
    database: process.env.MONGODB_DB || 'wuthering_waves', collections,
  };
}

const ISO_UTC = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
/** Dates were stored as BSON dates when they serialise to a UTC ISO string; other strings stay as they were. */
function revive(doc: Record<string, any>) {
  const out = { ...doc };
  for (const k of ['created_at', 'updated_at']) if (typeof out[k] === 'string' && ISO_UTC.test(out[k])) out[k] = new Date(out[k]);
  return out;
}

/** Stable text for comparing a stored record with its backed-up copy (ignores updated_at). */
function fingerprint(d: Record<string, any>) {
  const { updated_at, ...rest } = JSON.parse(JSON.stringify(d));
  const sort = (v: any): any => (Array.isArray(v) ? v.map(sort) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])])) : v);
  return JSON.stringify(sort(rest));
}

export type Plan = {
  summary: { collection: CollectionKey; inFile: number; add: number; changed: number; same: number }[];
  add: Record<CollectionKey, Record<string, any>[]>;
  replace: Record<CollectionKey, Record<string, any>[]>;
  /** a few names per collection so the preview is concrete */
  samples: Record<string, { add: string[]; changed: string[] }>;
};

export class BackupError extends Error {}

/** Check the uploaded file and work out what a restore would do. Writes nothing. */
export async function planRestore(raw: unknown): Promise<Plan> {
  const f = raw as Partial<BackupFile>;
  if (!f || f.app !== 'jinhsi-bot' || typeof f.collections !== 'object' || f.collections === null) {
    throw new BackupError('This is not a Jinhsi Bot backup file.');
  }
  if (f.version !== BACKUP_VERSION) throw new BackupError(`Unsupported backup version ${String(f.version)}.`);

  const store = getStore();
  const plan: Plan = { summary: [], add: {} as Plan['add'], replace: {} as Plan['replace'], samples: {} };
  let total = 0;
  for (const c of COLLECTION_KEYS) {
    const incoming = f.collections[c];
    if (incoming === undefined) continue;
    if (!Array.isArray(incoming)) throw new BackupError(`"${c}" in the file is not a list.`);
    total += incoming.length;
    if (total > 20000) throw new BackupError('The file has too many records.');

    const titleKey = COLLECTIONS[c].titleKey;
    const existing = new Map((await store.list(c)).map((d) => [String(d._id), d]));
    const add: Record<string, any>[] = [], replace: Record<string, any>[] = [];
    const sample = { add: [] as string[], changed: [] as string[] };
    let same = 0;
    const seen = new Set<string>();
    for (const d of incoming) {
      if (!d || typeof d !== 'object' || typeof d._id !== 'string' || !d._id) throw new BackupError(`A record in "${c}" has no id.`);
      if (seen.has(d._id)) throw new BackupError(`"${c}" contains the id ${d._id} twice.`);
      seen.add(d._id);
      if (String(getPath(d, titleKey) ?? '').trim() === '') throw new BackupError(`A record in "${c}" has no ${titleKey}.`);
      const label = String(getPath(d, titleKey));
      const cur = existing.get(d._id);
      if (!cur) { add.push(revive(d)); if (sample.add.length < 5) sample.add.push(label); }
      else if (fingerprint(cur) !== fingerprint(d)) { replace.push(revive(d)); if (sample.changed.length < 5) sample.changed.push(label); }
      else same++;
    }
    plan.add[c] = add; plan.replace[c] = replace; plan.samples[c] = sample;
    plan.summary.push({ collection: c, inFile: incoming.length, add: add.length, changed: replace.length, same });
  }
  if (plan.summary.length === 0) throw new BackupError('The file has none of the expected collections.');
  return plan;
}
