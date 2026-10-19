'use client';
import { useState } from 'react';
import { Modal } from './Manager';
import { useToast } from './Toast';
import { COLLECTIONS, type CollectionKey } from '@/lib/schema';

type Row = { collection: CollectionKey; inFile: number; add: number; changed: number; same: number };
type Preview = { summary: Row[]; samples: Record<string, { add: string[]; changed: string[] }> };
type Mode = 'missing' | 'overwrite';

export function BackupPanel() {
  const toast = useToast();
  const [file, setFile] = useState<any>(null);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mode, setMode] = useState<Mode>('missing');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  async function pick(f: File | null) {
    setFile(null); setPreview(null); setError(''); setFileName(f?.name ?? '');
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) { setError('That file is larger than 25 MB.'); return; }
    let parsed: any;
    try { parsed = JSON.parse(await f.text()); } catch { setError('That file is not valid JSON.'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/backup/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: parsed, mode, dryRun: true }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setFile(parsed); setPreview(j);
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function restore() {
    setBusy(true);
    try {
      const r = await fetch('/api/backup/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file, mode }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      toast('success', `Restored: ${j.added} added${mode === 'overwrite' ? `, ${j.replaced} overwritten` : ''}.`);
      setConfirm(false); setFile(null); setPreview(null); setFileName('');
    } catch (e: any) { toast('error', e.message); }
    finally { setBusy(false); }
  }

  const totals = preview?.summary.reduce((a, r) => ({ add: a.add + r.add, changed: a.changed + r.changed }), { add: 0, changed: 0 });
  const nothingToDo = preview && totals && totals.add === 0 && (mode === 'missing' || totals.changed === 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Backup</h1>
        <p className="text-base-content/70">Save a copy of your data, or restore one.</p>
      </div>

      <section aria-labelledby="dl-h" className="card card-border bg-base-100">
        <div className="card-body gap-3">
          <h2 id="dl-h" className="card-title">Download a backup</h2>
          <p className="text-base-content/70">
            One JSON file with all resonators, echoes, weapons, builds and skills, including archived ones. It does not include icons (those live in your GitHub repository) or the activity log.
          </p>
          <div><a className="btn btn-primary" href="/api/backup" download>Download backup</a></div>
        </div>
      </section>

      <section aria-labelledby="rs-h" className="card card-border bg-base-100">
        <div className="card-body gap-4">
          <h2 id="rs-h" className="card-title">Restore from a backup</h2>
          <p className="text-base-content/70">Choose a file to see what would change. Nothing is written until you confirm, and records are never deleted.</p>
          <div>
            <label htmlFor="bk-file" className="mb-1 block text-sm font-medium">Backup file</label>
            <input id="bk-file" type="file" accept="application/json,.json" className="file-input file-input-bordered w-full max-w-lg"
              onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          </div>

          {busy && !preview && <p className="text-sm text-base-content/60"><span className="loading loading-spinner loading-sm mr-2" />Checking {fileName}…</p>}
          {error && <p role="alert" className="text-sm text-error">{error}</p>}

          {preview && (
            <div className="space-y-4">
              <div className="overflow-x-auto rounded-box border border-white/10">
                <table className="table">
                  <thead><tr><th>Collection</th><th>In file</th><th>New</th><th>Changed</th><th>Same</th></tr></thead>
                  <tbody>
                    {preview.summary.map((r) => (
                      <tr key={r.collection}>
                        <td className="font-medium">{COLLECTIONS[r.collection].label}</td>
                        <td>{r.inFile}</td>
                        <td className={r.add ? 'text-primary font-semibold' : ''}>{r.add}</td>
                        <td className={r.changed ? 'text-warning font-semibold' : ''}>{r.changed}</td>
                        <td className="text-base-content/60">{r.same}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {preview.summary.some((r) => r.add || r.changed) && (
                <ul className="space-y-1 text-sm text-base-content/70">
                  {preview.summary.filter((r) => r.add || r.changed).map((r) => {
                    const s = preview.samples[r.collection];
                    return (
                      <li key={r.collection}>
                        <strong>{COLLECTIONS[r.collection].label}:</strong>{' '}
                        {r.add > 0 && <>new: {s.add.join(', ')}{r.add > s.add.length ? ` and ${r.add - s.add.length} more` : ''}. </>}
                        {r.changed > 0 && <>changed: {s.changed.join(', ')}{r.changed > s.changed.length ? ` and ${r.changed - s.changed.length} more` : ''}.</>}
                      </li>
                    );
                  })}
                </ul>
              )}

              <fieldset className="space-y-2">
                <legend className="mb-1 text-sm font-medium">What should happen?</legend>
                <label className="flex cursor-pointer items-start gap-3 rounded-box border border-white/10 p-3">
                  <input type="radio" name="mode" className="radio radio-primary mt-1" checked={mode === 'missing'} onChange={() => setMode('missing')} />
                  <span><strong>Add missing records only</strong> (safest)<br /><span className="text-sm text-base-content/60">Records already in the database are left exactly as they are.</span></span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-box border border-white/10 p-3">
                  <input type="radio" name="mode" className="radio radio-primary mt-1" checked={mode === 'overwrite'} onChange={() => setMode('overwrite')} />
                  <span><strong>Add missing and overwrite changed records</strong><br /><span className="text-sm text-base-content/60">Records that differ from the file go back to the file's version. Edits made since the backup are lost.</span></span>
                </label>
              </fieldset>

              <div className="flex flex-wrap items-center gap-3">
                <button className="btn btn-primary" disabled={busy || !!nothingToDo} onClick={() => setConfirm(true)}>Restore…</button>
                {nothingToDo && <p className="text-sm text-base-content/60">Nothing to restore with this option: the database already has everything in the file.</p>}
              </div>
            </div>
          )}
        </div>
      </section>

      <Modal open={confirm} onClose={() => setConfirm(false)} title="Restore from this backup?">
        {totals && (
          <div className="space-y-4">
            <p>
              This will add <strong>{totals.add}</strong> record{totals.add === 1 ? '' : 's'}
              {mode === 'overwrite' && <> and overwrite <strong>{totals.changed}</strong></>}. Nothing is deleted.
            </p>
            {mode === 'overwrite' && totals.changed > 0 && (
              <p role="alert" className="text-sm text-warning">Overwriting cannot be undone from the Activity page. Download a backup of the current data first if you might need it.</p>
            )}
            <div className="modal-action">
              <button className="btn" onClick={() => setConfirm(false)}>Cancel</button>
              {mode === 'overwrite' && <a className="btn btn-ghost" href="/api/backup" download>Download current data</a>}
              <button className={`btn ${mode === 'overwrite' ? 'btn-error' : 'btn-primary'}`} disabled={busy} onClick={restore}>
                {busy && <span className="loading loading-spinner loading-sm" />} Restore
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
