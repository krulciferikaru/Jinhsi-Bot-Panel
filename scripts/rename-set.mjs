// One-off: rename a Sonata set in saved builds (build name, echo set and "other 2-piece sets").
//
//   node scripts/rename-set.mjs "Sun-sinking Eclipse" "Havoc Eclipse"            shows what would change
//   node scripts/rename-set.mjs "Sun-sinking Eclipse" "Havoc Eclipse" --apply    makes the change
//
// It runs on both the development and the production database (names from .env.development.local and
// .env.production.local). Emoji codes inside the saved text are left alone. Nothing secret is printed.
import fs from 'node:fs';
import path from 'node:path';
import { MongoClient } from 'mongodb';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const read = (f) => (fs.existsSync(path.join(root, f)) ? fs.readFileSync(path.join(root, f), 'utf8') : '');
const get = (text, key) => (text.match(new RegExp(`^${key}=(.*)$`, 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '');

const [from, to] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const apply = process.argv.includes('--apply');
if (!from || !to) throw new Error('Usage: node scripts/rename-set.mjs "<old name>" "<new name>" [--apply]');

const uri = get(read('.env.local'), 'MONGODB_URI');
const dbs = [...new Set([get(read('.env.development.local'), 'MONGODB_DB'), get(read('.env.production.local'), 'MONGODB_DB')].filter(Boolean))];
if (!uri || !dbs.length) throw new Error('MONGODB_URI and the database names must be set in the .env files.');

// "Sun-sinking Eclipse" also matches "Sunsinking Eclipse" and different capitals
const pattern = new RegExp(from.split(/[\s-]+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s-]*'), 'gi');
// emoji codes such as <:SunsinkingEclipse:123> are never touched, only the words around them
const CODE = /(<a?:\w+:\d+>)/;
const swap = (v) => (typeof v === 'string' ? v.split(CODE).map((part) => (CODE.test(part) ? part : part.replace(pattern, to))).join('') : v);

const client = await new MongoClient(uri).connect();
try {
  for (const name of dbs) {
    const col = client.db(name).collection('builds');
    let touched = 0;
    const examples = [];
    for (const b of await col.find({}).toArray()) {
      const patch = {};
      for (const k of ['build_name', 'echo_set']) if (typeof b[k] === 'string' && swap(b[k]) !== b[k]) patch[k] = swap(b[k]);
      if (Array.isArray(b.echo_set_alt) && b.echo_set_alt.some((x) => swap(x) !== x)) patch.echo_set_alt = b.echo_set_alt.map(swap);
      if (!Object.keys(patch).length) continue;
      touched++;
      if (examples.length < 4) examples.push(`${b.resonator_id}: ${JSON.stringify(patch)}`);
      if (apply) await col.updateOne({ _id: b._id }, { $set: patch });
    }
    console.log(`${name}: ${touched} build(s) ${apply ? 'updated' : 'would change'}`);
    for (const e of examples) console.log('  ' + e);
  }
} finally {
  await client.close();
}
