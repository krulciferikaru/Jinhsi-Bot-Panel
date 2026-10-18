import { NextResponse } from 'next/server';
import { getStore } from '@/lib/db';
import { fail, withErrors } from '@/lib/api';
import { record } from '@/lib/activity';
import {
  IMAGE_RE, apiUrl, branch, cleanName, contents, filePath, gh, hasToken, isFolder, keyOfUrl, listAssets, rawUrl, repo,
  type AssetFolder,
} from '@/lib/github';
import { COLLECTIONS, type CollectionKey } from '@/lib/schema';

export const dynamic = 'force-dynamic';

const ICON_COLLECTIONS: CollectionKey[] = ['resonators', 'echoes', 'weapons'];
type Usage = { collection: CollectionKey; id: string; name: string };

/** Which records use which icon, keyed by "<folder>/<file>". */
async function usageMap() {
  const map = new Map<string, Usage[]>();
  const store = getStore();
  for (const c of ICON_COLLECTIONS) {
    for (const d of await store.list(c)) {
      const k = keyOfUrl(d.icon_url);
      if (!k) continue;
      map.set(k, [...(map.get(k) ?? []), { collection: c, id: String(d._id), name: String(d[COLLECTIONS[c].titleKey] ?? '') }]);
    }
  }
  return map;
}

const keyOf = (folder: string, file: string) => `${folder}/${file}`.toLowerCase();

/** Every image in the three asset folders, with the records that use each one. */
export const GET = withErrors(async () => {
  const listed = await listAssets();

  const usage = await usageMap().catch(() => new Map<string, Usage[]>());
  const files = listed.map((f) => ({ ...f, usedBy: usage.get(keyOf(f.folder, f.name)) ?? [] }));
  return NextResponse.json({ enabled: hasToken(), repo: repo(), branch: branch(), files });
});

async function assertExists(path: string) {
  const r = await contents(path);
  if (r.status === 404) throw new Error('That file no longer exists in the repository.');
  if (!r.ok) throw new Error(`GitHub error ${r.status} while checking the file.`);
  return (await r.json()) as { sha: string; name: string };
}

/** Point records at a new URL (or clear it) after a rename or delete. */
async function repoint(oldKey: string, newUrl: string) {
  const store = getStore();
  let n = 0;
  for (const c of ICON_COLLECTIONS) {
    for (const d of await store.list(c)) {
      if (keyOfUrl(d.icon_url) === oldKey) { await store.update(c, String(d._id), { icon_url: newUrl }); n++; }
    }
  }
  return n;
}

/** Rename: one atomic commit that adds the new path and removes the old one. Body: { folder, from, to, updateRecords } */
export const PATCH = withErrors(async (req: Request) => {
  if (!hasToken()) return fail('GITHUB_TOKEN is not set. Add it to .env.local and restart the app.');
  const { folder, from, to, updateRecords } = await req.json();
  if (!isFolder(folder) || typeof from !== 'string' || !IMAGE_RE.test(from)) return fail('Invalid file.');
  const ext = from.slice(from.lastIndexOf('.'));
  let toName: string;
  try { toName = cleanName(String(to ?? ''), ext); } catch (e: any) { return fail(e.message); }
  if (toName === from) return fail('The new name is the same as the current one.');

  const oldPath = filePath(folder as AssetFolder, from);
  const newPath = filePath(folder as AssetFolder, toName);
  const { sha: blobSha } = await assertExists(oldPath);

  const clash = await contents(newPath);
  if (clash.ok) return fail(`A file named "${toName}" already exists in ${folder}.`, 409);
  if (clash.status !== 404) return fail(`GitHub error ${clash.status} while checking the new name.`, 502);

  const b = branch();
  const ref = await gh(apiUrl(`git/ref/heads/${encodeURIComponent(b)}`));
  if (!ref.ok) return fail(`GitHub error ${ref.status} reading the branch.`, 502);
  const headSha: string = (await ref.json()).object.sha;
  const headCommit = await gh(apiUrl(`git/commits/${headSha}`));
  if (!headCommit.ok) return fail(`GitHub error ${headCommit.status} reading the latest commit.`, 502);
  const baseTree: string = (await headCommit.json()).tree.sha;

  const tree = await gh(apiUrl('git/trees'), {
    method: 'POST',
    body: JSON.stringify({
      base_tree: baseTree,
      tree: [
        { path: newPath, mode: '100644', type: 'blob', sha: blobSha },
        { path: oldPath, mode: '100644', type: 'blob', sha: null },
      ],
    }),
  });
  if (!tree.ok) return fail(`GitHub rejected the rename (${tree.status}).`, 502);
  const commit = await gh(apiUrl('git/commits'), {
    method: 'POST',
    body: JSON.stringify({ message: `Rename icon: ${from} -> ${toName}`, tree: (await tree.json()).sha, parents: [headSha] }),
  });
  if (!commit.ok) return fail(`GitHub rejected the rename commit (${commit.status}).`, 502);
  const move = await gh(apiUrl(`git/refs/heads/${encodeURIComponent(b)}`), { method: 'PATCH', body: JSON.stringify({ sha: (await commit.json()).sha }) });
  if (!move.ok) return fail(`GitHub could not update the branch (${move.status}).`, 502);

  const updated = updateRecords ? await repoint(keyOf(folder, from), rawUrl(newPath)) : 0;
  await record({
    action: 'asset-rename', collection: 'assets', title: `${from} → ${toName}`, undoable: false,
    detail: `${folder}${updated ? `, ${updated} record${updated > 1 ? 's' : ''} updated` : ''}`,
  });
  return NextResponse.json({ name: toName, url: rawUrl(newPath), updatedRecords: updated });
});

/** Delete a file. Body: { folder, name, clearRecords } */
export const DELETE = withErrors(async (req: Request) => {
  if (!hasToken()) return fail('GITHUB_TOKEN is not set. Add it to .env.local and restart the app.');
  const { folder, name, clearRecords } = await req.json();
  if (!isFolder(folder) || typeof name !== 'string' || !IMAGE_RE.test(name)) return fail('Invalid file.');
  const path = filePath(folder, name);
  const { sha } = await assertExists(path);
  const del = await contents(path, { method: 'DELETE', body: JSON.stringify({ message: `Delete icon: ${name}`, sha, branch: branch() }) }, false);
  if (!del.ok) {
    const detail = (await del.json().catch(() => ({})))?.message ?? '';
    return fail(`GitHub rejected the delete (${del.status}). ${detail}`.trim(), 502);
  }
  const cleared = clearRecords ? await repoint(keyOf(folder, name), '') : 0;
  await record({
    action: 'asset-delete', collection: 'assets', title: name, undoable: false,
    detail: `${folder}${cleared ? `, icon cleared on ${cleared} record${cleared > 1 ? 's' : ''}` : ''}`,
  });
  return NextResponse.json({ ok: true, clearedRecords: cleared });
});
