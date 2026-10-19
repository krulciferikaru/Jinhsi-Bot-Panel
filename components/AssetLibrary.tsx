'use client';
import { CopyIcon, PencilIcon, ReplaceIcon, SmileIcon, TrashIcon, UploadIcon } from './Icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { optimized } from '@/lib/img';
import { motion } from 'motion/react';
import { Combobox } from './Combobox';
import { ActionMenu, type MenuItem } from './ActionMenu';
import { AssetGridSkeleton } from './Skeletons';
import { Modal, Pagination } from './Manager';
import { BulkUpload } from './BulkUpload';
import { EmojiTargets, noTarget, targetList, type Targets } from './EmojiTargets';
import { useToast } from './Toast';
import { AutoLink } from './AutoLink';

type Folder = 'CharacterIcons' | 'EchoIcons' | 'WeaponIcons';
type Usage = { collection: string; id: string; name: string };
type Asset = { folder: Folder; name: string; label: string; path: string; size: number; sha: string; url: string; usedBy: Usage[] };
type Data = { enabled: boolean; repo: string; branch: string; files: Asset[] };
type Dialog =
  | { kind: 'upload'; folder?: Folder; name?: string }
  | { kind: 'rename' | 'delete' | 'emoji-add' | 'emoji-remove'; asset: Asset }
  | null;

const FOLDER_LABEL: Record<Folder, string> = { CharacterIcons: 'Characters', EchoIcons: 'Echoes', WeaponIcons: 'Weapons' };
const FOLDERS = Object.keys(FOLDER_LABEL) as Folder[];
const PAGE = 24;
/** same rule the server uses to name an icon's emoji: "Aero Predator" -> "AeroPredator" */
const emojiKey = (label: string) => label.replace(/[^A-Za-z0-9_]+/g, ' ').trim().split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('').slice(0, 32).toLowerCase();
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
  const [emojiFilter, setEmojiFilter] = useState('');
  const [emojis, setEmojis] = useState<{ live: Set<string> | null; test: Set<string> | null }>({ live: null, test: null });
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
  const loadEmojis = useCallback(async () => {
    const get = async (t: 'live' | 'test') => {
      try {
        const r = await fetch(`/api/emojis?target=${t}`, { cache: 'no-store' });
        const j = await r.json();
        return r.ok ? new Set<string>((j.items as { name: string }[]).map((e) => e.name.toLowerCase())) : null;
      } catch { return null; }
    };
    const [live, test] = await Promise.all([get('live'), get('test')]);
    setEmojis({ live, test });
  }, []);
  useEffect(() => { loadEmojis(); }, [loadEmojis]);
  /** which bots have an emoji for this icon (null lists mean that bot could not be reached) */
  const emojiOn = (a: Asset) => {
    const k = emojiKey(a.label);
    return { live: emojis.live?.has(k) ?? false, test: emojis.test?.has(k) ?? false };
  };
  const emojiKnown = emojis.live !== null || emojis.test !== null;
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
    if (d?.kind === 'emoji-add') setBots({ live: true, test: true });
    if (d?.kind === 'emoji-remove') { const on = emojiOn(d.asset); setBots({ live: on.live, test: on.test }); }
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
        && (!emojiFilter || (emojiFilter === 'Has emoji') === (emojiOn(a).live || emojiOn(a).test))
        && (!t || a.name.toLowerCase().includes(t) || a.label.toLowerCase().includes(t) || a.usedBy.some((u) => u.name.toLowerCase().includes(t))))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [data, tab, q, usage, emojiFilter, emojis]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const addEmoji = () => {
    const a = (dialog as { asset: Asset }).asset;
    return run(() => fetch('/api/assets/emoji', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder: a.folder, name: a.name, label: a.label, targets: targetList(bots) }) }),
    (j) => {
      const ok = (j.results as any[]).filter((r) => r.code);
      const bad = (j.results as any[]).filter((r) => r.error);
      let m = ok.length ? `Emoji ready on ${ok.map((r) => r.target).join(' and ')}.` : 'No emoji was created.';
      if (j.linked?.emojiSet) m += ` Filled in the emoji on ${a.label}.`;
      if (bad.length) m += ` Problem: ${bad.map((r) => `${r.target}: ${r.error}`).join(' ')}`;
      loadEmojis();
      return m;
    });
  };
  const removeEmoji = () => {
    const a = (dialog as { asset: Asset }).asset;
    return run(() => fetch('/api/assets/emoji', { method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: a.label, targets: targetList(bots) }) }),
    (j) => {
      const gone = (j.results as any[]).filter((r) => r.removed).map((r) => r.target);
      const bad = (j.results as any[]).filter((r) => r.error);
      let m = gone.length ? `Emoji removed from ${gone.join(' and ')}.` : 'Nothing was removed.';
      if (bad.length) m += ` Problem: ${bad.map((r) => `${r.target}: ${r.error}`).join(' ')}`;
      loadEmojis();
      return m;
    });
  };
  const menuFor = (a: Asset): MenuItem[] => {
    const on = emojiOn(a);
    const items: MenuItem[] = [{ label: 'Copy URL', icon: <CopyIcon />, onSelect: () => copy(a) }];
    if (!canWrite) return items;
    items.push({ label: 'Replace image', icon: <ReplaceIcon />, onSelect: () => open({ kind: 'upload', folder: a.folder, name: a.label }) });
    if (emojiKnown) items.push(on.live || on.test
      ? { label: 'Remove emoji', icon: <SmileIcon />, onSelect: () => open({ kind: 'emoji-remove', asset: a }) }
      : { label: 'Add emoji', icon: <SmileIcon />, onSelect: () => open({ kind: 'emoji-add', asset: a }) });
    items.push({ label: 'Rename', icon: <PencilIcon />, onSelect: () => open({ kind: 'rename', asset: a }) });
    items.push({ label: 'Delete', icon: <TrashIcon />, danger: true, separatorBefore: true, onSelect: () => open({ kind: 'delete', asset: a }) });
    return items;
  };
  const copy = async (a: Asset) => {
    try { await navigator.clipboard.writeText(a.url); toast('success', 'Image URL copied.'); }
    catch { toast('error', 'Could not copy. Select the URL from the image link instead.'); }
  };

  const canWrite = data?.enabled !== false;
  const sel = dialog && 'asset' in dialog ? dialog.asset : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4 scroll-mt-24">
        <div>
          <h1 className="text-3xl font-bold">Assets</h1>
          <p className="text-base-content/70">
            Icon images in {data?.repo ? <code>{data.repo}</code> : 'your GitHub repository'}.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <AutoLink enabled={canWrite} onDone={load} />
          <button className="btn" disabled={!canWrite} onClick={() => setBulkOpen(true)}>Bulk upload</button>
          <button className="btn btn-primary" disabled={!canWrite} onClick={() => open({ kind: 'upload' })}><UploadIcon />Upload image</button>
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
            {emojiKnown && (
              <div className="w-44">
                <Combobox aria-label="Filter by emoji" value={emojiFilter} options={['Has emoji', 'No emoji']} clearLabel="Any emoji" onChange={(v) => { setEmojiFilter(v); setPage(1); }} />
              </div>
            )}
          </div>
          <p className="text-sm text-base-content/70" aria-live="polite">
            {!data ? 'Loading…' : visible.length === 0 ? 'No images found' : `Showing ${(cur - 1) * PAGE + 1}–${Math.min(cur * PAGE, visible.length)} of ${visible.length} images`}
          </p>
        </div>
      </section>

      <Pagination page={cur} pages={pages} onPage={setPage} />

      {!data ? (
        <AssetGridSkeleton />
      ) : visible.length === 0 ? (
        <div className="rounded-box border border-dashed border-white/15 p-10 text-center">
          <p className="mb-3">{q || usage || emojiFilter ? 'Nothing matches your search and filters.' : 'No images in this folder yet.'}</p>
          {canWrite && !q && !usage && !emojiFilter && <button className="btn btn-primary btn-sm" onClick={() => open({ kind: 'upload' })}>Upload the first one</button>}
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <>
            {pageItems.map((a) => (
              <motion.li key={a.path} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }} className="card card-border bg-base-100">
                <div className="card-body gap-2 p-3">
                  <Thumb a={a} />
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0">
                      <h2 className="truncate font-semibold" title={a.name}>{a.label}</h2>
                      <p className="mono-label truncate">{FOLDER_LABEL[a.folder]} · {kb(a.size)}</p>
                    </div>
                    <ActionMenu label={`More actions for ${a.label}`} items={menuFor(a)} />
                  </div>
                  {emojiKnown && (() => {
                    const on = emojiOn(a);
                    const has = on.live || on.test;
                    return <p><span className={`badge badge-sm ${has ? 'badge-success badge-soft' : 'badge-ghost'}`} title={has ? `On: ${[on.live && 'Live bot', on.test && 'Test bot'].filter(Boolean).join(', ')}` : 'No Discord emoji for this icon'}>{has ? `Has emoji${on.live && on.test ? '' : on.live ? ' (Live)' : ' (Test)'}` : 'No emoji'}</span></p>;
                  })()}
                  {a.usedBy.length > 0
                    ? <p className="truncate text-sm text-primary" title={a.usedBy.map((u) => u.name).join(', ')}>Used by {a.usedBy.map((u) => u.name).join(', ')}</p>
                    : <p className="text-sm text-base-content/60">Not used by any record</p>}
                </div>
              </motion.li>
            ))}
          </>
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

      {/* Add emoji */}
      <Modal open={dialog?.kind === 'emoji-add'} onClose={() => setDialog(null)} title={`Add emoji for ${sel?.label ?? ''}`}>
        {sel && (
          <div className="space-y-4">
            <p>Creates a Discord emoji named <code>{sel.label.replace(/[^A-Za-z0-9_]+/g, ' ').trim().split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')}</code> from this image. If one already exists it is reused, and the matching record gets the Live bot’s code if its emoji is empty.</p>
            <EmojiTargets value={bots} onChange={setBots} />
            <div className="modal-action">
              <button className="btn" onClick={() => setDialog(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={busy || noTarget(bots)} onClick={addEmoji}>
                {busy ? <span className="loading loading-spinner loading-sm" /> : <SmileIcon />} Add emoji
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Remove emoji */}
      <Modal open={dialog?.kind === 'emoji-remove'} onClose={() => setDialog(null)} title={`Remove emoji of ${sel?.label ?? ''}?`}>
        {sel && (
          <div className="space-y-4">
            <p>Deletes the Discord emoji for this icon from the bots you choose. The image itself stays.</p>
            <p role="alert" className="text-sm text-warning">Records and builds that contain the emoji code will show plain text instead. This cannot be undone.</p>
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium">Remove it from</legend>
              {(['live', 'test'] as const).map((t) => (
                <label key={t} className={`flex items-center gap-3 ${emojiOn(sel)[t] ? 'cursor-pointer' : 'opacity-50'}`}>
                  <input type="checkbox" className="checkbox checkbox-sm" disabled={!emojiOn(sel)[t]} checked={bots[t]} onChange={(e) => setBots({ ...bots, [t]: e.target.checked })} />
                  <span className="text-sm">{t === 'live' ? 'Live bot' : 'Test bot'}{emojiOn(sel)[t] ? '' : ' (no emoji there)'}</span>
                </label>
              ))}
            </fieldset>
            <div className="modal-action">
              <button className="btn" onClick={() => setDialog(null)}>Cancel</button>
              <button className="btn btn-error" disabled={busy || noTarget(bots)} onClick={removeEmoji}>
                {busy ? <span className="loading loading-spinner loading-sm" /> : <TrashIcon />} Remove emoji
              </button>
            </div>
          </div>
        )}
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
