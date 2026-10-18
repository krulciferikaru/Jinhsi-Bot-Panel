'use client';
import { Fragment, useEffect, useId, useRef, useState } from 'react';
import { getPath, plain, type Field } from '@/lib/schema';
import { useToast } from './Toast';
import { EmojiTargets, noTarget, targetList, type Targets } from './EmojiTargets';
import { Combobox } from './Combobox';
import { optimized } from '@/lib/img';
import { ChoiceIcon, useChoiceIcons } from './ChoiceIcon';
import { BUILD_NAMES, SET_EMOJI_ALIAS, SONATA_SETS, statChoices } from '@/lib/sets';

type Values = Record<string, any>;

const emptyFor = (f: Field): any => (f.type === 'tags' ? [] : f.type === 'boolean' ? false : '');

/** Flat values keyed by each field's (possibly dotted) key. */
export function hydrate(fields: Field[], doc?: Values): Values {
  return Object.fromEntries(fields.map((f) => {
    let x = doc ? getPath(doc, f.key) : undefined;
    if (x == null) x = emptyFor(f);
    if (f.type === 'select' || f.type === 'number') x = String(x);
    return [f.key, x];
  }));
}

function TagsInput({ id, value, onChange, suggestions }: { id: string; value: string[]; onChange: (v: string[]) => void; suggestions?: string[] }) {
  const [text, setText] = useState('');
  const add = () => {
    const t = text.trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setText('');
  };
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {value.map((t) => (
          <span key={t} className="badge badge-lg max-w-full gap-1">
            <span className="truncate">{t}</span>
            <button type="button" className="btn btn-ghost btn-xs btn-circle" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}>✕</button>
          </span>
        ))}
        {value.length === 0 && <span className="text-sm text-base-content/60">None added</span>}
      </div>
      {suggestions && suggestions.filter((x) => !value.includes(x)).length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2" aria-label="Suggestions">
          <span className="mono-label">Suggested</span>
          {suggestions.filter((x) => !value.includes(x)).map((x) => (
            <button key={x} type="button" className="btn btn-xs rounded-full" onClick={() => onChange([...value, x])}>+ {x}</button>
          ))}
        </div>
      )}
      <div className="flex items-stretch gap-3">
        <input id={id} className="input input-bordered min-w-0 flex-1" value={text}
          onChange={(e) => setText(e.target.value)} placeholder="Type and press Enter…" autoComplete="off" spellCheck={false}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <button type="button" className="btn h-auto min-h-11 shrink-0 px-7" disabled={!text.trim()} onClick={add}>Add</button>
      </div>
    </div>
  );
}

type Choice = { label: string; value: string };

/** A short list of single choices: every option visible at once. */
function RadioGroup({ name, legend, value, options, onChange, required, describedBy }: { name: string; legend: string; value: string; options: string[]; onChange: (v: string) => void; required?: boolean; describedBy?: string }) {
  const iconFor = useChoiceIcons();
  return (
    <div role="radiogroup" aria-label={legend} aria-describedby={describedBy} className="flex flex-wrap gap-2">
      {[...(required ? [] : ['']), ...options].map((o) => (
        <label key={o || 'none'} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${value === o ? 'border-primary bg-primary/15 font-semibold' : 'border-white/10 bg-white/5 hover:border-white/30'}`}>
          <input type="radio" name={name} className="radio radio-primary radio-sm" checked={value === o} onChange={() => onChange(o)} />
          <ChoiceIcon src={o ? iconFor(o, legend) : undefined} />
          {o || 'None'}
        </label>
      ))}
    </div>
  );
}

/** Several choices from a fixed list; anything stored that is not in the list stays, shown as a removable tag. */
function CheckGroup({ id, options, value, onChange }: { id: string; options: Choice[]; value: string[]; onChange: (v: string[]) => void }) {
  const iconFor = useChoiceIcons();
  const same = (stored: string, o: Choice) => stored === o.value || (!o.value.startsWith('<:') && plain(stored).toLowerCase() === plain(o.value).toLowerCase());
  // one stored string can hold several emoji codes; treat each as its own choice
  const items = value.flatMap((v) => { const m = v.match(/<a?:\w+:\d+>/g); return m && m.length > 1 && m.join('') === v.trim() ? m : [v]; });
  const isOn = (o: Choice) => items.some((v) => same(v, o));
  const extras = items.filter((v) => !options.some((o) => same(v, o)));
  const toggle = (o: Choice) => onChange(isOn(o) ? items.filter((v) => !same(v, o)) : [...items, o.value]);
  return (
    <div className="space-y-3">
      <div id={id} role="group" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((o) => (
          <label key={o.value} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${isOn(o) ? 'border-primary bg-primary/15 font-semibold' : 'border-white/10 bg-white/5 hover:border-white/30'}`}>
            <input type="checkbox" className="checkbox checkbox-primary checkbox-sm" checked={isOn(o)} onChange={() => toggle(o)} />
            <ChoiceIcon src={(() => { const m = /^<a?:\w+:(\d+)>$/.exec(o.value); return m ? `https://cdn.discordapp.com/emojis/${m[1]}.png?size=64` : iconFor(o.label, id); })()} />
            <span className="min-w-0 wrap-break-word">{o.label}</span>
          </label>
        ))}
      </div>
      <div>
        <p className="mono-label mb-2">Other</p>
        <TagsInput id={`${id}-other`} value={extras} onChange={(ex) => onChange([...items.filter((v) => !extras.includes(v)), ...ex])} />
      </div>
    </div>
  );
}

type SetPart = { name: string; n: string };
const parseSets = (v: string): SetPart[] => plain(v).split('+').map((p) => p.trim()).filter(Boolean).map((p) => {
  const m = /^(.*?)\s*X(\d)$/i.exec(p);
  return m ? { name: m[1].trim(), n: m[2] } : { name: p, n: '5' };
});
const joinSets = (parts: SetPart[]) => parts.filter((p) => p.name).map((p) => `${p.name} X${p.n}`).join(' + ');

/** Echo set as one or more parts, e.g. "Void Thunder X2 + Lingering Tunes X2 + Shadow of Shattered Dreams X1". */
function SetComposer({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const iconFor = useChoiceIcons();
  // rows can be empty while a set is still being chosen, so they live here and are written back once named
  const [rows, setRows] = useState<SetPart[]>(() => { const p = parseSets(value); return p.length ? p : [{ name: '', n: '5' }]; });
  useEffect(() => {
    if (joinSets(rows) !== plain(value).trim()) { const p = parseSets(value); setRows(p.length ? p : [{ name: '', n: '5' }]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const update = (next: SetPart[]) => { setRows(next); const text = joinSets(next); if (text !== plain(value).trim()) onChange(text); };
  const set = (i: number, patch: Partial<SetPart>) => update(rows.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  return (
    <div className="space-y-3">
      {rows.map((p, i) => (
        <div key={i} className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <Combobox id={i === 0 ? id : `${id}-${i}`} value={p.name} options={p.name && !SONATA_SETS.includes(p.name) ? [p.name, ...SONATA_SETS] : SONATA_SETS}
                onChange={(v) => set(i, { name: v })} iconFor={(o) => iconFor(o)} placeholder="Choose a set…" aria-label={`Echo set ${i + 1}`} />
            </div>
            {rows.length > 1 && <button type="button" className="btn btn-ghost btn-sm" aria-label={`Remove set ${i + 1}`} onClick={() => update(rows.filter((_, j) => j !== i))}>✕</button>}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2" role="radiogroup" aria-label={`Pieces of set ${i + 1}`}>
            <span className="mono-label mr-1">Pieces</span>
            {['5', '3', '2', '1'].map((n) => (
              <label key={n} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-1.5 text-sm transition ${p.n === n ? 'border-primary bg-primary/15 font-semibold' : 'border-white/10 bg-white/5 hover:border-white/30'}`}>
                <input type="radio" name={`${id}-pieces-${i}`} className="radio radio-primary radio-xs" checked={p.n === n} onChange={() => set(i, { n })} />
                {n}
              </label>
            ))}
          </div>
        </div>
      ))}
      {rows.length < 3 && (
        <button type="button" className="btn btn-sm" onClick={() => update([...rows, { name: '', n: '2' }])}>+ Add another set</button>
      )}
      <p className="text-sm text-base-content/60">Mixed sets: add each part, for example Void Thunder 2 + Lingering Tunes 2 + Shadow of Shattered Dreams 1.</p>
    </div>
  );
}

/** One or more main echoes (any cost), kept in one text value joined with " / ". */
function EchoPicker({ id, value, options, iconFor, onChange }: { id: string; value: string; options: string[]; iconFor: (n: string) => string | undefined; onChange: (v: string) => void }) {
  const picked = plain(value).split('/').map((x) => x.trim()).filter(Boolean);
  const join = (a: string[]) => a.join(' / ');
  return (
    <div className="space-y-3">
      {picked.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {picked.map((n) => (
            <li key={n} className="badge badge-lg gap-2">
              <ChoiceIcon src={iconFor(n)} />
              <span className="truncate">{n}</span>
              <button type="button" className="btn btn-ghost btn-xs btn-circle" aria-label={`Remove ${n}`} onClick={() => onChange(join(picked.filter((x) => x !== n)))}>✕</button>
            </li>
          ))}
        </ul>
      )}
      <Combobox id={id} value="" options={options.filter((o) => !picked.includes(o))} onChange={(v) => v && onChange(join([...picked, v]))}
        iconFor={iconFor} placeholder={picked.length ? 'Add another echo…' : 'Add an echo…'} />
    </div>
  );
}

function RefSelect({ id, collection, value, onChange, required }: { id: string; collection: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  const [names, setNames] = useState<string[]>([]);
  const [icons, setIcons] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch(`/api/${collection}`).then((r) => r.json()).then((rows) => {
      if (!Array.isArray(rows)) return;
      setNames(rows.map((r: any) => r.name));
      setIcons(Object.fromEntries(rows.filter((r: any) => r.icon_url).map((r: any) => [r.name, optimized(String(r.icon_url), 20)])));
    }).catch(() => {});
  }, [collection]);
  const all = value && !names.includes(value) ? [value, ...names] : names;
  return <Combobox id={id} value={value} options={all} onChange={onChange} iconFor={(o) => icons[o]} placeholder="Choose…" clearLabel={required ? undefined : 'None'} />;
}

/** Icon URL plus a PNG picker that commits the file to the GitHub asset repository. */
function ImageField({ id, f, value, name, onChange, onEmoji }: { id: string; f: Field; value: string; name: string; onChange: (v: string) => void; onEmoji?: (code: string) => void }) {
  const toast = useToast();
  const [makeEmoji, setMakeEmoji] = useState(true);
  const [bots, setBots] = useState<Targets>({ live: true, test: false });
  const canEmoji = Boolean(f.emojiKey && onEmoji);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<{ enabled: boolean; repo: string } | null>(null);
  const [broken, setBroken] = useState(false);

  useEffect(() => { fetch('/api/assets').then((r) => r.json()).then(setInfo).catch(() => {}); }, []);
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  useEffect(() => setBroken(false), [value, preview]);

  async function upload() {
    if (!file) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.set('file', file); body.set('folder', f.folder!); body.set('name', name);
      if (canEmoji && makeEmoji) { body.set('emoji', 'true'); targetList(bots).forEach((t) => body.append('emojiTargets', t)); }
      const r = await fetch('/api/assets', { method: 'POST', body });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Upload failed');
      onChange(j.url); setFile(null);
      let msg = `${j.replaced ? 'Icon replaced' : 'Icon uploaded'} in the GitHub repository${j.converted ? ` (converted from ${j.converted} to PNG)` : ''}.`;
      if (Array.isArray(j.emoji)) {
        const live = j.emoji.find((x: any) => x.target === 'live');
        if (live?.code) { onEmoji?.(live.code); msg += ` Discord emoji ${live.created ? 'created' : 'already existed, reused'} and filled in below.`; }
        if (!live?.code && j.emoji.some((x: any) => x.target === 'test' && x.code)) msg += ' Emoji created on the Test bot only, so the emoji field was not changed.';
        const failed = j.emoji.filter((x: any) => x.error);
        if (failed.length) toast('error', `Emoji problem: ${failed.map((x: any) => `${x.target}: ${x.error}`).join(' ')}`);
      }
      toast('success', msg);
    } catch (e: any) { toast('error', e.message); }
    finally { setBusy(false); }
  }

  const shown = preview || value;
  const target = `${f.folder}/${name.trim().replace(/ /g, '_')}.png`;
  let hint = 'PNG, WebP or JPEG, up to 5 MB. WebP and JPEG are converted to PNG.';
  if (info?.enabled === false) hint = 'Uploads are off. Add GITHUB_TOKEN to .env.local and restart.';
  else if (!name.trim()) hint = 'Enter the name first: the file is saved as <Name>.png.';
  else if (file) hint = `Will save as ${target} in ${info?.repo ?? 'the repository'}.`;

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-4">
        <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-white/5">
          {shown && !broken
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={shown} alt="Icon preview" className="h-full w-full object-cover" onError={() => setBroken(true)} />
            : <span className="px-1 text-center text-xs text-base-content/60">No image</span>}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <input id={id} className="input input-bordered w-full" value={value} placeholder="https://raw.githubusercontent.com/…" onChange={(e) => onChange(e.target.value)} />
          <input type="file" accept="image/png,image/webp,image/jpeg" className="file-input file-input-bordered w-full" aria-label={`Choose an image for ${f.label}`}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-sm btn-primary" disabled={!file || !name.trim() || busy || info?.enabled === false || (canEmoji && makeEmoji && noTarget(bots))} onClick={upload}>
          {busy && <span className="loading loading-spinner loading-xs" />} {canEmoji && makeEmoji ? 'Upload to GitHub + Discord' : 'Upload to GitHub'}
        </button>
        <p className="text-sm text-base-content/60" aria-live="polite">{hint}</p>
      </div>
      {canEmoji && (
        <div className="space-y-2 rounded-box border border-white/10 p-3">
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" className="toggle toggle-primary mt-0.5" checked={makeEmoji} onChange={(e) => setMakeEmoji(e.target.checked)} />
            <span className="text-sm">Also create a Discord emoji from this image and fill in the emoji field. If one with this name already exists it is reused.</span>
          </label>
          {makeEmoji && <EmojiTargets value={bots} onChange={setBots} note="The emoji field is filled with the Live bot’s code. With only the Test bot selected, the field is left as it is." />}
        </div>
      )}
    </div>
  );
}

type Lookups = { echoNote?: string; element?: string; weapons: string[]; echo4: string[]; echoAll: string[]; echoIcons: Record<string, string>; sonata: Choice[] };

function FieldInput({ f, value, onChange, name, setOther, lookups }: { f: Field; value: any; onChange: (v: any) => void; name?: string; setOther?: (key: string, value: any) => void; lookups?: Lookups }) {
  const rid = useId();
  const setIcon = useChoiceIcons();
  const id = `f-${f.key.replace(/\./g, '-')}-${rid}`;
  const helpId = f.help ? `${id}-help` : undefined;
  const exampleId = f.example ? `${id}-example` : undefined;
  const described = [helpId, exampleId].filter(Boolean).join(' ') || undefined;
  const example = f.example ? (
    <p id={exampleId} className="mt-1.5 wrap-break-word text-sm text-base-content/65">
      <span className="mono-label mr-2">Example</span>
      <span className="whitespace-pre-wrap font-mono text-[0.8rem]">{f.example}</span>
    </p>
  ) : null;

  if (f.type === 'boolean') {
    return (
      <div>
        <label className="flex cursor-pointer items-center gap-3 py-2">
          <input id={id} type="checkbox" className="toggle toggle-primary" checked={!!value} onChange={(e) => onChange(e.target.checked)} aria-describedby={described} />
          <span className="text-sm font-medium">{f.label}</span>
        </label>
        {example}
      </div>
    );
  }
  let control: React.ReactNode;
  switch (f.type) {
    case 'textarea':
      control = <textarea id={id} className="textarea textarea-bordered min-h-28 w-full" value={value} aria-describedby={described} onChange={(e) => onChange(e.target.value)} />;
      break;
    case 'select':
      if (f.options!.length <= 10) {
        return (
          <fieldset className="form-control">
            <legend className="mb-1 block text-sm font-medium">{f.label}{f.required && <span className="text-error" aria-hidden="true"> *</span>}{f.required && <span className="sr-only"> (required)</span>}</legend>
            <RadioGroup name={id} legend={f.label} value={value} options={f.options!} required={f.required} onChange={onChange} describedBy={described} />
            {f.help && <p id={helpId} className="mt-1 text-sm text-base-content/60">{f.help}</p>}
            {example}
          </fieldset>
        );
      }
      control = <Combobox id={id} value={value} options={f.options!} onChange={onChange} placeholder="Choose…" clearLabel={f.required ? undefined : 'None'} aria-describedby={described} />;
      break;
    case 'ref':
      control = <RefSelect id={id} collection={f.ref!} value={value} required={f.required} onChange={onChange} />;
      break;
    case 'image':
      control = <ImageField id={id} f={f} value={value} name={name ?? ''} onChange={onChange} onEmoji={f.emojiKey && setOther ? (code) => setOther(f.emojiKey!, code) : undefined} />;
      break;
    case 'tags': {
      const fixed: Choice[] | undefined = f.choices === 'sets' ? SONATA_SETS.map((n) => ({ label: n, value: n })) : f.choices === 'sonata' ? lookups?.sonata : f.assist === 'stats4' || f.assist === 'stats3' || f.assist === 'stats1'
        ? statChoices(f.assist === 'stats4' ? 4 : f.assist === 'stats3' ? 3 : 1, lookups?.element).map((x) => ({ label: x, value: x })) : undefined;
      if (fixed && fixed.length) { control = <CheckGroup id={id} options={fixed} value={value} onChange={onChange} />; break; }
      const sug = f.assist === 'weapons' ? lookups?.weapons : f.assist === 'stats4' ? statChoices(4, lookups?.element) : f.assist === 'stats3' ? statChoices(3, lookups?.element) : f.assist === 'stats1' ? statChoices(1, lookups?.element) : undefined;
      control = <TagsInput id={id} value={value} onChange={onChange} suggestions={sug} />;
      break;
    }
      break;
    default:
      if (f.suggest === 'sonata') { control = <SetComposer id={id} value={value} onChange={onChange} />; break; }
      if (f.suggest === 'echo4') { control = <EchoPicker id={id} value={value} options={lookups?.echoAll ?? []} iconFor={(n) => lookups?.echoIcons[n]} onChange={onChange} />; break; }
      if (f.suggest) {
        const opts = f.suggest === 'buildname' ? BUILD_NAMES : lookups?.echo4 ?? [];
        const pick = f.suggest === 'buildname' ? (o: string) => setIcon(o.replace(/^Alternative /, '')) : (o: string) => lookups?.echoIcons[o];
        const shown = plain(value);
        control = <Combobox id={id} value={shown} options={shown && !opts.includes(shown) ? [shown, ...opts] : opts} onChange={onChange} iconFor={pick} placeholder="Choose…" clearLabel={f.required ? undefined : "None"} aria-describedby={described} />;
        break;
      }
      control = <input id={id} type={f.type === 'number' ? 'number' : 'text'} className="input input-bordered w-full" value={value} required={f.required} autoComplete="off" spellCheck={f.key.includes('url') || f.key.includes('emoji') ? false : undefined}
        placeholder={f.placeholder} aria-describedby={described} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <div className="form-control">
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {f.label}{f.required && <span className="text-error" aria-hidden="true"> *</span>}
        {f.required && <span className="sr-only"> (required)</span>}
      </label>
      {control}
      {f.help && <p id={helpId} className="mt-1 text-sm text-base-content/60">{f.help}</p>}
      {f.suggest === 'echo4' && lookups?.echoNote && <p className="mt-1 text-sm text-base-content/60">{lookups.echoNote}</p>}
      {example}
    </div>
  );
}

export function EntityForm({ fields, initial, submitLabel, busy, onSubmit, onCancel }: {
  fields: Field[]; initial?: Values; submitLabel: string; busy?: boolean;
  onSubmit: (v: Values) => void; onCancel: () => void;
}) {
  const [values, setValues] = useState<Values>(() => {
    const v = hydrate(fields, initial);
    // a build saved before the layout was stored: read it once from its echo text, then keep it fixed while editing
    if (fields.some((f) => f.key === 'echo_layout') && !v.echo_layout) v.echo_layout = /cost\s*4/i.test(plain(v.sub_echo1)) ? '44111' : '43311';
    return v;
  });
  const [error, setError] = useState('');
  const [lists, setLists] = useState<{ resonators: any[]; weapons: any[]; echoes: any[] }>({ resonators: [], weapons: [], echoes: [] });

  const hasKey = (k: string) => fields.some((f) => f.key === k);
  const wantsEmojiFill = hasKey('element_emoji') || (hasKey('emoji') && hasKey('icon_url'));
  const wantsAssist = fields.some((f) => f.assist || f.suggest) || wantsEmojiFill;
  const wantsSonata = fields.some((f) => f.choices === 'sonata' || f.suggest === 'echo4');
  const [sonata, setSonata] = useState<Choice[]>([]);
  useEffect(() => {
    if (!wantsSonata) return;
    fetch('/api/emojis').then((r) => r.json()).then((j) => {
      const byName = new Map<string, string>((j.items ?? []).map((e: any) => [String(e.name).toLowerCase(), String(e.code)]));
      setSonata(SONATA_SETS.map((n) => ({ label: n, value: byName.get((SET_EMOJI_ALIAS[n] ?? n).replace(/[^A-Za-z0-9]/g, '').toLowerCase()) ?? '' })).filter((c) => c.value));
    }).catch(() => {});
  }, [wantsSonata]);
  useEffect(() => {
    if (!wantsAssist) return;
    const get = (c: string) => fetch(`/api/${c}`).then((r) => r.json()).then((x) => (Array.isArray(x) ? x : [])).catch(() => []);
    Promise.all([get('resonators'), get('weapons'), get('echoes')]).then(([resonators, weapons, echoes]) => setLists({ resonators, weapons, echoes }));
  }, [wantsAssist]);

  const resonator = lists.resonators.find((r) => r.name === values.resonator_id);

  // Discord emoji codes: fill the empty ones from what the other records already use, or from an emoji with the same name
  const [emojiCodes, setEmojiCodes] = useState<Map<string, string>>(new Map());
  const lastAuto = useRef<Record<string, string>>({});
  useEffect(() => {
    if (!wantsEmojiFill) return;
    fetch('/api/emojis').then((r) => r.json()).then((j) => setEmojiCodes(new Map((j.items ?? []).map((e: any) => [String(e.name).toLowerCase().replace(/[^a-z0-9]/g, ''), String(e.code)])))).catch(() => {});
  }, [wantsEmojiFill]);
  useEffect(() => {
    if (!wantsEmojiFill) return;
    const byName = (n: unknown) => emojiCodes.get(String(n ?? '').toLowerCase().replace(/[^a-z0-9]/g, ''));
    const fromOthers = (match: string, value: unknown, field: string) =>
      value ? lists.resonators.find((r) => r[match] === value && r[field])?.[field] : undefined;
    const want: Record<string, string | undefined> = {};
    if (hasKey('element_emoji')) {
      want.element_emoji = fromOthers('element', values.element, 'element_emoji') ?? byName(values.element);
      want.weapon_emoji = fromOthers('weapon_type', values.weapon_type, 'weapon_emoji') ?? byName(values.weapon_type);
      want.resonator_emoji = byName(values.name);
    } else {
      want.emoji = byName(values.name);
    }
    const patch: Record<string, string> = {};
    for (const [k, code] of Object.entries(want)) {
      if (!code || !hasKey(k)) continue;
      const cur = String(values[k] ?? '').trim();
      // only an empty field, or one this form filled in itself, is ever touched
      if ((!cur || cur === lastAuto.current[k]) && cur !== code) { patch[k] = code; lastAuto.current[k] = code; }
    }
    if (Object.keys(patch).length) setValues((v) => ({ ...v, ...patch }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emojiCodes, lists.resonators, values.element, values.weapon_type, values.name]);

  // main echo: only echoes that can use the chosen Sonata set(s); everything if none is chosen or nothing matches
  const chosenCodes = parseSets(String(values.echo_set ?? '')).map((p) => sonata.find((c) => c.label.toLowerCase() === p.name.toLowerCase())?.value).filter(Boolean) as string[];
  const all4 = lists.echoes.filter((e) => String(e.cost) === '4' && !e.archived);
  const usable = (e: any) => ((e.sonata_effects ?? []) as string[]).some((c) => chosenCodes.some((code) => String(c).includes(code)));
  const narrowed = chosenCodes.length ? all4.filter(usable) : [];
  const echoes4 = narrowed.length ? narrowed : all4;
  const echoNote = chosenCodes.length && narrowed.length ? `Echoes that can use ${parseSets(String(values.echo_set)).map((p) => p.name).filter(Boolean).join(' / ')} are listed first; 4-cost echoes come next.` : '';
  const lookups: Lookups = {
    element: resonator?.element,
    weapons: lists.weapons
      .filter((w) => !resonator?.weapon_type || w.weapon_type === resonator.weapon_type)
      .sort((a, b) => Number(b.rarity) - Number(a.rarity) || String(a.name).localeCompare(String(b.name)))
      .map((w) => String(w.name)).slice(0, 14),
    sonata,
    echoNote,
    echoIcons: Object.fromEntries(lists.echoes.filter((e) => e.icon_url).map((e) => [String(e.name), optimized(String(e.icon_url), 20)])),
    echo4: echoes4.map((e) => String(e.name)).sort(),
    echoAll: [...lists.echoes.filter((e) => !e.archived)].sort((a, b) => Number(usable(b)) - Number(usable(a)) || Number(String(b.cost) === '4') - Number(String(a.cost) === '4') || String(a.name).localeCompare(String(b.name))).map((e) => String(e.name)),
  };

  const set = (patch: Values) => setValues((s) => ({ ...s, ...patch }));
  const isEcho = fields.some((f) => f.key === 'sonata_effects');
  const [looking, setLooking] = useState(false);
  const [lookNote, setLookNote] = useState('');
  const CLASS_COST: Record<string, string> = { Common: '1', Elite: '3', Overlord: '4', Calamity: '4' };
  async function autofillEcho() {
    const name = String(values.name ?? '').trim();
    if (!name) { setLookNote('Type the echo name first.'); return; }
    setLooking(true); setLookNote('');
    try {
      const j = await (await fetch(`/api/lookup/echo?name=${encodeURIComponent(name)}`)).json();
      if (j.error) throw new Error(j.error);
      const known = new Map(sonata.map((c) => [c.label.toLowerCase(), c.value]));
      for (const [now, old] of Object.entries(SET_EMOJI_ALIAS)) { const code = known.get(now.toLowerCase()); if (code) known.set(old.toLowerCase(), code); }
      const codes = (j.sonata as string[]).map((n) => known.get(n.toLowerCase())).filter(Boolean) as string[];
      set({ cost: j.cost ?? values.cost, class: j.class ?? values.class, description: j.description || values.description, ...(codes.length ? { sonata_effects: codes } : {}) });
      setLookNote(`Filled from the game data: cost ${j.cost}, ${j.class}, ${(j.sonata as string[]).join(', ') || 'no sets listed'}. Check it, then save.`);
    } catch (e: any) { setLookNote(e.message); } finally { setLooking(false); }
  }
  const submit = () => {
    const missing = fields.filter((f) => f.required && String(values[f.key] ?? '').trim() === '');
    if (missing.length) { setError(`Please fill in: ${missing.map((f) => f.label).join(', ')}.`); return; }
    setError('');
    onSubmit(values);
  };

  const isBuild = fields.some((f) => f.key === 'sub_echo1');
  // saved with the build; older builds without it are read from their echo text
  const layout = values.echo_layout || (/cost\s*4/i.test(plain(values.sub_echo1)) ? '44111' : '43311');
  const setLayout = (l: string) => set(l === '44111'
    ? { echo_layout: l, sub_echo1: 'Any Cost 4 Echo X1', sub_echo2: 'Any Cost 1 Echo X3' }
    : { echo_layout: l, sub_echo1: 'Any Cost 3 Echo X2', sub_echo2: 'Any Cost 1 Echo X2' });
  const shape = (f: Field): Field => {
    if (!isBuild || layout !== '44111') return f;
    if (f.key === 'sub_echo1') return { ...f, label: 'Second 4-cost echoes', suggest: 'echo4', help: 'Pick the echoes, or leave "Any Cost 4 Echo X1".' };
    if (f.key === 'sub_stats1') return { ...f, label: 'Main stats on the second 4-cost echo', assist: 'stats4' };
    if (f.key === 'sub_echo2') return { ...f, label: '1-cost echoes' };
    return f;
  };
  const hasAdvanced = fields.some((f) => f.advanced);
  const main = fields.filter((f) => !f.advanced && !f.hidden);
  const more = fields.filter((f) => f.advanced);
  // forms with a "More details" block are shown flat; others keep their section headings
  const field = (f: Field, i: number, list: Field[], headings: boolean) => (
    <Fragment key={f.key}>
      {headings && f.section && (
        <h3 className={`sm:col-span-2 text-sm font-semibold tracking-tight text-primary ${i > 0 ? 'mt-2 border-t border-white/10 pt-4' : ''}`}>{f.section}</h3>
      )}
      {isBuild && f.key === 'main_echo' && (
        <fieldset className="sm:col-span-2">
          <legend className="mb-1 block text-sm font-medium">Echo cost layout</legend>
          <RadioGroup name="echo-layout" legend="Echo cost layout" value={layout} options={['43311', '44111']} required onChange={setLayout} />
          <p className="mt-1 text-sm text-base-content/60">43311 is one 4-cost, two 3-cost and two 1-cost echoes. 44111 is two 4-cost and three 1-cost.</p>
        </fieldset>
      )}
      <div className={f.wide || f.type === 'textarea' || f.type === 'tags' ? 'sm:col-span-2' : ''}>
        <FieldInput f={shape(f)} value={values[f.key]} name={String(values.name ?? '')} lookups={lookups}
          onChange={(v) => setValues((s) => ({ ...s, [f.key]: v, ...(isEcho && f.key === 'class' && CLASS_COST[v] ? { cost: CLASS_COST[v] } : {}), ...(f.key === 'build_name' && fields.some((x) => x.key === 'echo_set') && !String(s.echo_set ?? '').trim() && SONATA_SETS.includes(String(v).replace(/^Alternative /, '')) ? { echo_set: `${String(v).replace(/^Alternative /, '')} X${String(v).includes('Shadow of Shattered Dreams') ? 1 : 5}` } : {}), ...(f.key === 'echo_set' && v && fields.some((x) => x.key === 'build_name') && !String(s.build_name ?? '').trim() ? { build_name: String(v).replace(/ Xd/g, '') } : {}) }))}
          setOther={(k, v) => setValues((s) => ({ ...s, [k]: v }))} />
      </div>
    </Fragment>
  );

  return (
    <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
      {isEcho && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="mono-label mb-2">Autofill</p>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-sm" disabled={looking} onClick={autofillEcho}>
              {looking && <span className="loading loading-spinner loading-xs" />} Fill from game data
            </button>
            <span className="text-sm text-base-content/60">Type the name, then this fills cost, class, Sonata sets and the description.</span>
          </div>
          {lookNote && <p role="status" className="mt-2 text-sm">{lookNote}</p>}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {main.map((f, i) => field(f, i, main, !hasAdvanced))}
      </div>
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
      <div className="modal-action">
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy && <span className="loading loading-spinner loading-sm" />} {submitLabel}
        </button>
      </div>
    </form>
  );
}
