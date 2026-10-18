import { MongoClient, ObjectId, type Collection } from 'mongodb';
import { COLLECTIONS, type CollectionKey, type Doc } from './schema';

export type ActivityAction =
  | 'create' | 'update' | 'archive' | 'restore' | 'delete'
  | 'asset-upload' | 'asset-replace' | 'asset-rename' | 'asset-delete'
  | 'backup-restore' | 'asset-bulk' | 'emoji-upload' | 'emoji-rename' | 'emoji-delete' | 'import';

export type Activity = {
  _id?: string;
  at: Date | string;
  action: ActivityAction;
  /** a record collection key, or "assets" */
  collection: string;
  docId?: string;
  title: string;
  /** update/archive/restore: the fields that changed (dot-path keys) */
  changes?: { key: string; from: unknown; to: unknown }[];
  /** create: the new record. delete: the removed record (used to restore it). */
  snapshot?: Record<string, any>;
  detail?: string;
  undoable: boolean;
  undone?: boolean;
  undoneAt?: Date | string;
};

export type ActivityQuery = { limit: number; skip: number; collection?: string; action?: string; q?: string };

export interface Store {
  readonly kind: 'mongodb';
  list(c: CollectionKey): Promise<Doc[]>;
  get(c: CollectionKey, id: string): Promise<Doc | null>;
  create(c: CollectionKey, data: Record<string, any>): Promise<Doc>;
  /** `data` may use dot paths (e.g. "base_attack.stats"), which update just that nested field. */
  update(c: CollectionKey, id: string, data: Record<string, any>): Promise<Doc | null>;
  remove(c: CollectionKey, id: string): Promise<boolean>;
  /** Put a previously deleted record back under its original id. */
  restore(c: CollectionKey, doc: Record<string, any>): Promise<void>;

  /** Bulk write for backup restore: insert `add` as new, replace `replace` by id. Never deletes. */
  importDocs(c: CollectionKey, docs: { add: Record<string, any>[]; replace: Record<string, any>[] }): Promise<{ added: number; replaced: number }>;

  logAdd(entry: Activity): Promise<void>;
  logList(q: ActivityQuery): Promise<{ items: Activity[]; total: number }>;
  logGet(id: string): Promise<Activity | null>;
  logMark(id: string, patch: Partial<Activity>): Promise<void>;
}

// Existing documents use ObjectId ids; accept the hex string form from the UI.
const toId = (id: string): any => (/^[0-9a-f]{24}$/i.test(id) ? new ObjectId(id) : id);

const byTitle = (c: CollectionKey) => (a: Doc, b: Doc) => {
  const { titleKey, subtitleKey } = COLLECTIONS[c];
  const sub = subtitleKey ? String(a[subtitleKey] ?? '').localeCompare(String(b[subtitleKey] ?? '')) : 0;
  return sub || String(a[titleKey] ?? '').localeCompare(String(b[titleKey] ?? ''));
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

class MongoStore implements Store {
  readonly kind = 'mongodb' as const;
  private clientP: Promise<MongoClient>;
  constructor(uri: string, private dbName: string) {
    this.clientP = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 }).connect();
  }
  private async col(c: string): Promise<Collection<any>> {
    return (await this.clientP).db(this.dbName).collection(c);
  }
  async list(c: CollectionKey) {
    return ((await (await this.col(c)).find().toArray()) as Doc[]).sort(byTitle(c));
  }
  async get(c: CollectionKey, id: string) {
    return (await (await this.col(c)).findOne({ _id: toId(id) })) as Doc | null;
  }
  async create(c: CollectionKey, data: Record<string, any>) {
    const now = new Date();
    const doc = { ...data, created_at: now, updated_at: now };
    const r = await (await this.col(c)).insertOne(doc);
    return { ...doc, _id: String(r.insertedId) } as Doc;
  }
  async update(c: CollectionKey, id: string, data: Record<string, any>) {
    const { _id, ...rest } = data;
    return (await (await this.col(c)).findOneAndUpdate(
      { _id: toId(id) }, { $set: { ...rest, updated_at: new Date() } }, { returnDocument: 'after' },
    )) as Doc | null;
  }
  async remove(c: CollectionKey, id: string) {
    return ((await (await this.col(c)).deleteOne({ _id: toId(id) })).deletedCount ?? 0) > 0;
  }
  async restore(c: CollectionKey, doc: Record<string, any>) {
    const { _id, ...rest } = doc;
    await (await this.col(c)).insertOne({ ...rest, _id: typeof _id === 'string' ? toId(_id) : _id });
  }

  async importDocs(c: CollectionKey, { add, replace }: { add: Record<string, any>[]; replace: Record<string, any>[] }) {
    const col = await this.col(c);
    const withId = (d: Record<string, any>) => ({ ...d, _id: typeof d._id === 'string' ? toId(d._id) : d._id });
    if (add.length) await col.insertMany(add.map(withId));
    if (replace.length) {
      await col.bulkWrite(replace.map((d) => ({ replaceOne: { filter: { _id: toId(String(d._id)) }, replacement: (({ _id, ...rest }) => rest)(d), upsert: false } })));
    }
    return { added: add.length, replaced: replace.length };
  }

  async logAdd(entry: Activity) {
    await (await this.col('activity_log')).insertOne({ ...entry, at: new Date(entry.at) });
  }
  async logList({ limit, skip, collection, action, q }: ActivityQuery) {
    const filter: Record<string, any> = {};
    if (collection) filter.collection = collection;
    if (action) filter.action = action;
    if (q) filter.title = { $regex: escapeRe(q), $options: 'i' };
    const col = await this.col('activity_log');
    const [items, total] = await Promise.all([
      col.find(filter).sort({ at: -1 }).skip(skip).limit(limit).toArray(),
      col.countDocuments(filter),
    ]);
    return { items: items as Activity[], total };
  }
  async logGet(id: string) {
    return (await (await this.col('activity_log')).findOne({ _id: toId(id) })) as Activity | null;
  }
  async logMark(id: string, patch: Partial<Activity>) {
    await (await this.col('activity_log')).updateOne({ _id: toId(id) }, { $set: patch });
  }
}

const g = globalThis as unknown as { __store?: Store };
export function getStore(): Store {
  if (!g.__store) {
    const uri = process.env.MONGODB_URI?.trim();
    if (!uri) throw new Error('MONGODB_URI is not set. Add it to .env.local and restart the app.');
    g.__store = new MongoStore(uri, process.env.MONGODB_DB || 'wuthering_waves');
  }
  return g.__store;
}
