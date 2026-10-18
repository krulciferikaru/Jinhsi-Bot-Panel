'use client';

export type Targets = { live: boolean; test: boolean };
export const targetList = (t: Targets) => [...(t.live ? ['live'] : []), ...(t.test ? ['test'] : [])] as ('live' | 'test')[];
export const noTarget = (t: Targets) => !t.live && !t.test;

/** Choose which bot(s) a new emoji is created on. At least one must stay selected. */
export function EmojiTargets({ value, onChange, note }: { value: Targets; onChange: (t: Targets) => void; note?: string }) {
  const Item = ({ k, title, hint }: { k: keyof Targets; title: string; hint: string }) => (
    <label className={`flex cursor-pointer items-center gap-3 rounded-box border p-3 transition ${value[k] ? 'border-primary/60 bg-primary/5' : 'border-white/10'}`}>
      <input type="checkbox" className="toggle toggle-primary" checked={value[k]} onChange={(e) => onChange({ ...value, [k]: e.target.checked })} />
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-base-content/60">{hint}</span>
      </span>
    </label>
  );
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-medium">Create the emoji on</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        <Item k="live" title="Live bot" hint="The main bot your community uses." />
        <Item k="test" title="Test bot" hint="The sandbox bot you develop with." />
      </div>
      {noTarget(value) && <p role="alert" className="text-sm text-error">Choose at least one bot, or turn the emoji option off.</p>}
      <p className="text-xs text-base-content/60">
        {note ?? 'Each bot has its own emoji code. Only the Live bot’s code is saved on the record, because that is the bot players see.'}
      </p>
    </fieldset>
  );
}
