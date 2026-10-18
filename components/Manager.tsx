'use client';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { COLLECTIONS, docIcon, emojiName, getPath, plain, type CollectionKey, type Doc, type Field } from '@/lib/schema';
import { EntityForm, hydrate } from './EntityForm';
import { Combobox } from './Combobox';
import { ChoiceIcon, useChoiceIcons } from './ChoiceIcon';
import { Icon } from './Icon';
import { BuildGuide, WeaponGuide } from './Guides';
import { useToast } from './Toast';

type Mode = { kind: 'view' | 'edit' | 'create' | 'delete' | 'archive' | 'restore'; doc?: Doc } | null;
type Change = { field: Field; from: unknown; to: unknown };
type Review = { kind: 'create' | 'edit'; values: Record<string, any>; changes: Change[] };

const isEmpty = (v: unknown) => v == null || v === '' || (Array.isArray(v) && v.length === 0);
/** Human-readable value for the review screens. */
function fmt(v: unknown): string {
  if (isEmpty(v)) return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.map((x) => plain(x) || String(x)).join(', ');
  return String(v);
}

export function Modal({ title, open, onClose, children, wide }: { title: string; open: boolean; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const tid = useId();
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="modal" onClose={() => { if (openRef.current) onClose(); }} aria-labelledby={tid}>
      <div data-lenis-prevent className={`modal-box ${wide ? 'max-w-3xl' : ''}`}>
        <h2 id={tid} className="mb-4 text-xl font-bold">{title}</h2>
        {open && children}
      </div>
      <form method="dialog" className="modal-backdrop"><button aria-label="Close dialog">close</button></form>
    </dialog>
  );
}

function ValueView({ f, v }: { f: Field; v: any }) {
  if (f.type === 'tags') return v?.length ? <div className="flex flex-wrap gap-1">{v.map((t: string) => <span key={t} className="badge">{plain(t) || t}</span>)}</div> : <span className="text-base-content/60">—</span>;
  if (f.type === 'boolean') return <p>{v ? 'Yes' : 'No'}</p>;
  return <p className="whitespace-pre-wrap break-words">{v === '' || v == null ? '—' : String(v)}</p>;
}

/* ---------- filter helpers ---------- */
const asLabel = (v: unknown): string => (typeof v === 'boolean' ? (v ? 'Yes' : 'No') : emojiName(String(v)));
/** Every value a record has for a filter key (arrays are flattened). */
function valuesOf(d: Doc, key: string): string[] {
  const v = getPath(d, key);
  if (v == null || v === '') return [];
  if (key === 'echo_set') {
    // set names only: no emoji, no piece count (X5), and a mixed set counts as each of its sets
    return [...new Set(String(v).replace(/<a?:\w+:\d+>/g, '').split('+').map((p) => p.replace(/\bX\d\b/gi, '').replace(/\s+/g, ' ').trim()).filter(Boolean))];
  }
  return (Array.isArray(v) ? v : [v]).map(asLabel);
}

/* ---------- pagination ---------- */
function pageList(page: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | '…')[] = [1];
  const lo = Math.max(2, page - 1), hi = Math.min(total - 1, page + 1);
  if (lo > 2) out.push('…');
  for (let i = lo; i <= hi; i++) out.push(i);
  if (hi < total - 1) out.push('…');
  out.push(total);
  return out;
}

export function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-center gap-2">
      <button className="btn btn-sm" disabled={page === 1} onClick={() => onPage(page - 1)}>← Previous</button>
      {pageList(page, pages).map((p, i) =>
        p === '…' ? <span key={`e${i}`} className="px-1 text-base-content/60" aria-hidden="true">…</span> : (
          <button key={p} className={`btn btn-sm btn-square ${p === page ? 'btn-primary' : 'btn-ghost'}`}
            aria-label={`Page ${p}`} aria-current={p === page ? 'page' : undefined} onClick={() => onPage(p)}>{p}</button>
        ))}
      <button className="btn btn-sm" disabled={page === pages} onClick={() => onPage(page + 1)}>Next →</button>
    </nav>
  );
}


/** Skills are grouped by their category field; builds stay a flat list. */
const SKILL_SECTIONS: [label: string, category: string][] = [
  ['Resonance Chain', 'Chain'], ['Passive Skills', 'Passive'], ['Active Skills', 'Active'], ['Concerto Skills', 'Concerto'],
];
const sectionOf = (d: Doc) => SKILL_SECTIONS.find(([, c]) => c === d.skill_category)?.[0] ?? 'Other Skills';

function GroupItems({ collection, items, title, actions }: {
  collection: CollectionKey; items: Doc[]; title: (d: Doc) => string; actions: (d: Doc, small?: boolean) => React.ReactNode;
}) {
  const row = (d: Doc) => (
    <li key={d._id} className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {collection === 'builds' ? title(d) : String(d.skill_type ?? '')}
          {collection === 'builds' && d.is_primary && <span className="badge badge-primary badge-sm ml-2">Primary</span>}
        </p>
        <p className="truncate text-sm text-base-content/60" title={collection === 'builds' ? plain(d.echo_set) : plain(d.name)}>
          {collection === 'builds' ? plain(d.role) || '—' : plain(d.name)}
        </p>
      </div>
      <div className="flex shrink-0">{actions(d, true)}</div>
    </li>
  );

  if (collection !== 'skills') return <ul className="divide-y divide-white/10">{items.map(row)}</ul>;

  const sections = [...SKILL_SECTIONS.map(([label]) => label), 'Other Skills']
    .map((s) => [s, items.filter((d) => sectionOf(d) === s).sort((a, b) => (a.order ?? 99) - (b.order ?? 99))] as const)
    .filter(([, rows]) => rows.length > 0);
  return (
    <div className="space-y-2">
      {sections.map(([name, rows]) => (
        <details key={name} className="group rounded-box border border-white/10 bg-white/[0.02]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 font-medium [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className="inline-block text-xs transition-transform group-open:rotate-90">▸</span>
              {name}
            </span>
            <span className="badge badge-sm">{rows.length}</span>
          </summary>
          <ul className="divide-y divide-white/10 px-3 pb-1">{rows.map(row)}</ul>
        </details>
      ))}
    </div>
  );
}

export function Manager({ collection }: { collection: CollectionKey }) {
  const cfg = COLLECTIONS[collection];
  const toast = useToast();
  const [rows, setRows] = useState<Doc[] | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'active' | 'archived'>('active');
  const [q, setQ] = useState('');
  const iconFor = useChoiceIcons();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const pageSize = cfg.groupBy ? 8 : 24;

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/${collection}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setRows(j); setError('');
    } catch (e: any) { setError(e.message); setRows([]); }
  }, [collection]);
  useEffect(() => { setRows(null); setFilters({}); setQ(''); setPage(1); load(); }, [load]);

  // Deep links from the Health page: ?q=<search> and ?edit=<record id>
  const pendingEdit = useRef<string | null>(null);
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const search = sp.get('q');
    if (search) setQ(search);
    pendingEdit.current = sp.get('edit');
  }, []);
  useEffect(() => {
    if (!rows || !pendingEdit.current) return;
    const d = rows.find((r) => String(r._id) === pendingEdit.current);
    pendingEdit.current = null;
    if (d) { if (d.archived) setTab('archived'); setMode({ kind: 'edit', doc: d }); }
  }, [rows]);

  const archivedCount = rows?.filter((r) => r.archived).length ?? 0;
  const tabRows = useMemo(() => (rows ?? []).filter((r) => !!r.archived === (tab === 'archived')), [rows, tab]);

  // Options for each filter come from the data in the current tab.
  const options = useMemo(() => Object.fromEntries((cfg.filters ?? []).map((f) => {
    const set = new Set<string>();
    tabRows.forEach((d) => valuesOf(d, f.key).forEach((v) => set.add(v)));
    return [f.key, [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))];
  })), [cfg, tabRows]);

  const visible = useMemo(() => {
    const t = q.trim().toLowerCase();
    return tabRows.filter((d) =>
      Object.entries(filters).every(([k, v]) => !v || valuesOf(d, k).includes(v)) &&
      (!t || JSON.stringify(d).toLowerCase().includes(t)));
  }, [tabRows, filters, q]);

  // Grouped modules show one card per resonator; paging counts cards, not records.
  const groups = useMemo(() => {
    if (!cfg.groupBy) return null;
    const m = new Map<string, Doc[]>();
    visible.forEach((d) => { const k = String(getPath(d, cfg.groupBy!) ?? 'Unassigned'); m.set(k, [...(m.get(k) ?? []), d]); });
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [visible, cfg.groupBy]);

  const total = groups ? groups.length : visible.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const cur = Math.min(page, pages);
  const from = total === 0 ? 0 : (cur - 1) * pageSize + 1;
  const to = Math.min(cur * pageSize, total);
  const activeFilters = Object.entries(filters).filter(([, v]) => v);
  const unit = groups ? 'resonators' : cfg.label.toLowerCase();

  const changePage = (p: number) => { setPage(p); topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const setFilter = (k: string, v: string) => { setFilters((s) => ({ ...s, [k]: v })); setPage(1); };
  const clearAll = () => { setFilters({}); setQ(''); setPage(1); };

  async function call(url: string, init: RequestInit, ok: string) {
    setBusy(true);
    try {
      const r = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Request failed');
      toast('success', ok); setMode(null); setReview(null); await load();
    } catch (e: any) { toast('error', e.message); }
    finally { setBusy(false); }
  }
  /** Form submit: nothing is written yet. Show a review first, and skip it entirely if nothing changed. */
  const save = (v: Record<string, any>) => {
    if (mode?.kind === 'create') { setReview({ kind: 'create', values: v, changes: [] }); return; }
    const before = hydrate(cfg.fields, mode!.doc);
    const changes: Change[] = cfg.fields
      .filter((f) => JSON.stringify(before[f.key]) !== JSON.stringify(v[f.key]))
      .map((f) => ({ field: f, from: before[f.key], to: v[f.key] }));
    if (changes.length === 0) { toast('info', 'No changes to save.'); return; }
    setReview({ kind: 'edit', values: v, changes });
  };
  const confirmSave = () => {
    if (!review) return;
    if (review.kind === 'create') {
      call(`/api/${collection}`, { method: 'POST', body: JSON.stringify(review.values) }, `${cfg.singular} added.`);
    } else {
      // Send only the fields that changed.
      const body = Object.fromEntries(review.changes.map((c) => [c.field.key, review.values[c.field.key]]));
      call(`/api/${collection}/${mode!.doc!._id}`, { method: 'PATCH', body: JSON.stringify(body) }, `${cfg.singular} updated.`);
    }
  };
  const setArchived = (d: Doc, archived: boolean) =>
    call(`/api/${collection}/${d._id}`, { method: 'PATCH', body: JSON.stringify({ archived }) },
      archived ? 'Archived. The bot will no longer show it.' : 'Restored.');
  const title = (d: Doc) => String(getPath(d, cfg.titleKey) ?? '');
  const summary = (d: Doc, key: string) => {
    const v = getPath(d, key);
    if (Array.isArray(v)) return `${v.length}`;
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    return v == null || v === '' ? '—' : plain(v).replace(/[*][*]/g, '');
  };

  const actions = (d: Doc, small = false) => {
    const b = small ? 'btn btn-xs btn-ghost' : 'btn btn-sm btn-ghost';
    return (
      <>
        <button className={b} aria-label={`View ${title(d)}`} onClick={() => setMode({ kind: 'view', doc: d })}>View</button>
        <button className={b} aria-label={`Edit ${title(d)}`} onClick={() => setMode({ kind: 'edit', doc: d })}>Edit</button>
        {d.archived ? (
          <>
            <button className={b} aria-label={`Restore ${title(d)}`} onClick={() => setMode({ kind: 'restore', doc: d })}>Restore</button>
            <button className={`${b} text-error`} aria-label={`Delete ${title(d)} permanently`} onClick={() => setMode({ kind: 'delete', doc: d })}>Delete</button>
          </>
        ) : (
          <button className={b} aria-label={`Archive ${title(d)}`} onClick={() => setMode({ kind: 'archive', doc: d })}>Archive</button>
        )}
      </>
    );
  };

  const pageGroups = groups?.slice((cur - 1) * pageSize, cur * pageSize);
  const pageRows = groups ? null : visible.slice((cur - 1) * pageSize, cur * pageSize);

  return (
    <div className="space-y-4">
      <div ref={topRef} className="flex flex-wrap items-end justify-between gap-4 scroll-mt-24">
        <div>
          <h1 className="text-3xl font-bold">{cfg.label}</h1>
          <p className="text-base-content/70">{cfg.blurb}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link className="btn" href={`/import?c=${collection}`}>Import</Link>
          <button className="btn btn-primary" onClick={() => setMode({ kind: 'create' })}>+ Add {cfg.singular.toLowerCase()}</button>
        </div>
      </div>

      {error && (
        <div role="alert" className="alert alert-error alert-vertical sm:alert-horizontal">
          <span>Could not load data: {error}</span>
          <button className="btn btn-sm" onClick={load}>Try again</button>
        </div>
      )}

      {/* Filter bar */}
      <section aria-label={`Filter ${cfg.label}`} className="card card-border bg-base-100">
        <div className="card-body gap-3 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div role="tablist" aria-label="Status" className="tabs tabs-box">
              <button role="tab" className={`tab ${tab === 'active' ? 'tab-active' : ''}`} aria-selected={tab === 'active'} onClick={() => { setTab('active'); setPage(1); }}>Active</button>
              <button role="tab" className={`tab ${tab === 'archived' ? 'tab-active' : ''}`} aria-selected={tab === 'archived'} onClick={() => { setTab('archived'); setPage(1); }}>Archived ({archivedCount})</button>
            </div>
            <label className="input input-bordered flex min-w-60 flex-1 items-center gap-2">
              <span className="sr-only">Search {cfg.label}</span>
              <input type="search" className="grow" placeholder={`Search ${cfg.label.toLowerCase()}…`} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
            </label>
          </div>

          {(cfg.filters?.length ?? 0) > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {cfg.filters!.map((f) => (
                (options[f.key] ?? []).length <= 10 ? (
                  <fieldset key={f.key} className="sm:col-span-2 lg:col-span-3">
                    <legend className="mono-label mb-1 block">{f.label}</legend>
                    <div role="radiogroup" aria-label={`Filter by ${f.label}`} className="flex flex-wrap gap-2">
                      {['', ...(options[f.key] ?? [])].map((o) => {
                        const on = (filters[f.key] ?? '') === o;
                        return (
                          <label key={o || 'all'} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-1.5 text-sm transition ${on ? 'border-primary bg-primary/15 font-semibold' : 'border-white/10 bg-white/5 hover:border-white/30'}`}>
                            <input type="radio" name={`flt-${f.key}`} className="radio radio-primary radio-xs" checked={on} onChange={() => setFilter(f.key, o)} />
                            <ChoiceIcon src={o ? iconFor(o, f.label) : undefined} />
                            {o || 'All'}
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                ) : (
                  <div key={f.key}>
                    <span id={`flt-${f.key}`} className="mono-label mb-1 block">{f.label}</span>
                    <Combobox aria-label={`Filter by ${f.label}`} value={filters[f.key] ?? ''} options={options[f.key] ?? []}
                      clearLabel="All" onChange={(v) => setFilter(f.key, v)} />
                  </div>
                )
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2" aria-live="polite">
            <p className="text-sm text-base-content/70">
              {rows ? (total === 0 ? `No ${unit} found` : `Showing ${from}–${to} of ${total} ${unit}${groups ? ` (${visible.length} ${cfg.label.toLowerCase()})` : ''}`) : 'Loading…'}
            </p>
            {activeFilters.map(([k, v]) => (
              <button key={k} className="badge badge-lg gap-1" onClick={() => setFilter(k, '')} aria-label={`Remove filter ${cfg.filters!.find((f) => f.key === k)?.label}: ${v}`}>
                {cfg.filters!.find((f) => f.key === k)?.label}: {v} <span aria-hidden="true">✕</span>
              </button>
            ))}
            {(activeFilters.length > 0 || q) && <button className="btn btn-ghost btn-sm" onClick={clearAll}>Clear all</button>}
          </div>
        </div>
      </section>

      <Pagination page={cur} pages={pages} onPage={changePage} />

      {rows === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-32" />)}</div>
      ) : total === 0 ? (
        <div className="rounded-box border border-dashed border-white/15 p-10 text-center">
          <p className="mb-3">{q || activeFilters.length ? 'Nothing matches your search and filters.' : tab === 'archived' ? 'No archived items.' : `No ${cfg.label.toLowerCase()} yet.`}</p>
          {(q || activeFilters.length > 0) ? <button className="btn btn-sm" onClick={clearAll}>Clear search and filters</button>
            : tab === 'active' && <button className="btn btn-primary btn-sm" onClick={() => setMode({ kind: 'create' })}>Add the first one</button>}
        </div>
      ) : pageGroups ? (
        <ul className="grid gap-4 lg:grid-cols-2">
          <AnimatePresence mode="popLayout" initial={false}>
            {pageGroups.map(([name, items]) => (
              <motion.li key={name} layout initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="card card-border bg-base-100">
                <div className="card-body gap-3 p-4">
                  <div className="flex items-center gap-3">
                    <Icon url={docIcon(collection, items[0])} label={name} />
                    <div className="min-w-0 flex-1">
                      <h2 className="card-title truncate text-lg">{name}</h2>
                      <p className="mono-label">{items.length} {items.length === 1 ? cfg.singular.toLowerCase() : cfg.label.toLowerCase()}</p>
                    </div>
                    <button className="btn btn-sm" aria-label={`Add ${cfg.singular.toLowerCase()} for ${name}`}
                      onClick={() => setMode({ kind: 'create', doc: { [cfg.groupBy!]: name } as Doc })}>+ Add</button>
                  </div>
                  <GroupItems collection={collection} items={items} title={title} actions={actions} />
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout" initial={false}>
            {pageRows!.map((d, i) => (
              <motion.li key={d._id} layout initial={{ opacity: 0, scale: 0.92, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0, transition: { delay: Math.min(i, 12) * 0.03 } }}
                exit={{ opacity: 0, scale: 0.9 }} whileHover={{ y: -3 }} className="card card-border bg-base-100">
                <div className="card-body gap-3 p-4">
                  <div className="flex items-center gap-3">
                    <Icon url={docIcon(collection, d)} label={title(d)} />
                    <div className="min-w-0">
                      <h2 className="card-title truncate text-lg">{title(d)}</h2>
                      {cfg.badge && d[cfg.badge] && <span className="badge badge-sm">{d[cfg.badge]}</span>}
                    </div>
                  </div>
                  <dl className="grid grid-cols-3 gap-2 text-sm">
                    {cfg.columns.map((c) => (
                      <div key={c.key}><dt className="text-base-content/60">{c.label}</dt><dd className="truncate font-medium">{summary(d, c.key)}</dd></div>
                    ))}
                  </dl>
                  <div className="card-actions justify-end">{actions(d)}</div>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      <Pagination page={cur} pages={pages} onPage={changePage} />

      <Modal wide open={mode?.kind === 'view'} onClose={() => setMode(null)} title={mode?.doc ? title(mode.doc) : ''}>
        {mode?.doc && (
          <div className="space-y-4">
            {collection === 'builds' ? <BuildGuide doc={mode.doc} />
              : collection === 'weapons' ? <WeaponGuide doc={mode.doc} />
              : cfg.fields.map((f) => (
                <div key={f.key}><div className="text-sm font-medium text-base-content/60">{f.label}</div><ValueView f={f} v={getPath(mode.doc!, f.key)} /></div>
              ))}
            <div className="modal-action">
              <button className="btn" onClick={() => setMode(null)}>Close</button>
              <button className="btn btn-primary" onClick={() => setMode({ kind: 'edit', doc: mode.doc })}>Edit</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal wide open={mode?.kind === 'edit' || mode?.kind === 'create'} onClose={() => setMode(null)}
        title={mode?.kind === 'create' ? `Add ${cfg.singular.toLowerCase()}` : `Edit ${mode?.doc ? title(mode.doc) : ''}`}>
        {(mode?.kind === 'edit' || mode?.kind === 'create') && (
          <EntityForm fields={cfg.fields} initial={mode.doc} busy={busy} submitLabel={mode.kind === 'create' ? 'Add' : 'Save changes'} onSubmit={save} onCancel={() => setMode(null)} />
        )}
      </Modal>

      <Modal open={mode?.kind === 'archive'} onClose={() => setMode(null)} title="Archive this item?">
        <p>
          <strong>{mode?.doc ? title(mode.doc) : ''}</strong> will be hidden from the bot right away. You can restore it any time from the Archived tab.
        </p>
        <div className="modal-action">
          <button className="btn" onClick={() => setMode(null)}>Cancel</button>
          <button className="btn btn-primary" disabled={busy} onClick={() => setArchived(mode!.doc!, true)}>
            {busy && <span className="loading loading-spinner loading-sm" />} Archive
          </button>
        </div>
      </Modal>

      <Modal open={mode?.kind === 'restore'} onClose={() => setMode(null)} title="Restore this item?">
        <p>
          <strong>{mode?.doc ? title(mode.doc) : ''}</strong> will become visible to the bot again right away.
        </p>
        <div className="modal-action">
          <button className="btn" onClick={() => setMode(null)}>Cancel</button>
          <button className="btn btn-primary" disabled={busy} onClick={() => setArchived(mode!.doc!, false)}>
            {busy && <span className="loading loading-spinner loading-sm" />} Restore
          </button>
        </div>
      </Modal>

      <Modal wide open={!!review} onClose={() => setReview(null)}
        title={review?.kind === 'create' ? `Review new ${cfg.singular.toLowerCase()}` : `Review changes to ${mode?.doc ? title(mode.doc) : ''}`}>
        {review && (
          <div className="space-y-4">
            {review.kind === 'create' ? (
              <>
                <p className="text-base-content/70">Check the details below. Nothing is saved until you confirm.</p>
                <div className="card card-border bg-base-100">
                  <div className="card-body gap-3 p-4">
                    <div className="flex items-center gap-3">
                      <Icon url={String(review.values.icon_url ?? '') || (cfg.iconResonatorKey ? docIcon(collection, { _id: '', [cfg.iconResonatorKey]: review.values[cfg.iconResonatorKey] }) : '')} label={String(review.values[cfg.titleKey] ?? '?')} />
                      <div className="min-w-0">
                        {cfg.subtitleKey && <p className="mono-label truncate">{String(review.values[cfg.subtitleKey] ?? '')}</p>}
                        <h3 className="card-title truncate text-lg">{String(review.values[cfg.titleKey] ?? '') || 'Untitled'}</h3>
                      </div>
                    </div>
                    <dl className="grid gap-3 sm:grid-cols-2">
                      {cfg.fields.filter((f) => f.key !== 'icon_url' && !isEmpty(review.values[f.key]) && review.values[f.key] !== false).map((f) => (
                        <div key={f.key} className={f.type === 'textarea' || f.type === 'tags' ? 'sm:col-span-2' : ''}>
                          <dt className="text-xs uppercase text-base-content/60">{f.label}</dt>
                          <dd className="whitespace-pre-wrap break-words">{fmt(review.values[f.key])}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </div>
              </>
            ) : (
              <>
                <p className="text-base-content/70">{review.changes.length} {review.changes.length === 1 ? 'field' : 'fields'} will change. Everything else stays as it is.</p>
                <ul className="space-y-3">
                  {review.changes.map((c) => (
                    <li key={c.field.key} className="rounded-box border border-white/10 p-3">
                      <p className="mono-label mb-2">{c.field.label}</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div><p className="text-xs text-base-content/60">Before</p><p className="whitespace-pre-wrap break-words text-base-content/70 line-through decoration-white/30">{fmt(c.from)}</p></div>
                        <div><p className="text-xs text-primary">After</p><p className="whitespace-pre-wrap break-words font-medium">{fmt(c.to)}</p></div>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="modal-action">
              <button className="btn" onClick={() => setReview(null)}>Back to editing</button>
              <button className="btn btn-primary" disabled={busy} onClick={confirmSave}>
                {busy && <span className="loading loading-spinner loading-sm" />} {review.kind === 'create' ? 'Confirm and add' : 'Confirm and save'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={mode?.kind === 'delete'} onClose={() => setMode(null)} title="Delete permanently?">
        <p>
          <strong>{mode?.doc ? title(mode.doc) : ''}</strong> will be removed from the database and cannot be recovered.
          Use Archive instead if you may want it back.
        </p>
        <div className="modal-action">
          <button className="btn" onClick={() => setMode(null)}>Cancel</button>
          <button className="btn btn-error" disabled={busy} onClick={() => call(`/api/${collection}/${mode!.doc!._id}`, { method: 'DELETE' }, 'Deleted.')}>Delete</button>
        </div>
      </Modal>
    </div>
  );
}
