'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pagination } from './Manager';
import { useToast } from './Toast';
import { AssetTabs } from './AssetTabs';

type Target = 'live' | 'test';
type Emoji = { id: string; name: string; animated: boolean; url: string; code: string };
type Data = { target: Target; appId: string | null; items: Emoji[]; limit: number };
type Row = { id: number; file: File; url: string; name: string };
type Result = { name: string; target: Target; ok: boolean; code?: string; error?: string; existing?: string };
type Dialog = { kind: 'rename' | 'delete'; emoji: Emoji } | { kind: 'upload' } | null;

const PAGE = 60;
const OK_TYPES = ['image/png', 'image/webp', 'image/jpeg', 'image/gif'];
let nextId = 1;
/** "aero_predator (1).png" -> "AeroPredator" (what the server will use too) */
const guess = (f: File) => f.name.replace(/\.[^.]+$/, '').replace(/\s*\(\d+\)$/, '').replace(/[^A-Za-z0-9_]+/g, ' ').trim()
  .split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
const nameProblem = (n: string) => (/^[A-Za-z0-9_]{2,32}$/.test(n.trim()) ? '' : 'Use 2–32 letters, numbers or underscores.');

export function EmojiLibrary() {
  const toast = useToast();
  const [target, setTarget] = useState<Target>('live');
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');

  // upload dialog state
  const [rows, setRows] = useState<Row[]>([]);
  const [both, setBoth] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const urls = useRef<string[]>([]);

  const load = useCallback(async () => {
    setData(null);
    try {
      const r = await fetch(`/api/emojis?target=${target}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setData(j); setError('');
    } catch (e: any) { setError(e.message); setData({ target, appId: null, items: [], limit: 2000 }); }
  }, [target]);
  useEffect(() => { setPage(1); load(); }, [load]);

  useEffect(() => {
    if (dialog?.kind !== 'upload') { urls.current.forEach(URL.revokeObjectURL); urls.current = []; setRows([]); setResults(null); }
  }, [dialog]);

  const visible = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data?.items ?? []).filter((e) => !t || e.name.toLowerCase().includes(t) || e.id.includes(t));
  }, [data, q]);
  const pages = Math.max(1, Math.ceil(visible.length / PAGE));
  const cur = Math.min(page, pages);
  const shown = visible.slice((cur - 1) * PAGE, cur * PAGE);
  const taken = useMemo(() => new Set((data?.items ?? []).map((e) => e.name.toLowerCase())), [data]);

  async function call(init: RequestInit, ok: string) {
    setBusy(true);
    try {
      const r = await fetch('/api/emojis', { ...init, headers: { 'Content-Type': 'application/json' } });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Request failed');
      toast('success', ok); setDialog(null); await load();
    } catch (e: any) { toast('error', e.message); }
    finally { setBusy(false); }
  }
  const copy = async (e: Emoji) => {
    try { await navigator.clipboard.writeText(e.code); toast('success', `Copied ${e.code}`); }
    catch { toast('error', 'Could not copy.'); }
  };

  function addFiles(list: FileList | File[]) {
    const fresh: Row[] = [];
    for (const f of Array.from(list)) {
      if (!OK_TYPES.includes(f.type)) continue;
      const url = URL.createObjectURL(f); urls.current.push(url);
      fresh.push({ id: nextId++, file: f, url, name: guess(f) });
    }
    setRows((r) => [...r, ...fresh].slice(0, 40)); setResults(null);
  }
  const rowStatus = (r: Row, i: number) => {
    const p = nameProblem(r.name);
    if (p) return { bad: p, note: '' };
    if (rows.findIndex((x) => x.name.toLowerCase() === r.name.toLowerCase()) !== i) return { bad: 'Another image here has the same name.', note: '' };
    if (taken.has(r.name.toLowerCase())) return { bad: '', note: `Already exists on the ${target} bot; it will be skipped.` };
    return { bad: '', note: 'New' };
  };
  const bad = rows.some((r, i) => rowStatus(r, i).bad);

  async function upload() {
    setBusy(true);
    try {
      const body = new FormData();
      rows.forEach((r) => { body.append('files', r.file); body.append('names', r.name); });
      body.append('targets', target); if (both) body.append('targets', target === 'live' ? 'test' : 'live');
      const res = await fetch('/api/emojis', { method: 'POST', body });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Upload failed');
      setResults(j.results);
      const okN = j.results.filter((x: Result) => x.ok).length;
      toast(okN ? 'success' : 'error', `${okN} of ${j.results.length} emoji created.`);
      setRows([]); await load();
    } catch (e: any) { toast('error', e.message); }
    finally { setBusy(false); }
  }

  const nearLimit = data && data.items.length > data.limit * 0.9;

  return (
    <div className="space-y-4">
      <AssetTabs />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Emojis</h1>
          <p className="text-base-content/70">The bot’s own application emojis. They work in every server the bot is in, with no extra setup.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setDialog({ kind: 'upload' })}>+ Upload emojis</button>
      </div>

      {error && (
        <div role="alert" className="alert alert-error alert-vertical sm:alert-horizontal">
          <span>{error}</span><button className="btn btn-sm" onClick={load}>Try again</button>
        </div>
      )}

      <section aria-label="Filter emojis" className="card card-border bg-base-100">
        <div className="card-body gap-3 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div role="tablist" aria-label="Bot" className="tabs tabs-box">
              {(['live', 'test'] as const).map((t) => (
                <button key={t} role="tab" aria-selected={target === t} className={`tab ${target === t ? 'tab-active' : ''}`} onClick={() => setTarget(t)}>
                  {t === 'live' ? 'Live bot' : 'Test bot'}
                </button>
              ))}
            </div>
            <label className="input input-bordered flex min-w-60 flex-1 items-center gap-2">
              <span className="sr-only">Search emojis</span>
              <input type="search" className="grow" placeholder="Search by name or id…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
            </label>
          </div>
          <p className="text-sm text-base-content/70" aria-live="polite">
            {!data ? 'Loading…' : `${visible.length} of ${data.items.length} emojis (limit ${data.limit})`}
            {nearLimit && <span className="ml-2 text-warning">Close to Discord’s limit.</span>}
          </p>
          <p className="text-xs text-base-content/50">Each bot has its own emojis, so a code from the Live bot shows as plain text when the Test bot uses it.</p>
        </div>
      </section>

      <Pagination page={cur} pages={pages} onPage={setPage} />

      {!data ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">{Array.from({ length: 12 }).map((_, i) => <div key={i} className="skeleton h-36" />)}</div>
      ) : shown.length === 0 ? (
        <div className="rounded-box border border-dashed border-white/15 p-10 text-center">
          <p>{q ? 'No emojis match your search.' : `The ${target} bot has no emojis yet.`}</p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {shown.map((e) => (
            <li key={e.id} className="card card-border bg-base-100">
              <div className="card-body items-center gap-2 p-3 text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={e.url} alt="" width={48} height={48} loading="lazy" className="h-12 w-12 object-contain" />
                <p className="w-full truncate text-sm font-medium" title={e.name}>{e.name}</p>
                <div className="flex flex-wrap justify-center gap-1">
                  <button className="btn btn-xs btn-ghost" aria-label={`Copy code for ${e.name}`} onClick={() => copy(e)}>Copy</button>
                  <button className="btn btn-xs btn-ghost" aria-label={`Rename ${e.name}`} onClick={() => { setName(e.name); setDialog({ kind: 'rename', emoji: e }); }}>Rename</button>
                  <button className="btn btn-xs btn-ghost text-error" aria-label={`Delete ${e.name}`} onClick={() => setDialog({ kind: 'delete', emoji: e })}>Delete</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Pagination page={cur} pages={pages} onPage={setPage} />

      {/* Rename */}
      <Modal open={dialog?.kind === 'rename'} onClose={() => setDialog(null)} title={`Rename ${dialog?.kind === 'rename' ? dialog.emoji.name : ''}`}>
        {dialog?.kind === 'rename' && (
          <div className="space-y-4">
            <div>
              <label htmlFor="emoji-rename" className="mb-1 block text-sm font-medium">New name</label>
              <input id="emoji-rename" className="input input-bordered w-full" value={name} onChange={(e) => setName(e.target.value)} />
              <p className={`mt-1 text-sm ${nameProblem(name) ? 'text-error' : 'text-base-content/60'}`}>{nameProblem(name) || 'The id stays the same, so records that already use this emoji keep working.'}</p>
            </div>
            <div className="modal-action">
              <button className="btn" onClick={() => setDialog(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={busy || !!nameProblem(name) || name === dialog.emoji.name}
                onClick={() => call({ method: 'PATCH', body: JSON.stringify({ target, id: dialog.emoji.id, name }) }, 'Emoji renamed.')}>
                {busy && <span className="loading loading-spinner loading-sm" />} Rename
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete */}
      <Modal open={dialog?.kind === 'delete'} onClose={() => setDialog(null)} title="Delete this emoji?">
        {dialog?.kind === 'delete' && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={dialog.emoji.url} alt="" width={56} height={56} className="h-14 w-14 object-contain" />
              <p><strong>{dialog.emoji.name}</strong> will be removed from the {target} bot.</p>
            </div>
            <p role="alert" className="text-sm text-warning">Records and builds that contain <code>{dialog.emoji.code}</code> will show plain text instead of the icon. This cannot be undone.</p>
            <div className="modal-action">
              <button className="btn" onClick={() => setDialog(null)}>Cancel</button>
              <button className="btn btn-error" disabled={busy} onClick={() => call({ method: 'DELETE', body: JSON.stringify({ target, id: dialog.emoji.id }) }, 'Emoji deleted.')}>
                {busy && <span className="loading loading-spinner loading-sm" />} Delete emoji
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Upload */}
      <Modal wide open={dialog?.kind === 'upload'} onClose={() => setDialog(null)} title={`Upload emojis to the ${target} bot`}>
        <div className="space-y-4">
          <label htmlFor="emoji-files" className="flex cursor-pointer flex-col items-center gap-1 rounded-box border-2 border-dashed border-white/20 p-6 text-center hover:border-white/40"
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
            <span className="font-medium">Drop images here, or click to choose</span>
            <span className="text-sm text-base-content/60">PNG, WebP, JPEG or GIF. They are resized to 128×128 and kept under Discord’s 256 KB limit.</span>
            <input id="emoji-files" type="file" multiple accept="image/png,image/webp,image/jpeg,image/gif" className="sr-only"
              onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
          </label>

          {rows.length > 0 && (
            <ul className="max-h-[40vh] space-y-2 overflow-y-auto pr-1" data-lenis-prevent>
              {rows.map((r, i) => {
                const s = rowStatus(r, i);
                return (
                  <li key={r.id} className={`flex flex-wrap items-center gap-3 rounded-box border p-2 ${s.bad ? 'border-error/60' : 'border-white/10'}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.url} alt="" className="h-12 w-12 shrink-0 rounded object-contain" />
                    <div className="min-w-40 flex-1">
                      <input aria-label={`Emoji name for ${r.file.name}`} className="input input-bordered w-full" value={r.name}
                        onChange={(e) => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, name: e.target.value } : x)))} />
                      <p className={`mt-1 text-xs ${s.bad ? 'text-error' : 'text-base-content/60'}`}>{s.bad || s.note}</p>
                    </div>
                    <button type="button" className="btn btn-ghost btn-sm text-error" onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}>Remove</button>
                  </li>
                );
              })}
            </ul>
          )}

          {results && (
            <ul className="space-y-1 text-sm" aria-live="polite">
              {results.map((r, i) => (
                <li key={i} className={r.ok ? 'text-success' : 'text-error'}>
                  {r.ok ? `✓ ${r.name}: ${r.code}` : `✕ ${r.name} (${r.target}): ${r.error}`}
                </li>
              ))}
            </ul>
          )}

          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" className="checkbox checkbox-sm mt-0.5" checked={both} onChange={(e) => setBoth(e.target.checked)} />
            <span className="text-sm">Also add them to the {target === 'live' ? 'Test' : 'Live'} bot.</span>
          </label>

          <div className="modal-action">
            <button className="btn" onClick={() => setDialog(null)}>{results ? 'Close' : 'Cancel'}</button>
            <button className="btn btn-primary" disabled={busy || rows.length === 0 || bad} onClick={upload}>
              {busy && <span className="loading loading-spinner loading-sm" />} {busy ? 'Uploading…' : `Upload ${rows.length || ''} emoji${rows.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
