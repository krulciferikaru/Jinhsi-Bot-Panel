import { NextResponse } from 'next/server';
import { withErrors } from '@/lib/api';
import { getStore } from '@/lib/db';
import { hasToken, keyOfUrl, listAssets } from '@/lib/github';
import { FOLDER_COLLECTION } from '@/lib/link-records';

export const dynamic = 'force-dynamic';

const key = (s: unknown) => String(s ?? '').replace(/&/g, ' and ').replace(/memphis/gi, 'mephis').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Records with no icon, paired with an unused image of the same name (letters and numbers only, so "Nightmare: Crownless" matches Nightmare_Crownless.png). */
async function plan() {
  const store = getStore();
  const assets = await listAssets();
  const pairs: { collection: string; id: string; name: string; asset: string; url: string }[] = [];
  const ambiguous: string[] = [];
  for (const [folder, collection] of Object.entries(FOLDER_COLLECTION)) {
    const docs = (await store.list(collection)).filter((d) => !d.archived);
    const inUse = new Set(docs.map((d) => keyOfUrl(d.icon_url)).filter(Boolean));
    const free = assets.filter((a) => a.folder === folder && !inUse.has(`${a.folder}/${a.name}`.toLowerCase()));
    for (const d of docs) {
      if (String(d.icon_url ?? '').trim()) continue;
      const hits = free.filter((a) => key(a.label) === key(d.name));
      if (hits.length === 1) pairs.push({ collection, id: String(d._id), name: String(d.name), asset: `${hits[0].folder}/${hits[0].name}`, url: hits[0].url });
      else if (hits.length > 1) ambiguous.push(String(d.name));
    }
  }
  return { pairs, ambiguous };
}

export const GET = withErrors(async () => {
  if (!hasToken()) return NextResponse.json({ pairs: [], ambiguous: [] });
  return NextResponse.json(await plan());
});

/** Fills only empty icon fields; never replaces an icon that is already set. */
export const POST = withErrors(async () => {
  const { pairs } = await plan();
  const store = getStore();
  for (const p of pairs) await store.update(p.collection as any, p.id, { icon_url: p.url });
  return NextResponse.json({ linked: pairs.length });
});
