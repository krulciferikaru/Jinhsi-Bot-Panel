export const FOLDERS = ['CharacterIcons', 'EchoIcons', 'WeaponIcons'] as const;
export type AssetFolder = (typeof FOLDERS)[number];
export const isFolder = (f: unknown): f is AssetFolder => FOLDERS.includes(f as AssetFolder);

export const repo = () => process.env.GITHUB_REPO?.trim() || 'krulciferikaru/Database';
export const branch = () => process.env.GITHUB_BRANCH?.trim() || 'main';
export const base = () => process.env.GITHUB_ASSET_PATH?.trim() || 'WutheringWavesAssets';
export const hasToken = () => Boolean(process.env.GITHUB_TOKEN?.trim());
export const IMAGE_RE = /\.(png|jpe?g|webp|gif)$/i;

export const apiUrl = (p: string) => `https://api.github.com/repos/${repo()}/${p}`;
export const rawUrl = (path: string) =>
  `https://raw.githubusercontent.com/${repo()}/${branch()}/${path.split('/').map(encodeURIComponent).join('/')}`;
export const filePath = (folder: AssetFolder, file: string) => `${base()}/${folder}/${file}`;

let assetCache: { at: number; files: AssetFile[] } | null = null;
let assetRefresh: Promise<AssetFile[]> | null = null;
const FRESH_MS = 60_000;
export const clearAssetCache = () => { assetCache = null; };

export function gh(url: string, init: RequestInit = {}) {
  if (init.method && init.method !== 'GET') clearAssetCache();
  return fetch(url, {
    ...init,
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(hasToken() ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      ...(init.headers ?? {}),
    },
  });
}

/** Contents-API call for a path inside the repository. */
export const contents = (path: string, init: RequestInit = {}, withRef = true) =>
  gh(apiUrl(`contents/${path.split('/').map(encodeURIComponent).join('/')}${withRef ? `?ref=${encodeURIComponent(branch())}` : ''}`), init);

/**
 * Turns user input into a safe file name: spaces become underscores and the original extension is kept.
 * Throws a readable message when the name is not acceptable.
 */
export function cleanName(input: string, ext = '.png'): string {
  let n = input.trim().replace(/\.(png|jpe?g|webp|gif)$/i, '').replace(/\s+/g, '_');
  if (!n) throw new Error('Enter a name.');
  if (n.length > 80) throw new Error('That name is too long (80 characters max).');
  if (!/^[A-Za-z0-9_\-.'()]+$/.test(n) || n.includes('..')) {
    throw new Error('Use only letters, numbers, spaces, and - _ . \' ( ) in the name.');
  }
  return n + ext;
}

/** "Aero_Predator.png" -> "Aero Predator" for display. */
export const displayName = (file: string) => file.replace(/\.[^.]+$/, '').replace(/_/g, ' ');

export type AssetFile = { folder: AssetFolder; name: string; label: string; path: string; size: number; sha: string; url: string };

/** Every image in the three asset folders. Throws a readable message if GitHub cannot be reached. */
export async function listAssets(): Promise<AssetFile[]> {
  // The listing is kept for a minute and any write clears it. After that the old list is shown at once while a new one loads.
  if (assetCache) {
    if (Date.now() - assetCache.at > FRESH_MS && !assetRefresh) assetRefresh = fetchAssets().catch(() => assetCache!.files).finally(() => { assetRefresh = null; });
    return assetCache.files;
  }
  return assetRefresh ?? (assetRefresh = fetchAssets().finally(() => { assetRefresh = null; }));
}

async function fetchAssets(): Promise<AssetFile[]> {
  const lists = await Promise.all(FOLDERS.map(async (folder) => {
    const r = await contents(`${base()}/${folder}`);
    if (r.status === 404) return [] as AssetFile[];
    if (!r.ok) throw new Error(`GitHub error ${r.status} while listing ${folder}.`);
    const items: any[] = await r.json();
    return items
      .filter((x) => x.type === 'file' && IMAGE_RE.test(x.name))
      .map((x): AssetFile => ({ folder, name: x.name, label: displayName(x.name), path: x.path, size: x.size, sha: x.sha, url: rawUrl(x.path) }));
  }));
  const files = lists.flat();
  assetCache = { at: Date.now(), files };
  return files;
}

/** "<folder>/<file>" key for any icon_url that points into the asset library (case-insensitive). */
export function keyOfUrl(url: unknown): string | null {
  const m = /WutheringWavesAssets\/([^/]+)\/([^/?#]+)/i.exec(String(url ?? ''));
  if (!m) return null;
  let file = m[2];
  try { file = decodeURIComponent(file); } catch { /* keep raw */ }
  return `${m[1]}/${file}`.toLowerCase();
}

export class GitError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}

/**
 * Commit many files in ONE commit using the Git Data API: upload blobs, build a tree on top of the branch head,
 * create the commit, then move the branch. Fails (without force) if the branch moved in the meantime.
 */
export async function commitFiles(files: { path: string; content: Buffer }[], message: string): Promise<string> {
  const b = branch();
  const ref = await gh(apiUrl(`git/ref/heads/${encodeURIComponent(b)}`));
  if (!ref.ok) throw new GitError(`GitHub error ${ref.status} reading the branch.`);
  const headSha: string = (await ref.json()).object.sha;
  const head = await gh(apiUrl(`git/commits/${headSha}`));
  if (!head.ok) throw new GitError(`GitHub error ${head.status} reading the latest commit.`);
  const baseTree: string = (await head.json()).tree.sha;

  // Blobs, a few at a time to stay polite to the API.
  const shas: string[] = new Array(files.length);
  for (let i = 0; i < files.length; i += 4) {
    await Promise.all(files.slice(i, i + 4).map(async (f, j) => {
      const r = await gh(apiUrl('git/blobs'), { method: 'POST', body: JSON.stringify({ content: f.content.toString('base64'), encoding: 'base64' }) });
      if (!r.ok) throw new GitError(`GitHub rejected ${f.path.split('/').pop()} (${r.status}).`);
      shas[i + j] = (await r.json()).sha;
    }));
  }

  const tree = await gh(apiUrl('git/trees'), {
    method: 'POST',
    body: JSON.stringify({ base_tree: baseTree, tree: files.map((f, i) => ({ path: f.path, mode: '100644', type: 'blob', sha: shas[i] })) }),
  });
  if (!tree.ok) throw new GitError(`GitHub rejected the file tree (${tree.status}).`);
  const commit = await gh(apiUrl('git/commits'), {
    method: 'POST', body: JSON.stringify({ message, tree: (await tree.json()).sha, parents: [headSha] }),
  });
  if (!commit.ok) throw new GitError(`GitHub rejected the commit (${commit.status}).`);
  const commitSha: string = (await commit.json()).sha;
  const move = await gh(apiUrl(`git/refs/heads/${encodeURIComponent(b)}`), { method: 'PATCH', body: JSON.stringify({ sha: commitSha }) });
  if (move.status === 422) throw new GitError('The repository changed while uploading. Nothing was published, so try again.', 409);
  if (!move.ok) throw new GitError(`GitHub could not update the branch (${move.status}).`);
  return commitSha;
}
