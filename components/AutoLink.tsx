'use client';
import { useState } from 'react';
import { Modal } from './Manager';
import { useToast } from './Toast';

type Pair = { collection: string; id: string; name: string; asset: string; url: string };

/** Attach unused images to records that have no icon yet, matching by name. */
export function AutoLink({ enabled, onDone }: { enabled: boolean; onDone: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<{ pairs: Pair[]; ambiguous: string[] } | null>(null);

  async function start() {
    setOpen(true); setPlan(null);
    try { setPlan(await (await fetch('/api/assets/auto-link')).json()); }
    catch (e: any) { toast('error', e.message); setOpen(false); }
  }
  async function apply() {
    setBusy(true);
    try {
      const j = await (await fetch('/api/assets/auto-link', { method: 'POST' })).json();
      if (j.error) throw new Error(j.error);
      toast('success', `Attached ${j.linked} icon${j.linked === 1 ? '' : 's'}.`); setOpen(false); onDone();
    } catch (e: any) { toast('error', e.message); } finally { setBusy(false); }
  }

  return (
    <>
      <button className="btn" disabled={!enabled} onClick={start}>Attach unused icons</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Attach unused icons" wide>
        {!plan ? <p className="text-base-content/70">Checking…</p> : (
          <div className="space-y-4">
            <p className="text-base-content/70">
              {plan.pairs.length
                ? `${plan.pairs.length} record${plan.pairs.length === 1 ? ' has' : 's have'} no icon and an unused image with the same name. Only empty icon fields are filled; nothing is replaced.`
                : 'No unused image matches a record that is missing its icon.'}
            </p>
            {plan.pairs.length > 0 && (
              <ul className="max-h-72 space-y-1 overflow-y-auto text-sm" data-lenis-prevent>
                {plan.pairs.map((p) => <li key={p.id}><span className="font-semibold">{p.name}</span> <span className="text-base-content/60">← {p.asset.split('/')[1]}</span></li>)}
              </ul>
            )}
            {plan.ambiguous.length > 0 && <p className="text-sm text-warning">Skipped because more than one image matches: {plan.ambiguous.join(', ')}.</p>}
            <div className="modal-action">
              <button className="btn" onClick={() => setOpen(false)}>Close</button>
              <button className="btn btn-primary" disabled={busy || !plan.pairs.length} onClick={apply}>{busy ? 'Attaching…' : `Attach ${plan.pairs.length}`}</button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
