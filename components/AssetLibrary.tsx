'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { optimized } from '@/lib/img';
import { AnimatePresence, motion } from 'motion/react';
import { Combobox } from './Combobox';
import { Modal, Pagination } from './Manager';
import { BulkUpload } from './BulkUpload';
import { AssetTabs } from './AssetTabs';
import { EmojiTargets, noTarget, targetList, type Targets } from './EmojiTargets';
import { useToast } from './Toast';
import { AutoLink } from './AutoLink';

type Folder = 'CharacterIcons' | 'EchoIcons' | 'WeaponIcons';
type Usage = { collection: string; id: string; name: string };
type Asset = { folder: Folder; name: string; label: string; path: string; size: number; sha: string; url: string; usedBy: Usage[] };
type Data = { enabled: boolean; repo: string; branch: string; files: Asset[] };
type Dialog =
  | { kind: 'upload'; folder?: Folder; name?: string }
  | { kind: 'rename' | 'delete'; asset: Asset }
  | null;

const FOLDER_LABEL: Record<Folder, string> = { CharacterIcons: 'Characters', EchoIcons: 'Echoes', WeaponIcons: 'Weapons' };
const FOLDERS = Object.keys(FOLDER_LABEL) as Folder[];
const PAGE = 24;
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function Thumb({ a }: { a: Asset }) {
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [a.sha]);
  return (
    <div className="checker grid aspect-square w-full place-items-center overflow-hidden rounded-xl">
      {bad
        ? <span className="text-3xl font-semibold text-[#ffd93b]">{a.label.slice(0, 1)}</span>
        // eslint-disable-next-line @next/next/no-img-element
        : <img src={optimized(`${a.url}?v=${a.sha.slice(0, 7)}`, 160)} alt={`${a.label} icon`} loading="lazy" onError={() => setBad(true)} className="h-full w-full object-contain" />}
    </div>
  );
}

export function AssetLibrary() {
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'all' | Folder>('all');
  const [q, setQ] = useState('');
  const [usage, setUsage] = useState('');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  // dialog form state
  const [name, setName] = useState('');
  const [folder, setFolder] = useState<Folder>('EchoIcons');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [sync, setSync] = useState(true);
  const [wantEmoji, setWantEmoji] = useState(true);
  const [bots, setBots] = useState<Targets>({ live: true, test: true }); // which bots get the emoji (both by default here)
  const [linkIt, setLinkIt] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/assets/files', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setData(j); setError('');
    } catch (e: any) { setError(e.message); setData((d) => d ?? { enabled: false, repo: '', branch: '', files: [] }); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { // deep link from the Health page: ?q=<search>
    const search = new URLSearchParams(window.location.search).get('q');
    if (search) setQ(search);
  }, []);

  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const open = (d: Dialog) => {
    setFile(null); setSync(true); setBots({ live: true, test: true });
    if (d?.kind === 'upload') { setFolder(d.folder ?? (tab === 'all' ? 'EchoIcons' : tab)); setName(d.name ?? ''); }
    if (d?.kind === 'rename') setName(d.asset.label);
    setDialog(d);
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: data?.files.length ?? 0 };
    FOLDERS.forEach((f) => { c[f] = data?.files.filter((a) => a.folder === f).length ?? 0; });
    return c;
  }, [data]);

  const visible = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data?.files ?? [])
      .filter((a) => (tab === 'all' || a.folder === tab)
        && (!usage || (usage === 'Used') === a.usedBy.length > 0)
        && (!t || a.name.toLowerCase().includes(t) || a.label.toLowerCase().includes(t) || a.usedBy.some((u) => u.name.toLowerCase().includes(t))))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [data, tab, q, usage]);

  const pages = Math.max(1, Math.ceil(visible.length / PAGE));
  const cur = Math.min(page, pages);
  const pageItems = visible.slice((cur - 1) * PAGE, cur * PAGE);
  const exists = data?.files.some((a) => a.folder === folder && a.name.toLowerCase() === `${name.trim().replace(/\s+/g, '_')}.png`.toLowerCase());

  async function run(fn: () => Promise<Response>, ok: (j: any) => string) {
    setBusy(true);
    try {
      const r = await fn();
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Request failed');
      toast('success', ok(j)); setDialog(null); await load();
    } catch (e: any) { toast('error', e.message); }
    finally { setBusy(false); }
  }

  const upload = () => {
    const body = new FormData();
    body.set('file', file!); body.set('folder', folder); body.set('name', name);
    if (wantEmoji) { body.set('emoji', 'true'); targetList(bots).forEach((t) => body.append('emojiTargets', t)); }
    if (linkIt) body.set('linkRecords', 'true');
    return run(() => fetch('/api/assets', { method: 'POST', body }), (j) => {
      let m = `${j.replaced ? 'Replaced' : 'Uploaded'} ${j.name}${j.converted ? ` (converted from ${j.converted})` : ''}.`;
      const live = Array.isArray(j.emoji) ? j.emoji.find((x: any) => x.target === 'live') : null;
      if (live?.code) m += ` Emoji ${live.created ? 'created' : 'reused'}: ${live.code}.`;
      const tst = Array.isArray(j.emoji) ? j.emoji.find((x: any) => x.target === 'test') : null;
      if (tst?.code) m += ` Test bot emoji ${tst.created ? 'created' : 'reused'}.`;
      const failed = Array.isArray(j.emoji) ? j.emoji.filter((x: any) => x.error) : [];
      if (failed.length) m += ` Emoji problem: ${failed.map((x: any) => `${x.target}: ${x.error}`).join(' ')}`;
      if (j.linked?.record) m += ` Filled in ${j.linked.record}.`;
      return m;
    });
  };
  const rename = () => {
    const a = (dialog as { asset: Asset }).asset;
    return run(() => fetch('/api/assets/files', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder: a.folder, from: a.name, to: name, updateRecords: sync && a.usedBy.length > 0 }) }),
    (j) => `Renamed to ${j.name}${j.updatedRecords ? `, ${j.updatedRecords} record${j.updatedRecords > 1 ? 's' : ''} updated` : ''}.`);
  };
  const remove = () => {
    const a = (dialog as { asset: Asset }).asset;
    return run(() => fetch('/api/assets/files', { method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder: a.folder, name: a.name, clearRecords: sync && a.usedBy.length > 0 }) }),
    (j) => `Deleted${j.clearedRecords ? `, icon cleared on ${j.clearedRecords} record${j.clearedRecords > 1 ? 's' : ''}` : ''}.`);
  };
  const copy = async (a: Asset) => {
    try { await navigator.clipboard.writeText(a.url); toast('success', 'Image URL copied.'); }
    catch { toast('error', 'Could not copy. Select the URL from the image link instead.'); }
  };

  const canWrite = data?.enabled !== false;
  const sel = dialog && 'asset' in dialog ? dialog.asset : null;

  return (
    <div className="space-y-4">
      <AssetTabs />
      <div className="flex flex-wrap items-end justify-between gap-4 scroll-mt-24">
        <div>
          <h1 className="text-3xl font-bold">Assets</h1>
          <p className="text-base-content/70">
            Icons stored in {data?.repo ? <code>{data.repo}</code> : 'your GitHub repository'}. Changes here are committed to the <code>{data?.branch || 'main'}</code> branch.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <AutoLink enabled={canWrite} onDone={load} />
          <button className="btn" disabled={!canWrite} onClick={() => setBulkOpen(true)}>Bulk upload</button>
          <button className="btn btn-primary" disabled={!canWrite} onClick={() => open({ kind: 'upload' })}>+ Upload image</button>
        </div>
      </div>

      {data && !data.enabled && (
        <div role="alert" className="alert alert-warning alert-vertical sm:alert-horizontal">
          <span>Viewing only. Add <code>GITHUB_TOKEN</code> to <code>.env.local</code> and restart to upload, rename or delete.</span>
        </div>
      )}
      {error && (
        <div role="alert" className="alert alert-error alert-vertical sm:alert-horizontal">
          <span>Could not load assets: {error}</span>
          <button className="btn btn-sm" onClick={load}>Try again</button>
        </div>
      )}

      <section aria-label="Filter assets" className="card card-border bg-base-100">
        <div className="card-body gap-3 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div role="tablist" aria-label="Folder" className="tabs tabs-box">
              {(['all', ...FOLDERS] as const).map((t) => (
                <button key={t} role="tab" aria-selected={tab === t} className={`tab ${tab === t ? 'tab-active' : ''}`} onClick={() => { setTab(t); setPage(1); }}>
                  {t === 'all' ? 'All' : FOLDER_LABEL[t]} ({counts[t]})
                </button>
              ))}
            </div>
            <label className="input input-bordered flex min-w-60 flex-1 items-center gap-2">
              <span className="sr-only">Search assets</span>
              <input type="search" className="grow" placeholder="Search by file or record name…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
            </label>
            <div className="w-44">
              <Combobox aria-label="Filter by usage" value={usage} options={['Used', 'Unused']} clearLabel="Any usage" onChange={(v) => { setUsage(v); setPage(1); }} />
            </div>
          </div>
          <p className="text-sm text-base-content/70" aria-live="polite">
            {!data ? 'Loading…' : visible.length === 0 ? 'No images found' : `Showing ${(cur - 1) * PAGE + 1}–${Math.min(cur * PAGE, visible.length)} of ${visible.length} images`}
          </p>
        </div>
      </section>

      <Pagination page={cur} pages={pages} onPage={setPage} />

      {!data ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-56" />)}</div>
      ) : visible.length === 0 ? (
        <div className="rounded-box border border-dashed border-white/15 p-10 text-center">
          <p className="mb-3">{q || usage ? 'Nothing matches your search and filters.' : 'No images in this folder yet.'}</p>
          {canWrite && !q && !usage && <button className="btn btn-primary btn-sm" onClick={() => open({ kind: 'upload' })}>Upload the first one</button>}
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <AnimatePresence mode="popLayout" initial={false}>
            {pageItems.map((a) => (
              <motion.li key={a.path} layout initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="card card-border bg-base-100">
                <div className="card-body gap-2 p-3">
                  <Thumb a={a} />
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold" title={a.name}>{a.label}</h2>
                    <p className="mono-label truncate">{FOLDER_LABEL[a.folder]} · {kb(a.size)}</p>
                  </div>
                  {a.usedBy.length > 0
                    ? <p className="truncate text-sm text-primary" title={a.usedBy.map((u) => u.name).join(', ')}>Used by {a.usedBy.map((u) => u.name).join(', ')}</p>
                    : <p className="text-sm text-base-content/60">Not used by any record</p>}
                  <div className="flex flex-wrap gap-1">
                    <button className="btn btn-xs btn-ghost" aria-label={`Copy URL of ${a.label}`} onClick={() => copy(a)}>Copy URL</button>
                    <button className="btn btn-xs btn-ghost" aria-label={`Replace image ${a.label}`} disabled={!canWrite} onClick={() => open({ kind: 'upload', folder: a.folder, name: a.label })}>Replace</button>
                    <button className="btn btn-xs btn-ghost" aria-label={`Rename ${a.label}`} disabled={!canWrite} onClick={() => open({ kind: 'rename', asset: a })}>Rename</button>
                    <button className="btn btn-xs btn-ghost text-error" aria-label={`Delete ${a.label}`} disabled={!canWrite} onClick={() => open({ kind: 'delete', asset: a })}>Delete</button>
                  </div>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      <Pagination page={cur} pages={pages} onPage={setPage} />

      <BulkUpload open={bulkOpen} onClose={() => setBulkOpen(false)} enabled={canWrite} onDone={load}
        defaultFolder={tab === 'all' ? 'EchoIcons' : tab}
        existing={new Set((data?.files ?? []).map((a) => `${a.folder}/${a.name}`.toLowerCase()))} />

      {/* Upload / replace */}
      <Modal open={dialog?.kind === 'upload'} onClose={() => setDialog(null)} title="Upload image">
        <div className="space-y-4">
          <div>
            <span className="mb-1 block text-sm font-medium">Folder</span>
            <Combobox aria-label="Folder" value={folder} options={FOLDERS} onChange={(v) => v && setFolder(v as Folder)} />
          </div>
          <div>
            <label htmlFor="asset-name" className="mb-1 block text-sm font-medium">Name</label>
            <input id="asset-name" className="input input-bordered w-full" value={name} placeholder="e.g. Aero Predator" onChange={(e) => setName(e.target.value)} />
            <p className="mt-1 text-sm text-base-content/60">Saved as <code>{folder}/{name.trim().replace(/\s+/g, '_') || '…'}.png</code></p>
          </div>
          <div className="flex items-start gap-4">
            <div className="checker grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {preview ? <img src={preview} alt="Selected image preview" className="h-full w-full object-contain" /> : <span className="px-1 text-center text-xs text-base-content/60">No image</span>}
            </div>
            <div className="min-w-0 flex-1">
              <label htmlFor="asset-file" className="mb-1 block text-sm font-medium">Image file</label>
              <input id="asset-file" type="file" accept="image/png,image/webp,image/jpeg" className="file-input file-input-bordered w-full" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <p className="mt-1 text-sm text-base-content/60">PNG, WebP or JPEG, up to 5 MB. WebP and JPEG are converted to PNG automatically.</p>
            </div>
          </div>
          {exists && <p role="alert" className="text-sm text-warning">An image with this name already exists. Uploading will replace it.</p>}
          <div className="space-y-2 rounded-box border border-white/10 p-3">
            <label className="flex cursor-pointer items-start gap-3">
              <input type="checkbox" className="toggle toggle-primary mt-0.5" checked={wantEmoji} onChange={(e) => setWantEmoji(e.target.checked)} />
              <span className="text-sm">Also create a Discord emoji named after the image. If one already exists it is reused.</span>
            </label>
            {wantEmoji && <EmojiTargets value={bots} onChange={setBots} />}
            <label className="flex cursor-pointer items-start gap-3">
              <input type="checkbox" className="toggle toggle-primary mt-0.5" checked={linkIt} onChange={(e) => setLinkIt(e.target.checked)} />
              <span className="text-sm">Fill in the icon{wantEmoji && bots.live ? ' and emoji' : ''} on the record with the same name, if it has none yet.</span>
            </label>
          </div>
          <div className="modal-action">
            <button className="btn" onClick={() => setDialog(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={busy || !file || !name.trim() || (wantEmoji && noTarget(bots))} onClick={upload}>
              {busy && <span className="loading loading-spinner loading-sm" />} {exists ? 'Replace image' : 'Upload'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Rename */}
      <Modal open={dialog?.kind === 'rename'} onClose={() => setDialog(null)} title={`Rename ${sel?.label ?? ''}`}>
        {sel && (
          <div className="space-y-4">
            <div>
              <label htmlFor="asset-rename" className="mb-1 block text-sm font-medium">New name</label>
              <input id="asset-rename" className="input input-bordered w-full" value={name} onChange={(e) => setName(e.target.value)} />
              <p className="mt-1 text-sm text-base-content/60">Will be saved as <code>{name.trim().replace(/\s+/g, '_') || '…'}{sel.name.slice(sel.name.lastIndexOf('.'))}</code>. This makes one commit.</p>
            </div>
            {sel.usedBy.length > 0 && (
              <label className="flex cursor-pointer items-start gap-3">
                <input type="checkbox" className="toggle toggle-primary mt-0.5" checked={sync} onChange={(e) => setSync(e.target.checked)} />
                <span className="text-sm">Update the {sel.usedBy.length} record{sel.usedBy.length > 1 ? 's' : ''} that use this icon ({sel.usedBy.map((u) => u.name).join(', ')}) so they keep showing it. If off, they will point to a missing file.</span>
              </label>
            )}
            <div className="modal-action">
              <button className="btn" onClick={() => setDialog(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={busy || !name.trim()} onClick={rename}>
                {busy && <span className="loading loading-spinner loading-sm" />} Rename
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete */}
      <Modal open={dialog?.kind === 'delete'} onClose={() => setDialog(null)} title="Delete this image?">
        {sel && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-24"><Thumb a={sel} /></div>
              <p><strong>{sel.name}</strong> will be removed from the repository with a commit. It stays in the Git history but disappears from the site.</p>
            </div>
            {sel.usedBy.length > 0 && (
              <>
                <p role="alert" className="text-sm text-warning">Used by {sel.usedBy.map((u) => u.name).join(', ')}.</p>
                <label className="flex cursor-pointer items-start gap-3">
                  <input type="checkbox" className="toggle toggle-primary mt-0.5" checked={sync} onChange={(e) => setSync(e.target.checked)} />
                  <span className="text-sm">Also clear the icon on those records so they do not show a broken image.</span>
                </label>
              </>
            )}
            <div className="modal-action">
              <button className="btn" onClick={() => setDialog(null)}>Cancel</button>
              <button className="btn btn-error" disabled={busy} onClick={remove}>
                {busy && <span className="loading loading-spinner loading-sm" />} Delete image
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
