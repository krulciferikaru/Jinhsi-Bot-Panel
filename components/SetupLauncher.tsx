'use client';
import { useCallback, useEffect, useState } from 'react';
import type { Doc } from '@/lib/schema';
import { ResonatorWizard } from './ResonatorWizard';
import { WandIcon } from './Icons';

type Draft = { _id: string; title: string; resonatorId?: string; step: number; updatedAt: string };
type Open = { resonator: Doc | null; draftId?: string; step: number };

/**
 * Starts the guided "set up a resonator" flow and lists any saved drafts to resume.
 * `variant` decides how prominent it is: a full card on Home, a single button in a list toolbar.
 */
export function SetupLauncher({ variant = 'card' }: { variant?: 'card' | 'button' }) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [open, setOpen] = useState<Open | null>(null);

  const loadDrafts = useCallback(() => {
    fetch('/api/drafts').then((r) => r.json()).then((d) => setDrafts(Array.isArray(d) ? d : [])).catch(() => setDrafts([]));
  }, []);
  useEffect(() => { loadDrafts(); }, [loadDrafts]);

  const resume = async (d: Draft) => {
    let resonator: Doc | null = null;
    if (d.resonatorId) {
      const rows = await fetch('/api/resonators').then((r) => r.json()).catch(() => []);
      resonator = (Array.isArray(rows) ? rows : []).find((r: Doc) => String(r._id) === d.resonatorId) ?? null;
    }
    setOpen({ resonator, draftId: d._id, step: d.step });
  };

  const start = () => setOpen({ resonator: null, step: 0 });
  const wizard = open && (
    <ResonatorWizard
      open onClose={() => setOpen(null)}
      resonator={open.resonator} draftId={open.draftId} startStep={open.step}
      onChanged={loadDrafts}
    />
  );

  if (variant === 'button') {
    return (
      <>
        <button className="btn" onClick={start}><WandIcon />Guided setup</button>
        {wizard}
      </>
    );
  }

  return (
    <section className="card card-border bg-base-100">
      <div className="card-body gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Set up a resonator</h2>
            <p className="text-sm text-base-content/60">Add a resonator with its builds and skills, step by step.</p>
          </div>
          <button className="btn btn-primary" onClick={start}><WandIcon />Start</button>
        </div>
        {drafts.length > 0 && (
          <div>
            <p className="mono-label mb-2">Drafts</p>
            <ul className="flex flex-wrap gap-2">
              {drafts.map((d) => (
                <li key={d._id}>
                  <button className="btn btn-sm" onClick={() => resume(d)}>
                    {d.title || 'Untitled'} <span className="text-base-content/50">· step {Math.min(d.step + 1, 4)}/4</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {wizard}
    </section>
  );
}
