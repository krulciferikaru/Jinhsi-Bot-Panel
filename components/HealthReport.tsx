'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Combobox } from './Combobox';
import { COLLECTIONS, type CollectionKey } from '@/lib/schema';

type Severity = 'error' | 'warning' | 'info';
type Issue = { id: string; severity: Severity; check: string; area: string; title: string; message: string; href?: string };
type Report = { scannedAt: string; issues: Issue[]; notes: string[]; totals: Record<Severity, number>; scanned: Record<string, number> };

const SEV: Record<Severity, { label: string; plural: string; badge: string; tile: string; hint: string }> = {
  error: { label: 'Error', plural: 'Errors', badge: 'badge-error', tile: 'text-error', hint: 'Broken for players. Fix first.' },
  warning: { label: 'Warning', plural: 'Warnings', badge: 'badge-warning', tile: 'text-warning', hint: 'Missing content the bot could show.' },
  info: { label: 'Note', plural: 'Notes', badge: 'badge-info', tile: 'text-info', hint: 'Housekeeping, safe to ignore.' },
};
const ORDER: Severity[] = ['error', 'warning', 'info'];
const GROUP_PREVIEW = 20;

const areaLabel = (a: string) => (a === 'assets' ? 'Assets' : COLLECTIONS[a as CollectionKey]?.label ?? a);
const AREAS: [string, string][] = [...(Object.keys(COLLECTIONS) as CollectionKey[]).map((k) => [COLLECTIONS[k].label, k] as [string, string]), ['Assets', 'assets']];

export function HealthReport() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [sev, setSev] = useState<'' | Severity>('');
  const [area, setArea] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const run = useCallback(async () => {
    setRunning(true);
    try {
      const r = await fetch('/api/health', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setReport(j); setError(''); setExpanded(new Set());
    } catch (e: any) { setError(e.message); }
    finally { setRunning(false); }
  }, []);
  useEffect(() => { run(); }, [run]);

  const visible = useMemo(
    () => (report?.issues ?? []).filter((i) => (!sev || i.severity === sev) && (!area || i.area === area)),
    [report, sev, area],
  );

  // group by check, ordered by severity then size
  const groups = useMemo(() => {
    const m = new Map<string, Issue[]>();
    visible.forEach((i) => m.set(`${i.severity}|${i.check}`, [...(m.get(`${i.severity}|${i.check}`) ?? []), i]));
    return [...m.entries()]
      .map(([k, items]) => ({ key: k, severity: items[0].severity, check: items[0].check, items }))
      .sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity) || b.items.length - a.items.length);
  }, [visible]);

  const total = report ? report.totals.error + report.totals.warning + report.totals.info : 0;
  const clean = report && report.totals.error === 0 && report.totals.warning === 0;
  const areaLabelValue = AREAS.find(([, v]) => v === area)?.[0] ?? '';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Health</h1>
          <p className="text-base-content/70">A scan of your records and icon repository for things that are broken, missing or unused.</p>
        </div>
        <button className="btn btn-primary" disabled={running} onClick={run}>
          {running && <span className="loading loading-spinner loading-sm" />} {running ? 'Scanning…' : 'Scan again'}
        </button>
      </div>

      {error && (
        <div role="alert" className="alert alert-error alert-vertical sm:alert-horizontal">
          <span>Scan failed: {error}</span><button className="btn btn-sm" onClick={run}>Try again</button>
        </div>
      )}
      {report?.notes.map((n) => <div key={n} role="status" className="alert alert-warning"><span>{n}</span></div>)}

      {/* Summary tiles double as severity filters */}
      <ul className="grid gap-3 sm:grid-cols-3">
        {ORDER.map((s) => {
          const on = sev === s;
          return (
            <li key={s}>
              <button type="button" aria-pressed={on} onClick={() => setSev(on ? '' : s)}
                className={`card card-border bg-base-100 w-full text-left transition ${on ? 'border-primary!' : ''}`}>
                <div className="card-body gap-1 p-4">
                  <p className="mono-label">{SEV[s].plural}</p>
                  <p className={`text-4xl font-semibold ${report?.totals[s] ? SEV[s].tile : ''}`}>{report ? report.totals[s] : '–'}</p>
                  <p className="text-sm text-base-content/60">{SEV[s].hint}</p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-56">
          <Combobox aria-label="Filter by area" value={areaLabelValue} options={AREAS.map(([l]) => l)} clearLabel="All areas"
            onChange={(l) => setArea(AREAS.find(([x]) => x === l)?.[1] ?? '')} />
        </div>
        {(sev || area) && <button className="btn btn-ghost btn-sm" onClick={() => { setSev(''); setArea(''); }}>Clear filters</button>}
        <p className="text-sm text-base-content/60" aria-live="polite">
          {!report ? 'Scanning…' : `${visible.length} of ${total} issue${total === 1 ? '' : 's'} shown`}
          {report && ` · scanned ${Object.entries(report.scanned).map(([k, v]) => `${v} ${areaLabel(k).toLowerCase()}`).join(', ')} at ${new Date(report.scannedAt).toLocaleTimeString()}`}
        </p>
      </div>

      {!report ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-24" />)}</div>
      ) : visible.length === 0 ? (
        <div className="rounded-box border border-dashed border-white/15 p-10 text-center">
          <p className="text-lg font-semibold">{total === 0 ? 'Everything looks healthy.' : 'No issues match these filters.'}</p>
          {total === 0 && <p className="text-base-content/60">No broken links, missing details or unused images were found.</p>}
        </div>
      ) : (
        <>
          {clean && sev === '' && area === '' && (
            <p role="status" className="rounded-box border border-white/10 p-4 text-base-content/70">No errors or warnings. Only housekeeping notes remain.</p>
          )}
          <div className="space-y-3">
            {groups.map((g) => {
              const all = expanded.has(g.key);
              const shown = all ? g.items : g.items.slice(0, GROUP_PREVIEW);
              return (
                <details key={g.key} className="group card card-border bg-base-100" open={g.severity !== 'info'}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                    <span className="flex min-w-0 items-center gap-3">
                      <span aria-hidden="true" className="inline-block text-xs transition-transform group-open:rotate-90">▸</span>
                      <span className={`badge ${SEV[g.severity].badge}`}>{SEV[g.severity].label}</span>
                      <span className="truncate font-semibold">{g.check}</span>
                    </span>
                    <span className="badge badge-ghost">{g.items.length}</span>
                  </summary>
                  <ul className="divide-y divide-white/10 px-4 pb-2">
                    {shown.map((i) => (
                      <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{i.title} <span className="mono-label ml-1">{areaLabel(i.area)}</span></p>
                          <p className="text-sm text-base-content/60">{i.message}</p>
                        </div>
                        {i.href && <Link href={i.href} className="btn btn-sm">{i.area === 'assets' ? 'View' : 'Fix'}</Link>}
                      </li>
                    ))}
                  </ul>
                  {g.items.length > GROUP_PREVIEW && (
                    <div className="px-4 pb-3">
                      <button className="btn btn-ghost btn-sm" onClick={() => setExpanded((s) => { const n = new Set(s); all ? n.delete(g.key) : n.add(g.key); return n; })}>
                        {all ? 'Show fewer' : `Show all ${g.items.length}`}
                      </button>
                    </div>
                  )}
                </details>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
