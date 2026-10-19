'use client';
import { useCallback, useEffect, useState } from 'react';
import { Combobox } from './Combobox';
import { Modal, Pagination } from './Manager';
import { useToast } from './Toast';
import { ActivitySkeleton } from './Skeletons';
import { COLLECTIONS, plain, type CollectionKey } from '@/lib/schema';

type Change = { key: string; from: unknown; to: unknown };
type Entry = {
  _id: string; at: string; action: string; collection: string; docId?: string; title: string;
  changes?: Change[]; detail?: string; undoable: boolean; undone?: boolean; undoneAt?: string;
};
type Result = { items: Entry[]; total: number; page: number; pages: number };

const ACTION: Record<string, { label: string; badge: string }> = {
  create: { label: 'Added', badge: 'badge-success' },
  update: { label: 'Edited', badge: 'badge-info' },
  archive: { label: 'Archived', badge: 'badge-warning' },
  restore: { label: 'Restored', badge: 'badge-success' },
  delete: { label: 'Deleted', badge: 'badge-error' },
  'asset-upload': { label: 'Uploaded image', badge: 'badge-success' },
  'asset-replace': { label: 'Replaced image', badge: 'badge-info' },
  'asset-rename': { label: 'Renamed image', badge: 'badge-info' },
  'asset-delete': { label: 'Deleted image', badge: 'badge-error' },
  'backup-restore': { label: 'Restored backup', badge: 'badge-warning' },
  'asset-bulk': { label: 'Bulk upload', badge: 'badge-success' },
  'emoji-upload': { label: 'Uploaded emoji', badge: 'badge-success' },
  'emoji-rename': { label: 'Renamed emoji', badge: 'badge-info' },
  'emoji-delete': { label: 'Deleted emoji', badge: 'badge-error' },
  import: { label: 'Imported', badge: 'badge-success' },
};
const SCOPES: [label: string, value: string][] = [
  ...(Object.keys(COLLECTIONS) as CollectionKey[]).map((k) => [COLLECTIONS[k].label, k] as [string, string]),
  ['Assets', 'assets'],
];
const ACTIONS: [label: string, value: string][] = Object.entries(ACTION).map(([k, v]) => [v.label, k]);

const labelOf = (collection: string, key: string) =>
  COLLECTIONS[collection as CollectionKey]?.fields.find((f) => f.key === key)?.label ?? (key === 'archived' ? 'Archived' : key);

function fmt(v: unknown): string {
  if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.map((x) => plain(x) || String(x)).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

const dayKey = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
function ago(iso: string) {
  const s = (new Date(iso).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const [unit, secs] of [['day', 86400], ['hour', 3600], ['minute', 60]] as const) {
    if (Math.abs(s) >= secs) return rtf.format(Math.round(s / secs), unit);
  }
  return 'just now';
}
const scopeLabel = (c: string) => (c === 'assets' ? 'Assets' : c === 'backup' ? 'Backup' : c === 'emojis' ? 'Emojis' : COLLECTIONS[c as CollectionKey]?.singular ?? c);

export function ActivityLog() {
  const toast = useToast();
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [scope, setScope] = useState('');
  const [action, setAction] = useState('');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [undo, setUndo] = useState<{ entry: Entry; conflict?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { const t = setTimeout(() => { setDebouncedQ(q); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);

  const load = useCallback(async () => {
    try {
      const sp = new URLSearchParams({ page: String(page) });
      if (scope) sp.set('collection', scope);
      if (action) sp.set('action', action);
      if (debouncedQ) sp.set('q', debouncedQ);
      const r = await fetch(`/api/activity?${sp}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setData(j); setError('');
    } catch (e: any) { setError(e.message); setData((d) => d ?? { items: [], total: 0, page: 1, pages: 1 }); }
  }, [page, scope, action, debouncedQ]);
  useEffect(() => { load(); }, [load]);

  async function doUndo(force = false) {
    if (!undo) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/activity/${undo.entry._id}/undo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force }) });
      const j = await r.json();
      if (r.status === 409) { setUndo({ entry: undo.entry, conflict: j.error }); return; }
      if (!r.ok) throw new Error(j.error || 'Could not undo.');
      toast('success', 'Change undone.'); setUndo(null); await load();
    } catch (e: any) { toast('error', e.message); }
    finally { setBusy(false); }
  }

  const items = data?.items ?? [];
  let lastDay = '';
  const byLabel = (list: [string, string][], label: string) => list.find(([l]) => l === label)?.[1] ?? '';
  const valueLabel = (list: [string, string][], v: string) => list.find(([, x]) => x === v)?.[0] ?? '';
  const filtered = Boolean(scope || action || debouncedQ);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold">Activity</h1>
        <p className="text-base-content/70">Every change made here, newest first.</p>
      </div>

      {error && (
        <div role="alert" className="alert alert-error alert-vertical sm:alert-horizontal">
          <span>Could not load activity: {error}</span>
          <button className="btn btn-sm" onClick={load}>Try again</button>
        </div>
      )}

      <section aria-label="Filter activity" className="card card-border bg-base-100">
        <div className="card-body gap-3 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="input input-bordered flex items-center gap-2 sm:col-span-1">
              <span className="sr-only">Search activity</span>
              <input type="search" className="grow" placeholder="Search by name…" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <Combobox aria-label="Filter by area" value={valueLabel(SCOPES, scope)} options={SCOPES.map(([l]) => l)} clearLabel="All areas"
              onChange={(l) => { setScope(byLabel(SCOPES, l)); setPage(1); }} />
            <Combobox aria-label="Filter by action" value={valueLabel(ACTIONS, action)} options={ACTIONS.map(([l]) => l)} clearLabel="All actions"
              onChange={(l) => { setAction(byLabel(ACTIONS, l)); setPage(1); }} />
          </div>
          <p className="text-sm text-base-content/70" aria-live="polite">
            {!data ? 'Loading…' : data.total === 0 ? 'No activity found' : `${data.total} ${data.total === 1 ? 'entry' : 'entries'}`}
            {filtered && <button className="btn btn-ghost btn-sm ml-2" onClick={() => { setScope(''); setAction(''); setQ(''); setPage(1); }}>Clear filters</button>}
          </p>
        </div>
      </section>

      <Pagination page={data?.page ?? 1} pages={data?.pages ?? 1} onPage={setPage} />

      {!data ? (
        <ActivitySkeleton />
      ) : items.length === 0 ? (
        <div className="rounded-box border border-dashed border-white/15 p-10 text-center">
          <p>{filtered ? 'Nothing matches those filters.' : 'No activity yet. Changes you make will show up here.'}</p>
        </div>
      ) : (
        <ol className="space-y-3">
          {items.map((e) => {
            const day = dayKey(e.at);
            const header = day !== lastDay ? day : null;
            lastDay = day;
            const meta = ACTION[e.action] ?? { label: e.action, badge: '' };
            const canUndo = e.undoable && !e.undone;
            return (
              <li key={e._id}>
                {header && <h2 className="mono-label mb-2 mt-4">{header}</h2>}
                <div className={`card card-border bg-base-100 ${e.undone ? 'opacity-60' : ''}`}>
                  <div className="card-body gap-2 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className={`badge ${meta.badge}`}>{meta.label}</span>
                        <span className="mono-label">{scopeLabel(e.collection)}</span>
                        <h3 className="min-w-0 truncate font-semibold">{e.title}</h3>
                        {e.undone && <span className="badge badge-ghost">Undone</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        <time dateTime={e.at} title={new Date(e.at).toLocaleString()} className="text-sm text-base-content/60">
                          {new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {ago(e.at)}
                        </time>
                        {canUndo && <button className="btn btn-sm" aria-label={`Undo ${meta.label.toLowerCase()} ${e.title}`} onClick={() => setUndo({ entry: e })}>Undo</button>}
                      </div>
                    </div>
                    {e.detail && <p className="text-sm text-base-content/60">{e.detail}</p>}
                    {e.changes && e.changes.length > 0 && e.action === 'update' && (
                      <details className="group">
                        <summary className="cursor-pointer list-none text-sm text-base-content/70 [&::-webkit-details-marker]:hidden">
                          <span aria-hidden="true" className="mr-1 inline-block text-xs transition-transform group-open:rotate-90">▸</span>
                          {e.changes.length} field{e.changes.length > 1 ? 's' : ''} changed: {e.changes.map((c) => labelOf(e.collection, c.key)).join(', ')}
                        </summary>
                        <ul className="mt-2 space-y-2">
                          {e.changes.map((c) => (
                            <li key={c.key} className="rounded-box border border-white/10 p-3">
                              <p className="mono-label mb-1">{labelOf(e.collection, c.key)}</p>
                              <div className="grid gap-2 sm:grid-cols-2">
                                <p className="whitespace-pre-wrap break-words text-base-content/70 line-through decoration-white/30">{fmt(c.from)}</p>
                                <p className="whitespace-pre-wrap break-words font-medium">{fmt(c.to)}</p>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <Pagination page={data?.page ?? 1} pages={data?.pages ?? 1} onPage={setPage} />

      <Modal open={!!undo} onClose={() => setUndo(null)} title="Undo this change?">
        {undo && (
          <div className="space-y-4">
            <p>
              This will reverse <strong>{ACTION[undo.entry.action]?.label.toLowerCase()} {undo.entry.title}</strong>:{' '}
              {undo.entry.action === 'create' && 'the record will be removed.'}
              {undo.entry.action === 'delete' && 'the record will be put back exactly as it was.'}
              {undo.entry.action === 'import' && 'the records this import added are removed, and records it updated go back to their earlier values.'}
              {undo.entry.action === 'archive' && 'it will become visible to the bot again.'}
              {undo.entry.action === 'restore' && 'it will be hidden from the bot again.'}
              {undo.entry.action === 'update' && 'the changed fields go back to their earlier values.'}
            </p>
            {undo.conflict && (
              <p role="alert" className="text-sm text-warning">
                {undo.conflict} Undoing now will overwrite those later edits.
              </p>
            )}
            <div className="modal-action">
              <button className="btn" onClick={() => setUndo(null)}>Cancel</button>
              <button className={`btn ${undo.conflict ? 'btn-error' : 'btn-primary'}`} disabled={busy} onClick={() => doUndo(Boolean(undo.conflict))}>
                {busy && <span className="loading loading-spinner loading-sm" />} {undo.conflict ? 'Undo anyway' : 'Undo change'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
