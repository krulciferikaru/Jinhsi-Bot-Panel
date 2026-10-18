'use client';
import { useEffect, useRef, useState } from 'react';
import type { Reply } from '@/lib/bot/commands';
import { plain } from '@/lib/schema';
import { Combobox } from './Combobox';

type Meta = { name: string; description: string; options: { name: string; description: string; required?: boolean; autocomplete?: string; choices?: string[] }[] };

type Msg = { id: number; user: string; reply?: Reply; sent: string };

function EmbedView({ r }: { r: Reply }) {
  const e = r.embed;
  return (
    <div className="space-y-2">
      {r.content && <p>{r.content}</p>}
      {e && (
        <div className="max-w-xl rounded-md bg-base-200 p-3" style={{ borderLeft: `4px solid ${e.color || '#888'}` }}>
          <div className="flex gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              {e.author && <p className="flex items-center gap-2 text-xs font-semibold">{e.author.icon && <img src={e.author.icon} alt="" className="h-5 w-5 rounded-full" />}{e.author.name}</p>}
              {e.title && <h3 className="font-bold">{plain(e.title)}</h3>}
              {e.description && <p className="whitespace-pre-wrap text-sm">{plain(e.description).replace(/[*][*]/g, "")}</p>}
              {e.fields && (
                <div className="grid grid-cols-3 gap-2 text-sm">
                  {e.fields.map((f, i) => (
                    <div key={i} className={f.inline ? '' : 'col-span-3'}>
                      <div className="font-semibold">{plain(f.name)}</div>
                      <div className="whitespace-pre-wrap wrap-break-word">{plain(f.value).replace(/[*][*]/g, "")}</div>
                    </div>
                  ))}
                </div>
              )}
              {e.footer && <p className="text-xs text-base-content/60">{e.footer}</p>}
            </div>
            {e.thumbnail && <img src={e.thumbnail} alt="" className="h-16 w-16 rounded object-cover" onError={(ev) => (ev.currentTarget.style.display = 'none')} />}
          </div>
        </div>
      )}
    </div>
  );
}

export function Tester() {
  const [COMMANDS, setCommands] = useState<Meta[]>([]);
  const [cmd, setCmd] = useState('');
  useEffect(() => {
    fetch('/api/bot/test').then((r) => r.json()).then((c: Meta[]) => { setCommands(c); setCmd(c[0]?.name ?? ''); });
  }, []);
  const [args, setArgs] = useState<Record<string, string>>({});
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [sugg, setSugg] = useState<Record<string, string[]>>({});
  const endRef = useRef<HTMLDivElement>(null);
  const def = COMMANDS.find((c) => c.name === cmd) ?? { name: cmd, description: '', options: [] as Meta['options'] };

  useEffect(() => { setArgs({}); setSugg({}); }, [cmd]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [msgs]);

  // Load every choice for dropdown options; variant/skill choices depend on the chosen resonator.
  useEffect(() => {
    if (!cmd) return;
    const d = COMMANDS.find((c) => c.name === cmd);
    d?.options.filter((o) => o.autocomplete || o.choices).forEach(async (o) => {
      try {
        const r = await fetch('/api/bot/suggest', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: cmd, option: o.name, typed: '', args: { resonator: args.resonator }, limit: 500 }) });
        const names: string[] = await r.json();
        setSugg((s) => ({ ...s, [o.name]: names }));
      } catch { /* ignore */ }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cmd, COMMANDS.length, args.resonator]);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    const missing = def.options.find((o) => o.required && !args[o.name]);
    if (missing) { setMsgs((m) => [...m, { id: Date.now(), user: 'You', sent: `/${cmd}`, reply: { content: `Pick a value for "${missing.name}" first.` } }]); return; }
    setBusy(true);
    const sent = `/${cmd} ${def.options.filter((o) => args[o.name]).map((o) => `${o.name}:${args[o.name]}`).join(' ')}`.trim();
    try {
      const r = await fetch('/api/bot/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: cmd, args }) });
      const reply: Reply = await r.json();
      setMsgs((m) => [...m, { id: Date.now(), user: 'You', sent, reply }]);
    } finally { setBusy(false); }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <form onSubmit={run} className="card card-border h-fit bg-base-100">
        <div className="card-body gap-3">
          <h2 className="card-title">Run a command</h2>
          <div>
            <label htmlFor="t-cmd" className="mb-1 block text-sm font-medium">Command</label>
            <Combobox id="t-cmd" value={cmd} options={COMMANDS.map((c) => c.name)} onChange={(v) => v && setCmd(v)} />
            <p className="mt-1 text-sm text-base-content/60">{def.description}</p>
          </div>
          {def.options.map((o) => (
            <div key={o.name}>
              <label htmlFor={`t-${o.name}`} className="mb-1 block text-sm font-medium">{o.name}{o.required ? ' *' : ' (optional)'}</label>
              <Combobox id={`t-${o.name}`} value={args[o.name] ?? ''} options={sugg[o.name] ?? []} placeholder={o.description}
                clearLabel={o.required ? undefined : 'None'}
                onChange={(v) => setArgs((a) => ({ ...a, [o.name]: v }))} />
            </div>
          ))}
          <button className="btn btn-primary" disabled={busy}>{busy && <span className="loading loading-spinner loading-sm" />} Send</button>
          <p className="text-xs text-base-content/60">Runs the exact same command code as the live Discord bot, against your MongoDB data. No Discord token needed.</p>
        </div>
      </form>

      <section aria-label="Conversation" className="card card-border bg-base-100">
        <div className="card-body">
          <div className="flex items-center justify-between">
            <h2 className="card-title">Preview</h2>
            {msgs.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setMsgs([])}>Clear</button>}
          </div>
          <div data-lenis-prevent className="max-h-[70vh] min-h-72 space-y-5 overflow-auto" aria-live="polite">
            {msgs.length === 0 && <p className="text-base-content/60">Pick a command and press Send to see what your bot would reply.</p>}
            {msgs.map((m) => (
              <div key={m.id} className="space-y-2">
                <p className="text-sm"><span className="font-semibold">{m.user}</span> <code className="rounded bg-base-200 px-1">{m.sent}</code></p>
                <div className="border-l-2 border-base-300 pl-3"><p className="mb-1 text-sm font-semibold text-primary">Jinhsi Bot</p>{m.reply && <EmbedView r={m.reply} />}</div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
        </div>
      </section>
    </div>
  );
}
