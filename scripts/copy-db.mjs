// Copies the production database into the development database, so `npm run dev` has real data to work on
// without touching the data the Live bot reads.
//
//   npm run db:copy-dev               copies into an empty development database
//   npm run db:copy-dev -- --replace  empties the development database first
//
// Names come from MONGODB_DB in .env.production.local (source) and .env.development.local (target);
// the connection string comes from MONGODB_URI. Nothing secret is printed.
import fs from 'node:fs';
import path from 'node:path';
import { MongoClient } from 'mongodb';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const read = (f) => (fs.existsSync(path.join(root, f)) ? fs.readFileSync(path.join(root, f), 'utf8') : '');
const get = (text, key) => (text.match(new RegExp(`^${key}=(.*)$`, 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '');

const base = read('.env.local');
const uri = get(base, 'MONGODB_URI') ?? process.env.MONGODB_URI;
const from = get(read('.env.production.local'), 'MONGODB_DB') ?? get(base, 'MONGODB_DB');
const to = get(read('.env.development.local'), 'MONGODB_DB');
const replace = process.argv.includes('--replace');

if (!uri) throw new Error('MONGODB_URI is not set in .env.local.');
if (!from || !to) throw new Error('Set MONGODB_DB in both .env.production.local (source) and .env.development.local (target).');
if (from === to) throw new Error(`Both environments use the database "${from}". Give .env.development.local its own MONGODB_DB first.`);

const client = await new MongoClient(uri).connect();
try {
  const src = client.db(from);
  const dst = client.db(to);
  const existing = await dst.listCollections().toArray();
  const occupied = (await Promise.all(existing.map((c) => dst.collection(c.name).estimatedDocumentCount()))).some((n) => n > 0);
  if (occupied && !replace) {
    console.log(`The development database "${to}" already has data. Run again with --replace to empty it and copy again.`);
    process.exit(1);
  }
  if (occupied) await dst.dropDatabase();

  let total = 0;
  for (const { name, type } of await src.listCollections().toArray()) {
    if (type === 'view' || name.startsWith('system.')) continue;
    const docs = await src.collection(name).find({}).toArray();
    if (docs.length) await dst.collection(name).insertMany(docs, { ordered: false });
    const indexes = (await src.collection(name).indexes()).filter((i) => i.name !== '_id_');
    for (const { key, name: iname, v, ns, ...opts } of indexes) await dst.collection(name).createIndex(key, { name: iname, ...opts });
    console.log(`  ${name}: ${docs.length}`);
    total += docs.length;
  }
  console.log(`Copied ${total} documents from "${from}" to "${to}".`);
} finally {
  await client.close();
}
