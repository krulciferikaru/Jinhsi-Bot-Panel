'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Combobox } from './Combobox';
import { Modal } from './Manager';
import { EmojiTargets, noTarget, targetList, type Targets } from './EmojiTargets';
import { useToast } from './Toast';

type Folder = 'CharacterIcons' | 'EchoIcons' | 'WeaponIcons';
const FOLDERS: Folder[] = ['CharacterIcons', 'EchoIcons', 'WeaponIcons'];
const MAX_FILES = 60;
const MAX_BYTES = 5 * 1024 * 1024;
const OK_TYPES = ['image/png', 'image/webp', 'image/jpeg'];

type Row = { id: number; file: File; url: string; name: string; folder: Folder; serverError?: string };
let nextId = 1;

/** "Aero_Predator (1).webp" -> "Aero Predator" */
const guessName = (f: File) => f.name.replace(/\.[^.]+$/, '').replace(/\s*\(\d+\)$/, '').replace(/[_]+/g, ' ').trim();
const fileKey = (folder: string, name: string) => `${folder}/${name.trim().replace(/\s+/g, '_')}.png`.toLowerCase();
const nameProblem = (n: string) => {
  const t = n.trim();
  if (!t) return 'Enter a name.';
  if (t.length > 80) return 'Name is too long.';
  if (!/^[A-Za-z0-9 _\-.'()]+$/.test(t) || t.includes('..')) return "Use only letters, numbers, spaces and - _ . ' ( )";
  return '';
};

export function BulkUpload({ open, onClose, existing, defaultFolder, enabled, onDone }: {
  open: boolean; onClose: () => void; existing: Set<string>; defaultFolder: Folder; enabled: boolean; onDone: () => void;
}) {
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [link, setLink] = useState(true);
  const [emoji, setEmoji] = useState(true);
  const [bots, setBots] = useState<Targets>({ live: true, test: false });
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [note, setNote] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const urls = useRef<string[]>([]);

  // Start fresh every time the dialog opens; free preview URLs when it closes.
  useEffect(() => {
    if (!open) { urls.current.forEach(URL.revokeObjectURL); urls.current = []; setRows([]); setNote(''); setBusy(false); }
  }, [open]);

  function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list);
    const skipped: string[] = [];
    const room = MAX_FILES - rows.length;
    const fresh: Row[] = [];
    for (const f of incoming) {
      if (!OK_TYPES.includes(f.type)) { skipped.push(`${f.name} (not PNG, WebP or JPEG)`); continue; }
      if (fresh.length >= room) { skipped.push(`${f.name} (limit of ${MAX_FILES} reached)`); continue; }
      const url = URL.createObjectURL(f);
      urls.current.push(url);
      fresh.push({ id: nextId++, file: f, url, name: guessName(f), folder: defaultFolder });
    }
    setRows((r) => [...r, ...fresh]);
    setNote(skipped.length ? `Skipped: ${skipped.join('; ')}` : '');
  }

  const update = (id: number, patch: Partial<Row>) => setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch, serverError: undefined } : x)));
  const remove = (id: number) => setRows((r) => r.filter((x) => x.id !== id));

  // Per-row status, recomputed as names and folders change.
  const status = useMemo(() => {
    const count = new Map<string, number>();
    rows.forEach((r) => count.set(fileKey(r.folder, r.name), (count.get(fileKey(r.folder, r.name)) ?? 0) + 1));
    return rows.map((r) => {
      const bad = nameProblem(r.name) || (r.file.size > MAX_BYTES ? 'Larger than 5 MB.' : '')
        || ((count.get(fileKey(r.folder, r.name)) ?? 0) > 1 ? 'Another image here has the same name.' : '') || r.serverError || '';
      const replaces = !bad && existing.has(fileKey(r.folder, r.name));
      const converts = r.file.type !== 'image/png';
      return { bad, replaces, converts };
    });
  }, [rows, existing]);

  const errors = status.filter((s) => s.bad).length;
  const replaces = status.filter((s) => s.replaces).length;
  const converts = status.filter((s) => s.converts).length;
  const canGo = enabled && rows.length > 0 && errors === 0 && !busy && !(emoji && noTarget(bots));

  async function submit() {
    setBusy(true);
    try {
      const body = new FormData();
      rows.forEach((r) => { body.append('files', r.file); body.append('names', r.name); body.append('folders', r.folder); });
      body.set('linkRecords', String(link));
      if (emoji) { body.set('emoji', 'true'); targetList(bots).forEach((t) => body.append('emojiTargets', t)); }
      const res = await fetch('/api/assets/bulk', { method: 'POST', body });
      const j = await res.json();
      if (!res.ok) {
        if (Array.isArray(j.problems)) {
          setRows((rs) => rs.map((r, i) => ({ ...r, serverError: j.problems.find((p: any) => p.index === i)?.error })));
        }
        throw new Error(j.error || 'Upload failed');
      }
      toast('success', `Uploaded ${j.count} image${j.count === 1 ? '' : 's'} in one commit (${j.added} new, ${j.replaced} replaced${emoji ? `; ${j.emojisCreated} emoji created, ${j.emojisReused} reused` : ''}${j.linked ? `; ${j.linked} record${j.linked === 1 ? '' : 's'} filled in` : ''}).`);
      if (Array.isArray(j.emojiErrors) && j.emojiErrors.length) {
        toast('error', `${j.emojiErrors.length} emoji could not be created: ${j.emojiErrors.slice(0, 3).map((x: any) => `${x.name}: ${x.error}`).join(' | ')}`);
      }
      onDone(); onClose();
    } catch (e: any) { toast('error', e.message); }
    finally { setBusy(false); }
  }

  return (
    <Modal wide open={open} onClose={onClose} title="Bulk upload">
      <div className="space-y-4">
        <label
          htmlFor="bulk-files"
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
          className={`flex cursor-pointer flex-col items-center gap-1 rounded-box border-2 border-dashed p-6 text-center transition ${drag ? 'border-primary bg-primary/10' : 'border-white/20 hover:border-white/40'}`}
        >
          <span className="font-medium">Drop images here, or click to choose</span>
          <span className="text-sm text-base-content/60">PNG, WebP or JPEG, up to 5 MB each, {MAX_FILES} at a time. WebP and JPEG are converted to PNG.</span>
          <input id="bulk-files" ref={input} type="file" multiple accept="image/png,image/webp,image/jpeg" className="sr-only"
            onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
        </label>
        {note && <p role="status" className="text-sm text-warning">{note}</p>}

        {rows.length > 0 && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-base-content/70" aria-live="polite">
                {rows.length} image{rows.length === 1 ? '' : 's'}
                {replaces > 0 && <> · <span className="text-warning">{replaces} will replace existing</span></>}
                {converts > 0 && <> · {converts} converted to PNG</>}
                {errors > 0 && <> · <span className="text-error">{errors} need fixing</span></>}
              </p>
              <div className="flex items-center gap-2">
                <span className="text-sm text-base-content/60">Folder for all</span>
                <div className="w-40"><Combobox aria-label="Set folder for all images" value="" options={FOLDERS} placeholder="Choose…"
                  onChange={(v) => v && setRows((r) => r.map((x) => ({ ...x, folder: v as Folder, serverError: undefined })))} /></div>
              </div>
            </div>

            <ul className="max-h-[46vh] space-y-2 overflow-y-auto pr-1" data-lenis-prevent>
              {rows.map((r, i) => {
                const s = status[i];
                return (
                  <li key={r.id} className={`flex flex-wrap items-center gap-3 rounded-box border p-2 ${s.bad ? 'border-error/60' : 'border-white/10'}`}>
                    <div className="checker h-14 w-14 shrink-0 overflow-hidden rounded-lg">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r.url} alt="" className="h-full w-full object-contain" />
                    </div>
                    <div className="min-w-40 flex-1">
                      <input aria-label={`Name for ${r.file.name}`} className="input input-bordered w-full" value={r.name} onChange={(e) => update(r.id, { name: e.target.value })} />
                      <p className={`mt-1 truncate text-xs ${s.bad ? 'text-error' : s.replaces ? 'text-warning' : 'text-base-content/60'}`}>
                        {s.bad || (s.replaces ? 'Replaces the existing image' : 'New')}
                        {!s.bad && s.converts && ` · from ${r.file.type === 'image/webp' ? 'WebP' : 'JPEG'}`}
                        <span className="text-base-content/40"> · {r.file.name}</span>
                      </p>
                    </div>
                    <div className="w-40 shrink-0">
                      <Combobox aria-label={`Folder for ${r.file.name}`} value={r.folder} options={FOLDERS} onChange={(v) => v && update(r.id, { folder: v as Folder })} />
                    </div>
                    <button type="button" className="btn btn-ghost btn-sm text-error" aria-label={`Remove ${r.file.name}`} onClick={() => remove(r.id)}>Remove</button>
                  </li>
                );
              })}
            </ul>

            <div className="space-y-2 rounded-box border border-white/10 p-3">
              <label className="flex cursor-pointer items-start gap-3">
                <input type="checkbox" className="toggle toggle-primary mt-0.5" checked={emoji} onChange={(e) => setEmoji(e.target.checked)} />
                <span className="text-sm">Also create a Discord emoji for each image (named like the image, e.g. “AeroPredator”). Existing emojis with that name are reused.</span>
              </label>
              {emoji && <EmojiTargets value={bots} onChange={setBots} />}
              <label className="flex cursor-pointer items-start gap-3">
                <input type="checkbox" className="toggle toggle-primary mt-0.5" checked={link} onChange={(e) => setLink(e.target.checked)} />
                <span className="text-sm">Fill in the icon{emoji && bots.live ? ' and emoji' : ''} on records that have the same name and none yet (for example a new resonator).</span>
              </label>
            </div>
          </>
        )}

        {!enabled && <p role="alert" className="text-sm text-warning">Uploads are off. Add <code>GITHUB_TOKEN</code> to <code>.env.local</code> and restart.</p>}

        <div className="modal-action">
          <button className="btn" onClick={onClose}>Cancel</button>
          {rows.length > 0 && <button className="btn btn-ghost" disabled={busy} onClick={() => setRows([])}>Clear all</button>}
          <button className="btn btn-primary" disabled={!canGo} onClick={submit}>
            {busy && <span className="loading loading-spinner loading-sm" />}
            {busy ? 'Uploading…' : rows.length ? `Upload ${rows.length} image${rows.length === 1 ? '' : 's'} (1 commit)` : 'Upload'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
