'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Combobox } from './Combobox';
import { Modal } from './Manager';
import { useToast } from './Toast';
import { COLLECTIONS, COLLECTION_KEYS, isCollection, type CollectionKey } from '@/lib/schema';
import { MAX_IMPORT_ROWS, headerReport, parseCsv, templateCsv } from '@/lib/import';

type Status = 'new' | 'update' | 'skip' | 'incomplete' | 'error';
type RowResult = { index: number; status: Status; title: string; message: string };
type Preview = { results: RowResult[]; counts: Record<Status, number> };
type Mode = 'skip' | 'update';

const BADGE: Record<Status, { label: string; cls: string }> = {
  new: { label: 'New', cls: 'badge-success' },
  update: { label: 'Update', cls: 'badge-info' },
  skip: { label: 'Skip', cls: 'badge-ghost' },
  incomplete: { label: 'Not filled in', cls: 'badge-warning' },
  error: { label: 'Problem', cls: 'badge-error' },
};
const LABELS = COLLECTION_KEYS.map((k) => COLLECTIONS[k].label);
const keyOfLabel = (l: string) => COLLECTION_KEYS.find((k) => COLLECTIONS[k].label === l);

/** JSON (array of objects) or CSV, decided by the first character. */
function parseInput(text: string): { rows: Record<string, unknown>[]; error?: string } {
  const t = text.trim();
  if (!t) return { rows: [] };
  if (t.startsWith('[') || t.startsWith('{')) {
    try {
      const j = JSON.parse(t);
      const rows = Array.isArray(j) ? j : Array.isArray(j?.rows) ? j.rows : null;
      if (!rows) return { rows: [], error: 'JSON must be a list of records, like [{"name": "…"}].' };
      return { rows };
    } catch { return { rows: [], error: 'That is not valid JSON.' }; }
  }
  const rows = parseCsv(t);
  return rows.length ? { rows } : { rows: [], error: 'No data rows found. The first line must be the column headers, followed by at least one row.' };
}

export function ImportTool() {
  const toast = useToast();
  const [collection, setCollection] = useState<CollectionKey>('resonators');
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [mode, setMode] = useState<Mode>('skip');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [leaveOut, setLeaveOut] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ created: number; updated: number; skipped: number; incomplete?: number; invalid: number; failures: { index: number; message: string }[] } | null>(null);
  const seq = useRef(0);
  const applyKey = useRef(crypto.randomUUID()); // one key per preview; a retry reuses it so the import is not applied twice

  // honour /import?c=echoes
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get('c');
    if (c && isCollection(c)) setCollection(c);
  }, []);

  const parsed = useMemo(() => parseInput(text), [text]);
  const rows = parsed.rows;
  const headers = useMemo(() => (rows.length ? Object.keys(rows[0]) : []), [rows]);
  const report = useMemo(() => (headers.length ? headerReport(collection, headers) : null), [headers, collection]);

  // Ask the server what would happen (it is the real validator), whenever the input or options change.
  useEffect(() => {
    setDone(null);
    if (parsed.error) { setError(parsed.error); setPreview(null); return; }
    if (!rows.length) { setError(''); setPreview(null); return; }
    if (rows.length > MAX_IMPORT_ROWS) { setError(`That file has ${rows.length} rows. Import at most ${MAX_IMPORT_ROWS} at a time.`); setPreview(null); return; }
    const mine = ++seq.current;
    setChecking(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch('/api/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ collection, rows, mode, dryRun: true }) });
        const j = await r.json();
        if (mine !== seq.current) return;
        if (!r.ok) throw new Error(j.error);
        setPreview(j); applyKey.current = crypto.randomUUID(); setError('');
      } catch (e: any) { if (mine === seq.current) { setError(e.message); setPreview(null); } }
      finally { if (mine === seq.current) setChecking(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [rows, parsed.error, collection, mode]);

  async function onFile(f: File | null) {
    setFileName(f?.name ?? '');
    if (!f) { setText(''); return; }
    if (f.size > 5 * 1024 * 1024) { setError('That file is larger than 5 MB.'); return; }
    const bytes = new Uint8Array(await f.arrayBuffer());
    // .xlsx / .xls / .ods are zip or OLE containers, not text: they cannot be read as a CSV.
    const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
    const isOle = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
    if (isZip || isOle) {
      setText(''); setFileName('');
      setError('That looks like an Excel file (.xlsx), not a CSV. In Excel choose File → Save As, pick “CSV UTF-8 (Comma delimited)”, and load the saved .csv file instead.');
      return;
    }
    // Excel's "Unicode Text" is UTF-16; everything else is read as UTF-8 (a leading BOM is dropped by the parser).
    const label = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8';
    setText(new TextDecoder(label).decode(bytes));
  }

  function downloadTemplate() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([templateCsv(collection)], { type: 'text/csv;charset=utf-8' }));
    a.download = `${collection}-template.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const c = preview?.counts;
  const writes = c ? c.new + (mode === 'update' ? c.update : 0) : 0;
  const hasProblems = !!c && c.error > 0;
  // Which required columns the unfinished rows are missing, e.g. "Skill name ×252".
  const missingSummary = useMemo(() => {
    const n = new Map<string, number>();
    (preview?.results ?? []).filter((r) => r.status === 'incomplete').forEach((r) =>
      r.message.split('. ').forEach((m) => { const label = m.replace(/:? ?required\.?$/, '').trim(); if (label) n.set(label, (n.get(label) ?? 0) + 1); }));
    return [...n.entries()].map(([k, v]) => `${k} ×${v}`).join(', ');
  }, [preview]);
  const canImport = !!c && writes > 0 && (!hasProblems || leaveOut) && !busy && !checking;
  const shown = (preview?.results ?? []).filter((r) => !onlyProblems || r.status === 'error' || r.status === 'incomplete');

  async function run() {
    setBusy(true);
    try {
      const r = await fetch('/api/import', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': applyKey.current }, body: JSON.stringify({ collection, rows, mode, skipInvalid: leaveOut }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Import failed');
      setDone(j); setConfirm(false); setText(''); setFileName(''); setPreview(null);
      toast('success', `Imported: ${j.created} added, ${j.updated} updated.`);
    } catch (e: any) { toast('error', e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Import</h1>
        <p className="text-base-content/70">Add or update many records from CSV or JSON, with a preview first.</p>
      </div>

      <section aria-labelledby="s1" className="card card-border bg-base-100">
        <div className="card-body gap-4">
          <h2 id="s1" className="card-title">1. Pick what to import</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className="mb-1 block text-sm font-medium">Collection</span>
              <Combobox aria-label="Collection" value={COLLECTIONS[collection].label} options={LABELS} onChange={(l) => { const k = keyOfLabel(l); if (k) setCollection(k); }} />
            </div>
            <div className="flex items-end">
              <button className="btn" onClick={downloadTemplate}>Download {COLLECTIONS[collection].label.toLowerCase()} template (CSV)</button>
            </div>
          </div>
          <p className="text-sm text-base-content/60">
            The template has one column per field, plus an example row of real data. Open it in Excel or Google Sheets, add your rows, and save as CSV.
            List fields (like shortcuts) use <code>|</code> between items; yes/no fields take <code>yes</code> or <code>no</code>.
            {(collection === 'builds' || collection === 'skills') && <> The resonator must already exist, so import resonators first.</>}
          </p>
        </div>
      </section>

      <section aria-labelledby="s2" className="card card-border bg-base-100">
        <div className="card-body gap-4">
          <h2 id="s2" className="card-title">2. Add your data</h2>
          <div>
            <label htmlFor="imp-file" className="mb-1 block text-sm font-medium">CSV or JSON file</label>
            <input id="imp-file" type="file" accept=".csv,.json,.txt,text/csv,application/json" className="file-input file-input-bordered w-full max-w-lg"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
          </div>
          <div>
            <label htmlFor="imp-text" className="mb-1 block text-sm font-medium">…or paste it here {fileName && <span className="text-base-content/60">(loaded from {fileName})</span>}</label>
            <textarea id="imp-text" className="textarea textarea-bordered min-h-32 w-full font-mono text-xs" value={text}
              placeholder={'name,element,weapon_type,rarity\nCamellya,Havoc,Sword,5'} onChange={(e) => { setText(e.target.value); setFileName(''); }} />
          </div>
          {error && <p role="alert" className="text-sm text-error">{error}</p>}
          {report && (
            <div className="space-y-1 text-sm" aria-live="polite">
              <p className="text-base-content/70">Using {report.used.length} column{report.used.length === 1 ? '' : 's'}: {report.used.map((u) => u.header).join(', ')}</p>
              {report.ignored.length > 0 && <p className="text-warning">Ignored (no matching field): {report.ignored.join(', ')}. Check the spelling against the template.</p>}
              {report.missingRequired.length > 0 && <p className="text-error">No column for {report.missingRequired.join(', ')}. That is fine for updating existing records, but new records need {report.missingRequired.length > 1 ? 'them' : 'it'}.</p>}
            </div>
          )}
        </div>
      </section>

      {(preview || checking) && (
        <section aria-labelledby="s3" className="card card-border bg-base-100">
          <div className="card-body gap-4">
            <h2 id="s3" className="card-title">3. Review {checking && <span className="loading loading-spinner loading-sm" />}</h2>
            {c && (
              <div className="flex flex-wrap items-center gap-2" aria-live="polite">
                {(['new', 'update', 'skip', 'incomplete', 'error'] as const).map((s) => (
                  <span key={s} className={`badge badge-lg ${c[s] ? BADGE[s].cls : 'badge-ghost opacity-50'}`}>{c[s]} {BADGE[s].label.toLowerCase()}</span>
                ))}
                {(hasProblems || (c.incomplete ?? 0) > 0) && (
                  <label className="ml-2 flex cursor-pointer items-center gap-2 text-sm">
                    <input type="checkbox" className="checkbox checkbox-sm" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} /> Show only rows that need attention
                  </label>
                )}
              </div>
            )}

            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium">Records that already exist</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {([['skip', 'Skip them', 'Leave existing records exactly as they are.'], ['update', 'Update them', 'Change only the columns present in your file.']] as const).map(([v, t, h]) => (
                  <label key={v} className={`flex cursor-pointer items-start gap-3 rounded-box border p-3 ${mode === v ? 'border-primary/60 bg-primary/5' : 'border-white/10'}`}>
                    <input type="radio" name="imp-mode" className="radio radio-primary mt-0.5" checked={mode === v} onChange={() => setMode(v)} />
                    <span><span className="block text-sm font-medium">{t}</span><span className="block text-xs text-base-content/60">{h}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>

            {preview && (
              <div className="max-h-[50vh] overflow-auto rounded-box border border-white/10" data-lenis-prevent>
                <table className="table table-sm">
                  <thead className="sticky top-0 bg-base-100"><tr><th>Row</th><th>Record</th><th>Result</th></tr></thead>
                  <tbody>
                    {shown.slice(0, 300).map((r) => (
                      <tr key={r.index}>
                        <td className="text-base-content/60">{r.index + 1}</td>
                        <td className="font-medium">{r.title}</td>
                        <td><span className={`badge badge-sm mr-2 ${BADGE[r.status].cls}`}>{BADGE[r.status].label}</span><span className={r.status === 'error' ? 'text-error' : r.status === 'incomplete' ? 'text-warning' : 'text-base-content/70'}>{r.message}</span></td>
                      </tr>
                    ))}
                    {shown.length === 0 && <tr><td colSpan={3} className="text-center text-base-content/60">Nothing to show.</td></tr>}
                  </tbody>
                </table>
                {shown.length > 300 && <p className="p-3 text-sm text-base-content/60">Showing the first 300 of {shown.length} rows.</p>}
              </div>
            )}

            {(c?.incomplete ?? 0) > 0 && (
              <p role="status" className="rounded-box border border-warning/40 p-3 text-sm">
                <strong>{c!.incomplete}</strong> row{c!.incomplete === 1 ? ' is' : 's are'} not filled in yet (a required column is empty), so {c!.incomplete === 1 ? 'it is' : 'they are'} left out automatically.
                Fill them in and import the file again whenever you like: rows that are already in the database are skipped.
              </p>
            )}

            {hasProblems && (
              <label className="flex cursor-pointer items-start gap-3">
                <input type="checkbox" className="toggle toggle-primary mt-0.5" checked={leaveOut} onChange={(e) => setLeaveOut(e.target.checked)} />
                <span className="text-sm">{c!.error} row{c!.error === 1 ? ' has a problem' : 's have problems'}. Import the other rows and leave these out.</span>
              </label>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button className="btn btn-primary" disabled={!canImport} onClick={() => setConfirm(true)}>
                Import {writes || ''} record{writes === 1 ? '' : 's'}…
              </button>
              {c && writes === 0 && !hasProblems && (c.incomplete ?? 0) === 0 && <p className="text-sm text-base-content/60">Nothing to import: every row already exists{mode === 'skip' ? ' (switch to “Update them” to change them)' : ''}.</p>}
              {c && writes === 0 && !hasProblems && (c.incomplete ?? 0) > 0 && (
                <p role="status" className="text-sm text-warning">
                  Nothing to import yet. All {c.incomplete} row{c.incomplete === 1 ? ' is' : 's are'} missing a required value
                  {missingSummary ? <> ({missingSummary})</> : null}. Fill that column in your file, save it as CSV, and load it again.
                </p>
              )}
              {hasProblems && !leaveOut && <p role="status" className="text-sm text-warning">The Import button stays off because {c!.error} row{c!.error === 1 ? ' has a problem' : 's have problems'}. Fix {c!.error === 1 ? 'it' : 'them'} in your file, or switch on “leave these out” above.</p>}
            </div>
          </div>
        </section>
      )}

      {done && (
        <section role="status" className="card card-border bg-base-100">
          <div className="card-body gap-2">
            <h2 className="card-title">Import finished</h2>
            <p>{done.created} added, {done.updated} updated, {done.skipped} skipped{done.incomplete ? `, ${done.incomplete} not filled in` : ''}{done.invalid ? `, ${done.invalid} invalid rows left out` : ''}.</p>
            {done.failures.length > 0 && (
              <ul className="text-sm text-error">{done.failures.slice(0, 10).map((f) => <li key={f.index}>Row {f.index + 1}: {f.message}</li>)}</ul>
            )}
            <p className="text-sm text-base-content/70">Changed your mind? The whole import is one entry on the <Link className="link" href="/activity">Activity page</Link> and can be undone there.</p>
            <div className="card-actions"><Link className="btn btn-sm" href={`/${collection}`}>View {COLLECTIONS[collection].label.toLowerCase()}</Link></div>
          </div>
        </section>
      )}

      <Modal open={confirm} onClose={() => setConfirm(false)} title="Import these records?">
        {c && (
          <div className="space-y-4">
            <p>
              This will add <strong>{c.new}</strong> {COLLECTIONS[collection].label.toLowerCase()}
              {mode === 'update' && <> and update <strong>{c.update}</strong> existing</>}.
              {c.skip > 0 && mode === 'skip' && <> {c.skip} existing {c.skip === 1 ? 'record is' : 'records are'} skipped.</>}
              {(c.incomplete ?? 0) > 0 && <> {c.incomplete} unfinished row{c.incomplete === 1 ? ' is' : 's are'} left out.</>}
              {hasProblems && <> {c.error} invalid row{c.error === 1 ? ' is' : 's are'} left out.</>}
            </p>
            <p className="text-sm text-base-content/60">It goes live in the bot right away, and you can undo the whole import from the Activity page.</p>
            <div className="modal-action">
              <button className="btn" onClick={() => setConfirm(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={busy} onClick={run}>
                {busy && <span className="loading loading-spinner loading-sm" />} Import
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
