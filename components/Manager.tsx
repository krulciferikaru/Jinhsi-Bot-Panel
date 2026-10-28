'use client';
import { ArchiveIcon, ChevronLeftIcon, ChevronRightIcon, ImportIcon, PencilIcon, PlusIcon, RestoreIcon, TrashIcon } from './Icons';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { COLLECTIONS, SKILL_CATEGORY_LABELS, docIcon, emojiName, getPath, plain, setPath, statLabel, type CollectionKey, type Doc, type Field } from '@/lib/schema';
import { EntityForm, hydrate } from './EntityForm';
import { Combobox } from './Combobox';
import { ChoiceIcon, useChoiceIcons } from './ChoiceIcon';
import { DocCard } from './DocCard';
import { EchoView, ResonatorView, SkillView } from './ViewPanels';
import { ActionMenu, type MenuItem } from './ActionMenu';
import { ListSkeleton } from './Skeletons';
import { FilterMenu } from './FilterMenu';
import { properSetName } from '@/lib/sets';
import { Icon } from './Icon';
import { BuildGuide, WeaponGuide } from './Guides';
import { useToast } from './Toast';
import { cacheGet, cacheSet, withViewTransition } from '@/lib/client-cache';
import { SetupLauncher } from './SetupLauncher';

type Mode = { kind: 'view' | 'edit' | 'create' | 'delete' | 'archive' | 'restore'; doc?: Doc } | null;
type Change = { field: Field; from: unknown; to: unknown };
type Review = { kind: 'create' | 'edit'; values: Record<string, any>; changes: Change[]; key: string };

const isEmpty = (v: unknown) => v == null || v === '' || (Array.isArray(v) && v.length === 0);
/** Human-readable value for the review screens. */
function fmt(v: unknown): string {
  if (isEmpty(v)) return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.map((x) => plain(x) || String(x)).join(', ');
  return String(v);
}

export function Modal({ title, open, onClose, children, wide, beforeClose }: { title: string; open: boolean; onClose: () => void; children: React.ReactNode; wide?: boolean; /** return true to keep the dialog open (for example while asking to discard changes) */ beforeClose?: () => boolean }) {
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
    <dialog ref={ref} className="modal" onCancel={(e) => { if (beforeClose?.()) e.preventDefault(); }} onClose={() => { if (openRef.current) onClose(); }} aria-labelledby={tid}>
      <div data-lenis-prevent className={`modal-box ${wide ? 'max-w-3xl' : ''}`}>
        <h2 id={tid} className="mb-4 text-xl font-bold">{title}</h2>
        {open && children}
      </div>
      <form method="dialog" className="modal-backdrop"><button tabIndex={-1} aria-label="Close dialog" onClick={(e) => { e.preventDefault(); if (!beforeClose?.()) onClose(); }}>close</button></form>
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
  if (key === 'sonata_effects') return [...new Set((Array.isArray(v) ? v : [v]).flatMap((x) => String(x).match(/<a?:\w+:\d+>/g) ?? [String(x)]).map((c) => properSetName(emojiName(c))))];
  if (key === 'skill_category') return [SKILL_CATEGORY_LABELS[String(v)] ?? String(v)];
  if (key === 'secondary_stat.title') return [statLabel(v, d.secondary_stat?.stats)];
  return (Array.isArray(v) ? v : [v]).map(asLabel);
}

/* ---------- pagination ---------- */
/**
 * Short lists show every page number. From three pages up it is compact: first page, "…", last page.
 * Clicking the "…" turns it into a small box to type a page number (Enter jumps, Escape or leaving cancels).
 * When you are on a middle page, that page number sits in the middle instead of "…".
 */
export function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const box = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);

  useEffect(() => { if (editing) { box.current?.focus(); box.current?.select(); } }, [editing]);
  useEffect(() => { if (!editing && refocus.current) { refocus.current = false; trigger.current?.focus(); } }, [editing]);
  if (pages <= 1) return null;

  const finish = (raw: string, jump: boolean) => {
    const n = Math.round(Number(raw));
    if (jump && raw.trim() && Number.isFinite(n)) {
      const target = Math.max(1, Math.min(pages, n));
      if (target !== page) onPage(target);
    }
    setEditing(false);
  };
  const num = (p: number) => (
    <button key={p} className={`btn btn-sm btn-square ${p === page ? 'btn-primary' : 'btn-ghost'}`}
      aria-label={`Page ${p}`} aria-current={p === page ? 'page' : undefined} onClick={() => onPage(p)}>{p}</button>
  );
  const middle = page > 1 && page < pages;

  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
      <button className="btn btn-sm pager-edge" disabled={page === 1} onClick={() => onPage(page - 1)}><ChevronLeftIcon />Previous</button>
      {pages < 3 ? Array.from({ length: pages }, (_, i) => num(i + 1)) : (
        <>
          {num(1)}
          {editing ? (
            <input
              ref={box} className="pager-input" type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" spellCheck={false}
              aria-label={`Go to page, 1 to ${pages}`} placeholder={`1–${pages}`} value={draft}
              onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, '').slice(0, 5))}
              onBlur={(e) => finish(e.currentTarget.value, false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); refocus.current = true; finish(e.currentTarget.value, true); }
                else if (e.key === 'Escape') { e.preventDefault(); refocus.current = true; finish('', false); }
              }}
            />
          ) : (
            <button
              ref={trigger} type="button"
              className={`btn btn-sm ${middle ? 'btn-primary btn-square' : 'btn-ghost btn-square'}`}
              aria-label={`Page ${page} of ${pages}. Type a page number`} aria-current={middle ? 'page' : undefined} title="Type a page number"
              onClick={() => { setDraft(''); setEditing(true); }}
            >
              {middle ? page : '…'}
            </button>
          )}
          {num(pages)}
        </>
      )}
      <button className="btn btn-sm pager-edge" disabled={page === pages} onClick={() => onPage(page + 1)}>Next<ChevronRightIcon /></button>
    </nav>
  );
}

/** Skills are grouped by their category field; builds stay a flat list. */
const SKILL_SECTIONS: [label: string, category: string][] = [
  ['Resonance Chain', 'Chain'], ['Passive Skills', 'Passive'], ['Active Skills', 'Active'], ['Concerto Skills', 'Concerto'],
];
const sectionOf = (d: Doc) => SKILL_SECTIONS.find(([, c]) => c === d.skill_category)?.[0] ?? 'Other Skills';

const GROUP_LIMIT = 3;

function GroupItems({ collection, items, title, onOpen, menuFor, dense }: {
  collection: CollectionKey; items: Doc[]; title: (d: Doc) => string; onOpen: (d: Doc) => void; menuFor: (d: Doc) => MenuItem[]; dense?: boolean;
}) {
  const iconFor = useChoiceIcons();
  const skillEmoji = (d: Doc) => { const m = /<a?:\w+:(\d+)>/.exec(String(d.emoji ?? '')); return m ? `https://cdn.discordapp.com/emojis/${m[1]}.png?size=64` : undefined; };
  const setsOf = (d: Doc) => plain(d.echo_set).split('+').map((p) => p.replace(/\bX\d\b/gi, '').trim()).filter(Boolean);
  const row = (d: Doc) => (
    <li key={d._id} className={`doc-row relative flex items-center justify-between gap-2 ${dense ? 'py-0.5' : 'py-2'}`}>
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-2 truncate font-medium">
          {collection === 'skills' && <ChoiceIcon src={skillEmoji(d)} />}
          {collection === 'builds' && <span className="flex shrink-0 items-center gap-1" aria-hidden="true">{setsOf(d).slice(0, 3).map((n) => <ChoiceIcon key={n} src={iconFor(n)} />)}</span>}
          <button type="button" className="doc-card-link" onClick={() => onOpen(d)}>
            {collection === 'builds' ? title(d) : String(d.skill_type ?? '')}
          </button>
          {collection === 'builds' && d.is_primary && <span className="badge badge-sm badge-primary ml-2 font-normal">Primary</span>}
        </p>
        <p className={`truncate text-sm text-base-content/60 ${dense ? 'sr-only' : ''}`} title={collection === 'builds' ? plain(d.echo_set) : plain(d.name)}>
          {collection === 'builds'
            ? [plain(d.role), setsOf(d).join(' + ')].filter(Boolean).join(' · ') || '—'
            : plain(d.name)}
        </p>
      </div>
      <div className="relative z-10 shrink-0"><ActionMenu label={`More actions for ${collection === 'builds' ? title(d) : String(d.skill_type ?? '')}`} items={menuFor(d)} /></div>
    </li>
  );

  const [all, setAll] = useState(false);
  if (collection !== 'skills') {
    const shown = all ? items : items.slice(0, GROUP_LIMIT);
    return (
      <div className="flex flex-1 flex-col">
        <ul className="group-list divide-y divide-white/10">{shown.map(row)}</ul>
        {items.length > GROUP_LIMIT && (
          <button type="button" className="mt-auto self-start pt-2 text-sm font-semibold text-primary hover:underline" aria-expanded={all} onClick={() => setAll((v) => !v)}>
            {all ? 'Show less' : `Show all ${items.length}`}
          </button>
        )}
      </div>
    );
  }

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

export function Manager({ collection, initialRows }: { collection: CollectionKey; initialRows?: Doc[] | null }) {
  const cfg = COLLECTIONS[collection];
  const toast = useToast();
  const [rows, setRows] = useState<Doc[] | null>(() => cacheGet<Doc[]>(`rows:${collection}`) ?? initialRows ?? null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'active' | 'archived'>('active');
  const [q, setQ] = useState('');
  const iconFor = useChoiceIcons();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  // the cost icons add nothing as filters; set and echo-set filters show their set emoji
  const filterIcon = (f: { key: string; label: string }, o: string) => (f.key === 'cost' ? undefined : iconFor(o, f.label));
  const setIcon = (f: { key: string }) => (f.key === 'sonata_effects' || f.key === 'echo_set' ? (o: string) => iconFor(o) : undefined);
  const [dense, setDense] = useState(false);
  const toggleDense = () => setDense((d) => { try { localStorage.setItem('panel.cardsDense', d ? '0' : '1'); } catch { /* private mode */ } return !d; });
  const [compact, setCompact] = useState(true);
  const setDensity = (c: boolean) => { setCompact(c); try { localStorage.setItem('panel.filtersCompact', c ? '1' : '0'); } catch { /* private mode */ } };
  const filtersId = useId();
  const toggleFilters = () => setFiltersOpen((o) => { try { localStorage.setItem('panel.filtersOpen', o ? '0' : '1'); } catch { /* private mode */ } return !o; });
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
      setRows(j); cacheSet(`rows:${collection}`, j); setError('');
    } catch (e: any) { setError(e.message); setRows([]); }
  }, [collection]);
  useEffect(() => {
    const cached = cacheGet<Doc[]>(`rows:${collection}`);
    if (!cached && initialRows) cacheSet(`rows:${collection}`, initialRows); // warm the cache from the server render
    setRows(cached ?? initialRows ?? null);
    setFilters({}); setQ(''); setPage(1); load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, collection]);

  // Deep links from the Health page: ?q=<search> and ?edit=<record id>
  const pendingEdit = useRef<string | null>(null);
  const urlReady = useRef(false);
  const firstParams = useRef<URLSearchParams | null>(null); // the address as it was on arrival, kept for the dev-mode double run of the effect below
  useEffect(() => {
    const sp = (firstParams.current ??= new URLSearchParams(window.location.search));
    const search = sp.get('q');
    if (search) setQ(search);
    if (sp.get('tab') === 'archived') setTab('archived');
    const p = Number(sp.get('page'));
    if (Number.isInteger(p) && p > 1) setPage(p);
    const fromUrl: Record<string, string> = {};
    for (const f of cfg.filters ?? []) { const v = sp.get(`f.${f.key}`); if (v) fromUrl[f.key] = v; }
    if (Object.keys(fromUrl).length) { setFilters(fromUrl); setFiltersOpen(true); }
    else { try { if (localStorage.getItem('panel.filtersOpen') === '1') setFiltersOpen(true); } catch { /* private mode */ } }
    try { if (localStorage.getItem('panel.filtersCompact') === '0') setCompact(false); } catch { /* private mode */ }
    try { if (localStorage.getItem('panel.cardsDense') === '1') setDense(true); } catch { /* private mode */ }
    pendingEdit.current = sp.get('edit');
    urlReady.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Keep the address bar in step with the list (without adding history entries).
  useEffect(() => {
    if (!urlReady.current) return;
    const sp = new URLSearchParams();
    if (q.trim()) sp.set('q', q.trim());
    if (tab === 'archived') sp.set('tab', 'archived');
    if (page > 1) sp.set('page', String(page));
    for (const [k, v] of Object.entries(filters)) if (v) sp.set(`f.${k}`, v);
    const qs = sp.toString();
    const next = window.location.pathname + (qs ? `?${qs}` : '');
    if (next !== window.location.pathname + window.location.search) window.history.replaceState(null, '', next);
  }, [q, tab, page, filters]);
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

  const changePage = (p: number) => { withViewTransition(() => setPage(p)); topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const setFilter = (k: string, v: string) => withViewTransition(() => { setFilters((s) => ({ ...s, [k]: v })); setPage(1); });
  const clearAll = () => { setFilters({}); setQ(''); setPage(1); };

  async function call(url: string, init: RequestInit, ok: string) {
    setBusy(true);
    try {
      const r = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init.headers } });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Request failed');
      toast('success', ok); setMode(null); setReview(null); await load();
    } catch (e: any) { toast('error', e.message); }
    finally { setBusy(false); }
  }
  /**
   * Apply the change to the on-screen list at once, then confirm it with the server in the background.
   * On failure the list snaps back and an error is shown, so a bad request never leaves the UI lying.
   */
  async function optimistic(mutate: (rows: Doc[]) => Doc[], url: string, init: RequestInit, ok: string) {
    const snapshot = rows;
    setRows((rs) => (rs ? mutate(rs) : rs));
    setMode(null); setReview(null);
    try {
      const r = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Request failed');
      toast('success', ok);
      load(); // quietly reconcile with the server's canonical copy (no skeleton flash)
    } catch (e: any) {
      setRows(snapshot ?? null); // roll back to exactly what was there before
      toast('error', e.message);
    }
  }

  /** Form submit: nothing is written yet. Show a review first, and skip it entirely if nothing changed. */
  const save = (v: Record<string, any>) => {
    if (mode?.kind === 'create') { setReview({ kind: 'create', values: v, changes: [], key: crypto.randomUUID() }); return; }
    const before = hydrate(cfg.fields, mode!.doc);
    const changes: Change[] = cfg.fields
      .filter((f) => JSON.stringify(before[f.key]) !== JSON.stringify(v[f.key]))
      .map((f) => ({ field: f, from: before[f.key], to: v[f.key] }));
    if (changes.length === 0) { toast('info', 'No changes to save.'); return; }
    setReview({ kind: 'edit', values: v, changes, key: crypto.randomUUID() });
  };
  const confirmSave = () => {
    if (!review) return;
    if (review.kind === 'create') {
      call(`/api/${collection}`, { method: 'POST', headers: { 'Idempotency-Key': review.key }, body: JSON.stringify(review.values) }, `${cfg.singular} added.`);
    } else {
      // Send only the fields that changed, and reflect them in the list straight away.
      const body = Object.fromEntries(review.changes.map((c) => [c.field.key, review.values[c.field.key]]));
      const id = mode!.doc!._id;
      optimistic(
        (rs) => rs.map((r) => (r._id === id ? review.changes.reduce<Doc>((acc, c) => setPath(acc, c.field.key, review.values[c.field.key]) as Doc, structuredClone(r) as Doc) : r)),
        `/api/${collection}/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, `${cfg.singular} updated.`);
    }
  };
  const setArchived = (d: Doc, archived: boolean) =>
    optimistic(
      (rs) => rs.map((r) => (r._id === d._id ? { ...r, archived } : r)),
      `/api/${collection}/${d._id}`, { method: 'PATCH', body: JSON.stringify({ archived }) },
      archived ? 'Archived. The bot will no longer show it.' : 'Restored.');
  const title = (d: Doc) => String(getPath(d, cfg.titleKey) ?? '');
  const summary = (d: Doc, key: string) => {
    const v = getPath(d, key);
    if (Array.isArray(v)) return `${v.length}`;
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    return v == null || v === '' ? '—' : plain(v).replace(/[*][*]/g, '');
  };

  const menuFor = (d: Doc): MenuItem[] => d.archived
    ? [
        { label: 'Edit', icon: <PencilIcon />, onSelect: () => setMode({ kind: 'edit', doc: d }) },
        { label: 'Restore', icon: <RestoreIcon />, onSelect: () => setMode({ kind: 'restore', doc: d }) },
        { label: 'Delete permanently', icon: <TrashIcon />, danger: true, separatorBefore: true, onSelect: () => setMode({ kind: 'delete', doc: d }) },
      ]
    : [
        { label: 'Edit', icon: <PencilIcon />, onSelect: () => setMode({ kind: 'edit', doc: d }) },
        { label: 'Archive', icon: <ArchiveIcon />, onSelect: () => setMode({ kind: 'archive', doc: d }) },
      ];
  const openView = (d: Doc) => setMode({ kind: 'view', doc: d });

  // Edits in the add/edit dialog are not thrown away silently: closing it by any route asks first.
  const [dirty, setDirty] = useState(false);
  const [askDiscard, setAskDiscard] = useState(false);
  useEffect(() => { setDirty(false); setAskDiscard(false); }, [mode?.kind, mode?.doc]);
  const guardClose = () => { if (dirty) { setAskDiscard(true); return true; } return false; };
  const closeForm = () => { if (!guardClose()) setMode(null); };

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
          {collection === 'resonators' && <SetupLauncher variant="button" />}
          <Link className="btn" href={`/import?c=${collection}`}><ImportIcon />Import</Link>
          <button className="btn btn-primary" onClick={() => setMode({ kind: 'create' })}><PlusIcon />Add {cfg.singular.toLowerCase()}</button>
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
              <button role="tab" className={`tab ${tab === 'active' ? 'tab-active' : ''}`} aria-selected={tab === 'active'} onClick={() => withViewTransition(() => { setTab('active'); setPage(1); })}>Active</button>
              <button role="tab" className={`tab ${tab === 'archived' ? 'tab-active' : ''}`} aria-selected={tab === 'archived'} onClick={() => withViewTransition(() => { setTab('archived'); setPage(1); })}>Archived ({archivedCount})</button>
            </div>
            <label className="input input-bordered flex min-w-60 flex-1 items-center gap-2">
              <span className="sr-only">Search {cfg.label}</span>
              <input type="search" className="grow" placeholder={`Search ${cfg.label.toLowerCase()}…`} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
            </label>
            <button type="button" className={`btn btn-square ${dense ? 'btn-active' : ''}`} aria-pressed={dense} aria-label="Compact cards" title={dense ? 'Compact cards: on' : 'Compact cards: off'} onClick={toggleDense}>
              {dense ? (
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 5h14M3 10h14M3 15h14" /></svg>
              ) : (
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><rect x="3" y="3" width="6" height="6" rx="1.2" /><rect x="11" y="3" width="6" height="6" rx="1.2" /><rect x="3" y="11" width="6" height="6" rx="1.2" /><rect x="11" y="11" width="6" height="6" rx="1.2" /></svg>
              )}
            </button>
            {(cfg.filters?.length ?? 0) > 0 && (
              <button type="button" className={`btn max-sm:px-3 ${filtersOpen ? 'btn-active' : ''}`} aria-expanded={filtersOpen} aria-controls={filtersId} aria-label={`Filters${Object.values(filters).filter(Boolean).length ? `, ${Object.values(filters).filter(Boolean).length} on` : ''}`} title="Filters" onClick={toggleFilters}>
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h14M6 10h8M8.5 15h3" /></svg>
                <span className="max-sm:hidden">Filters</span>
                {Object.values(filters).filter(Boolean).length > 0 && <span className="badge badge-sm badge-primary">{Object.values(filters).filter(Boolean).length}</span>}
                <svg aria-hidden="true" viewBox="0 0 20 20" className={`h-4 w-4 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 7.5l5 5 5-5" /></svg>
              </button>
            )}
          </div>

          {(cfg.filters?.length ?? 0) > 0 && (
            <div id={filtersId} className="reveal" data-open={filtersOpen} inert={!filtersOpen}>
            <div className="space-y-3 border-t border-white/10 pt-4">
              <div className="flex items-center justify-end gap-2">
                <span className="mono-label" id={`${filtersId}-density`}>View</span>
                <div role="group" aria-labelledby={`${filtersId}-density`} className="inline-flex rounded-full border border-white/10 bg-white/5 p-0.5">
                  {([['Compact', true], ['Expanded', false]] as const).map(([name, value]) => (
                    <button key={name} type="button" aria-pressed={compact === value} onClick={() => setDensity(value)}
                      className={`rounded-full px-3 py-1 text-sm transition ${compact === value ? 'bg-primary text-primary-content font-semibold' : 'text-base-content/70 hover:text-base-content'}`}>
                      {name}
                    </button>
                  ))}
                </div>
              </div>
              {compact ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:flex lg:flex-nowrap">
                  {cfg.filters!.map((f) => (
                    <div key={f.key} className="min-w-0 lg:w-52 lg:flex-1">
                      <span id={`flt-${f.key}`} className="mono-label mb-1 block truncate">{f.label}</span>
                      {(options[f.key] ?? []).length <= 10 ? (
                        <FilterMenu label={f.label} value={filters[f.key] ?? ''} options={options[f.key] ?? []} onChange={(v) => setFilter(f.key, v)} iconFor={(o) => filterIcon(f, o)} />
                      ) : (
                        <Combobox aria-label={`Filter by ${f.label}`} iconFor={setIcon(f)} value={filters[f.key] ?? ''} options={options[f.key] ?? []}
                          clearLabel="All" onChange={(v) => setFilter(f.key, v)} />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {cfg.filters!.map((f) => (
                    (options[f.key] ?? []).length <= 10 ? (
                      <fieldset key={f.key} className="min-w-0 sm:col-span-2 lg:col-span-3">
                        <legend className="mono-label mb-1 block">{f.label}</legend>
                        <div role="radiogroup" aria-label={`Filter by ${f.label}`} className="flex flex-wrap gap-2">
                          {['', ...(options[f.key] ?? [])].map((o) => {
                            const on = (filters[f.key] ?? '') === o;
                            return (
                              <label key={o || 'all'} className={`flex cursor-pointer items-center gap-1.5 rounded-xl border px-2.5 py-1 text-sm transition ${on ? 'border-primary bg-primary/15 font-semibold' : 'border-white/10 bg-white/5 hover:border-white/30'}`}>
                                <input type="radio" name={`flt-${f.key}`} className="radio radio-primary radio-xs" checked={on} onChange={() => setFilter(f.key, o)} />
                                <ChoiceIcon src={o ? filterIcon(f, o) : undefined} muted={!on} />
                                {o || 'All'}
                              </label>
                            );
                          })}
                        </div>
                      </fieldset>
                    ) : (
                      <div key={f.key} className="min-w-0">
                        <span className="mono-label mb-1 block">{f.label}</span>
                        <Combobox aria-label={`Filter by ${f.label}`} iconFor={setIcon(f)} value={filters[f.key] ?? ''} options={options[f.key] ?? []}
                          clearLabel="All" onChange={(v) => setFilter(f.key, v)} />
                      </div>
                    )
                  ))}
                </div>
              )}
            </div>
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
        <ListSkeleton grouped={!!cfg.groupBy} dense={dense} />
      ) : total === 0 ? (
        <div className="rounded-box border border-dashed border-white/15 p-10 text-center">
          <p className="mb-3">{q || activeFilters.length ? 'Nothing matches your search and filters.' : tab === 'archived' ? 'No archived items.' : `No ${cfg.label.toLowerCase()} yet.`}</p>
          {(q || activeFilters.length > 0) ? <button className="btn btn-sm" onClick={clearAll}>Clear search and filters</button>
            : tab === 'active' && <button className="btn btn-primary btn-sm" onClick={() => setMode({ kind: 'create' })}>Add the first one</button>}
        </div>
      ) : pageGroups ? (
        <ul className={`grid grid-cols-[minmax(0,1fr)] ${dense ? 'gap-3' : 'gap-4'} lg:grid-cols-2`}>
          <>
            {pageGroups.map(([name, items]) => (
              <motion.li key={name} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }} className="card card-border h-full bg-base-100">
                <div className={`card-body h-full ${dense ? 'gap-1 p-3' : 'gap-3 p-4'}`}>
                  <div className="flex items-center gap-3">
                    <Icon url={docIcon(collection, items[0])} label={name} size={dense ? 36 : 48} />
                    <div className="min-w-0 flex-1">
                      <h2 className="card-title truncate text-lg">{name}</h2>
                      <p className="mono-label">{items.length} {items.length === 1 ? cfg.singular.toLowerCase() : cfg.label.toLowerCase()}</p>
                    </div>
                    <button className="btn btn-sm" aria-label={`Add ${cfg.singular.toLowerCase()} for ${name}`}
                      onClick={() => setMode({ kind: 'create', doc: { [cfg.groupBy!]: name } as Doc })}><PlusIcon />Add</button>
                  </div>
                  <GroupItems collection={collection} items={items} title={title} onOpen={openView} menuFor={menuFor} dense={dense} />
                </div>
              </motion.li>
            ))}
          </>
        </ul>
      ) : (
        <ul className={`grid grid-cols-[minmax(0,1fr)] ${dense ? 'gap-3 sm:grid-cols-2 lg:grid-cols-4' : 'gap-4 sm:grid-cols-2 lg:grid-cols-3'}`}>
          <>
            {pageRows!.map((d, i) => (
              <motion.li key={d._id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }} className="card card-border h-full overflow-hidden bg-base-100 transition-colors hover:border-primary/40">
                <DocCard collection={collection} d={d} title={title(d)} onOpen={() => openView(d)} menu={menuFor(d)} dense={dense} />
              </motion.li>
            ))}
          </>
        </ul>
      )}

      <Pagination page={cur} pages={pages} onPage={changePage} />

      <Modal wide open={mode?.kind === 'view'} onClose={() => setMode(null)} title={cfg.singular}>
        {mode?.doc && (
          <div className="space-y-4">
            {collection === 'builds' ? <BuildGuide doc={mode.doc} />
              : collection === 'weapons' ? <WeaponGuide doc={mode.doc} />
              : collection === 'resonators' ? <ResonatorView doc={mode.doc} />
              : collection === 'echoes' ? <EchoView doc={mode.doc} />
              : collection === 'skills' ? <SkillView doc={mode.doc} />
              : cfg.fields.map((f) => (
                <div key={f.key}><div className="text-sm font-medium text-base-content/60">{f.label}</div><ValueView f={f} v={getPath(mode.doc!, f.key)} /></div>
              ))}
            <div className="modal-action">
              <button className="btn" onClick={() => setMode(null)}>Close</button>
              <button className="btn btn-primary" onClick={() => setMode({ kind: 'edit', doc: mode.doc })}><PencilIcon />Edit</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal wide open={mode?.kind === 'edit' || mode?.kind === 'create'} onClose={() => setMode(null)} beforeClose={guardClose}
        title={mode?.kind === 'create' ? `Add ${cfg.singular.toLowerCase()}` : `Edit ${mode?.doc ? title(mode.doc) : ''}`}>
        {(mode?.kind === 'edit' || mode?.kind === 'create') && (
          <EntityForm fields={cfg.fields} initial={mode.doc} busy={busy} submitLabel={mode.kind === 'create' ? `Add ${cfg.singular}` : 'Save changes'} onSubmit={save} onCancel={closeForm} onDirty={() => setDirty(true)} />
        )}
      </Modal>

      <Modal open={askDiscard} onClose={() => setAskDiscard(false)} title="Discard changes?">
        <p>You have changes that are not saved. If you close this now, they will be lost.</p>
        <div className="modal-action">
          <button className="btn" onClick={() => setAskDiscard(false)}>Keep editing</button>
          <button className="btn btn-error" onClick={() => { setAskDiscard(false); setDirty(false); setMode(null); }}><TrashIcon />Discard changes</button>
        </div>
      </Modal>

      <Modal open={mode?.kind === 'archive'} onClose={() => setMode(null)} title="Archive this item?">
        <p>
          <strong>{mode?.doc ? title(mode.doc) : ''}</strong> will be hidden from the bot right away. You can restore it any time from the Archived tab.
        </p>
        <div className="modal-action">
          <button className="btn" onClick={() => setMode(null)}>Cancel</button>
          <button className="btn btn-primary" disabled={busy} onClick={() => setArchived(mode!.doc!, true)}>
            {busy ? <span className="loading loading-spinner loading-sm" /> : <ArchiveIcon />} Archive
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
            {busy ? <span className="loading loading-spinner loading-sm" /> : <RestoreIcon />} Restore
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
          <button className="btn btn-error" disabled={busy} onClick={() => { const id = mode!.doc!._id; optimistic((rs) => rs.filter((r) => r._id !== id), `/api/${collection}/${id}`, { method: 'DELETE' }, 'Deleted.'); }}><TrashIcon />Delete</button>
        </div>
      </Modal>
    </div>
  );
}
