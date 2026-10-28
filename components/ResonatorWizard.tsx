'use client';
import { useCallback, useEffect, useState } from 'react';
import { COLLECTIONS, SKILL_CATEGORIES, type Doc } from '@/lib/schema';
import { EntityForm, hydrate } from './EntityForm';
import { Modal } from './Manager';
import { useToast } from './Toast';
import { CheckIcon, PlusIcon } from './Icons';

type Props = {
  open: boolean;
  onClose: () => void;
  /** resume an existing setup: the resonator and where to pick up */
  draftId?: string;
  resonator?: Doc | null;
  startStep?: number;
  /** let the opener refresh its own data after the wizard changed records */
  onChanged?: () => void;
};

const STEPS = ['Resonator', 'Builds', 'Skills', 'Done'];

/**
 * Walks through everything a resonator needs for the bot to answer well: the record itself, at least one
 * build (with a primary), and its skills. Records are created as you go, so the work is never lost, and
 * the whole setup can be saved as a draft and resumed later from Home or any list page.
 */
export function ResonatorWizard({ open, onClose, draftId: initialDraftId, resonator: initialResonator, startStep = 0, onChanged }: Props) {
  const toast = useToast();
  const [step, setStep] = useState(startStep);
  const [resonator, setResonator] = useState<Doc | null>(initialResonator ?? null);
  const [builds, setBuilds] = useState<Doc[]>([]);
  const [skills, setSkills] = useState<Doc[]>([]);
  const [draftId, setDraftId] = useState<string | undefined>(initialDraftId);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setStep(startStep); setResonator(initialResonator ?? null); setDraftId(initialDraftId); } }, [open, startStep, initialResonator, initialDraftId]);

  const name = String(resonator?.name ?? '');
  const refreshChildren = useCallback(async () => {
    if (!name) return;
    const [b, s] = await Promise.all([
      fetch('/api/builds').then((r) => r.json()).catch(() => []),
      fetch('/api/skills').then((r) => r.json()).catch(() => []),
    ]);
    const mine = (d: Doc) => String(d.resonator_id).toLowerCase() === name.toLowerCase() && !d.archived;
    setBuilds((Array.isArray(b) ? b : []).filter(mine));
    setSkills((Array.isArray(s) ? s : []).filter(mine));
  }, [name]);
  useEffect(() => { if (open && name) refreshChildren(); }, [open, name, refreshChildren]);

  async function post(collection: string, values: Record<string, any>) {
    const r = await fetch(`/api/${collection}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify(values),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Could not save.');
    return j as Doc;
  }

  // Step 0: the resonator record. Create it (or update it when resuming) and move on.
  const saveResonator = async (values: Record<string, any>) => {
    setBusy(true);
    try {
      let doc: Doc;
      if (resonator?._id) {
        const r = await fetch(`/api/resonators/${resonator._id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
        doc = await r.json();
        if (!r.ok) throw new Error((doc as any).error || 'Could not save.');
      } else {
        doc = await post('resonators', values);
      }
      setResonator(doc); onChanged?.(); setStep(1);
    } catch (e: any) { toast('error', e.message); }
    finally { setBusy(false); }
  };

  const addChild = (collection: 'builds' | 'skills') => async (values: Record<string, any>) => {
    setBusy(true);
    try {
      await post(collection, { ...values, resonator_id: name });
      await refreshChildren(); onChanged?.();
      toast('success', `${COLLECTIONS[collection].singular} added for ${name}.`);
    } catch (e: any) { toast('error', e.message); }
    finally { setBusy(false); }
  };

  const saveDraft = async () => {
    if (!resonator) { onClose(); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/drafts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _id: draftId, title: name, resonatorId: resonator._id, step }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Could not save the draft.');
      toast('success', `Draft saved. Resume ${name} any time.`); onChanged?.(); onClose();
    } catch (e: any) { toast('error', e.message); }
    finally { setBusy(false); }
  };

  const finish = async () => {
    if (draftId) { try { await fetch(`/api/drafts/${draftId}`, { method: 'DELETE' }); } catch { /* best effort */ } }
    onChanged?.(); onClose();
  };

  const hasPrimary = builds.some((b) => b.is_primary);
  const missingCats = SKILL_CATEGORIES.filter((c) => !skills.some((s) => String(s.skill_category) === c));

  return (
    <Modal wide open={open} onClose={onClose} title={resonator ? `Set up ${name}` : 'Set up a resonator'}>
      {/* Progress, with Save draft kept out of the way on the right so it never repeats the form's own buttons */}
      <div className="mb-5 flex items-center justify-between gap-3">
      <ol className="flex items-center gap-2 text-sm" aria-label="Setup steps">
        {STEPS.map((label, i) => {
          const state = i < step ? 'done' : i === step ? 'current' : 'todo';
          return (
            <li key={label} className="flex items-center gap-2">
              <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-semibold ${state === 'done' ? 'bg-primary text-primary-content' : state === 'current' ? 'bg-primary/20 text-primary ring-1 ring-primary' : 'bg-white/10 text-base-content/50'}`}>
                {state === 'done' ? <CheckIcon className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={state === 'current' ? 'font-semibold' : 'text-base-content/60'}>{label}</span>
              {i < STEPS.length - 1 && <span aria-hidden="true" className="mx-1 h-px w-5 bg-white/15" />}
            </li>
          );
        })}
      </ol>
      </div>

      {step === 0 && (
        <EntityForm
          fields={COLLECTIONS.resonators.fields}
          initial={resonator ? hydrate(COLLECTIONS.resonators.fields, resonator) : undefined}
          submitLabel={resonator ? 'Save and continue' : 'Add resonator'}
          busy={busy}
          onSubmit={saveResonator}
          onCancel={onClose}
        />
      )}

      {step === 1 && (
        <div className="space-y-4">
          <div className="rounded-box border border-white/10 p-3">
            <p className="mb-2 text-sm font-medium">{builds.length === 0 ? 'No builds yet' : `${builds.length} build${builds.length > 1 ? 's' : ''}`}
              {builds.length > 0 && !hasPrimary && <span className="ml-2 text-warning">— none is marked primary</span>}
              {hasPrimary && <span className="ml-2 text-success">— primary set</span>}
            </p>
            {builds.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {builds.map((b) => <li key={String(b._id)} className="badge badge-lg">{String(b.build_name)}{b.is_primary ? ' ★' : ''}</li>)}
              </ul>
            )}
          </div>
          <details className="rounded-box border border-white/10" open={builds.length === 0}>
            <summary className="cursor-pointer px-3 py-2 font-medium [&::-webkit-details-marker]:hidden"><PlusIcon className="mr-1 inline h-4 w-4" />Add a build</summary>
            <div className="border-t border-white/10 p-3">
              <EntityForm key={builds.length} fields={COLLECTIONS.builds.fields} initial={{ resonator_id: name }} submitLabel="Add build" busy={busy} onSubmit={addChild('builds')} onCancel={() => {}} />
            </div>
          </details>
          <StepNav onBack={() => setStep(0)} onNext={() => setStep(2)} nextLabel="Next: skills" warn={builds.length === 0 ? 'Add at least one build so the bot has something to show.' : undefined} />
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="rounded-box border border-white/10 p-3">
            <p className="mb-2 text-sm font-medium">{skills.length} skill{skills.length === 1 ? '' : 's'}</p>
            <ul className="flex flex-wrap gap-2">
              {SKILL_CATEGORIES.map((c) => {
                const n = skills.filter((s) => String(s.skill_category) === c).length;
                return <li key={c} className={`badge badge-lg ${n ? 'badge-success badge-soft' : 'badge-ghost'}`}>{c}: {n}</li>;
              })}
            </ul>
            {missingCats.length > 0 && <p className="mt-2 text-sm text-warning">Missing: {missingCats.join(', ')}.</p>}
          </div>
          <details className="rounded-box border border-white/10" open={skills.length === 0}>
            <summary className="cursor-pointer px-3 py-2 font-medium [&::-webkit-details-marker]:hidden"><PlusIcon className="mr-1 inline h-4 w-4" />Add a skill</summary>
            <div className="border-t border-white/10 p-3">
              <EntityForm key={skills.length} fields={COLLECTIONS.skills.fields} initial={{ resonator_id: name }} submitLabel="Add skill" busy={busy} onSubmit={addChild('skills')} onCancel={() => {}} />
            </div>
          </details>
          <StepNav onBack={() => setStep(1)} onNext={() => setStep(3)} nextLabel="Review" />
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <p className="text-lg font-semibold">{name} is set up.</p>
          <ul className="space-y-2">
            <Summary ok label="Resonator" value="Added" />
            <Summary ok={builds.length > 0} label="Builds" value={builds.length > 0 ? `${builds.length}${hasPrimary ? ', primary set' : ', no primary'}` : 'None'} warn={builds.length > 0 && !hasPrimary} />
            <Summary ok={missingCats.length === 0} label="Skills" value={missingCats.length === 0 ? `${skills.length}, all categories` : `${skills.length}, missing ${missingCats.join(', ')}`} warn={missingCats.length > 0} />
          </ul>
          <div className="flex justify-between gap-2">
            <button className="btn" onClick={() => setStep(2)}>Back</button>
            <button className="btn btn-primary" onClick={finish}><CheckIcon />Finish</button>
          </div>
        </div>
      )}

      {resonator && step < 3 && (
        <div className="mt-4 flex justify-end border-t border-white/10 pt-3">
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={saveDraft}
            title="Save your progress and come back later">Save draft</button>
        </div>
      )}
    </Modal>
  );
}

function StepNav({ onBack, onNext, nextLabel, warn }: { onBack: () => void; onNext: () => void; nextLabel: string; warn?: string }) {
  return (
    <div>
      {warn && <p className="mb-2 text-sm text-warning">{warn}</p>}
      <div className="flex justify-between gap-2">
        <button className="btn" onClick={onBack}>Back</button>
        <button className="btn btn-primary" onClick={onNext}>{nextLabel}</button>
      </div>
    </div>
  );
}

function Summary({ ok, label, value, warn }: { ok: boolean; label: string; value: string; warn?: boolean }) {
  return (
    <li className="flex items-center gap-3 rounded-box border border-white/10 px-3 py-2">
      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${ok && !warn ? 'bg-success/20 text-success' : warn ? 'bg-warning/20 text-warning' : 'bg-white/10 text-base-content/50'}`}>
        {ok ? <CheckIcon className="h-4 w-4" /> : '—'}
      </span>
      <span className="font-medium">{label}</span>
      <span className="ml-auto text-sm text-base-content/70">{value}</span>
    </li>
  );
}
