'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useToast } from './Toast';

type Target = 'test' | 'live';
type Snap = {
  target: Target;
  status: 'stopped' | 'starting' | 'online' | 'error';
  tag?: string; error?: string; startedAt?: number; commandsRun: number; hasToken: boolean;
  logs: { t: number; level: string; msg: string }[];
};
type All = Record<Target, Snap>;

const META: Record<Target, { title: string; blurb: string; token: string }> = {
  test: { title: 'Test bot', blurb: 'Run Jinhsi Test Bot', token: 'DISCORD_TOKEN_TEST' },
  live: { title: 'Live bot', blurb: 'Run Jinhsi Bot', token: 'DISCORD_TOKEN_LIVE' },
};
const LABEL = { stopped: 'Offline', starting: 'Starting…', online: 'Online', error: 'Error' } as const;
const BADGE = { stopped: 'badge-neutral', starting: 'badge-warning', online: 'badge-success', error: 'badge-error' } as const;

function BotCard({ target, snap, busy, onStart, onStop }: {
  target: Target; snap?: Snap; busy: boolean; onStart: () => void; onStop: () => void;
}) {
  const m = META[target];
  const running = snap?.status === 'online' || snap?.status === 'starting';
  const live = target === 'live';
  return (
    <section aria-labelledby={`bot-${target}`} className={`card card-border bg-base-100 ${live ? 'live-card' : ''}`}>
      <div className="card-body gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="mono-label mb-1">{live ? 'Production' : 'Development'}</p>
            <h2 id={`bot-${target}`} className="card-title text-2xl">{m.title}</h2>
            <p className="text-sm text-base-content/60">
              {snap?.status === 'online' ? <>As <strong>{snap.tag}</strong> · {snap.commandsRun} commands</> : m.blurb}
            </p>
          </div>
          <span className={`badge badge-lg shrink-0 ${snap ? BADGE[snap.status] : 'badge-ghost'}`} role="status">
            {snap?.status === 'online' && <span className="pulse-dot mr-2" />}{snap ? LABEL[snap.status] : 'Checking…'}
          </span>
        </div>

        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          className={`btn btn-lg ${running ? 'btn-error' : 'btn-primary'}`}
          disabled={busy || !snap || snap.status === 'starting' || (!running && !snap.hasToken)}
          onClick={running ? onStop : onStart}>
          {(busy || snap?.status === 'starting') && <span className="loading loading-spinner" />}
          {running ? `Stop ${m.title.toLowerCase()}` : `Start ${m.title.toLowerCase()}`}
        </motion.button>

        {snap && !snap.hasToken && (
          <p role="alert" className="text-sm text-warning">
            Add <code>{m.token}</code> to <code>.env.local</code> and restart the app to enable this bot.
          </p>
        )}
        {snap?.status === 'error' && snap.error && <p role="alert" className="text-sm text-error">{snap.error}</p>}

        <details className="collapse collapse-arrow border border-white/10">
          <summary className="collapse-title min-h-0 py-3 text-sm font-medium">Activity log ({snap?.logs.length ?? 0})</summary>
          <div className="collapse-content">
            <ol data-lenis-prevent className="max-h-48 space-y-1 overflow-auto font-mono text-xs" aria-live="polite">
              {(!snap || snap.logs.length === 0) && <li className="text-base-content/60">Nothing yet.</li>}
              {snap && [...snap.logs].reverse().map((l, i) => (
                <li key={i} className={l.level === 'error' ? 'text-error' : l.level === 'warn' ? 'text-warning' : ''}>
                  {new Date(l.t).toLocaleTimeString()} {l.msg}
                </li>
              ))}
            </ol>
          </div>
        </details>
      </div>
    </section>
  );
}

export function BotPanel() {
  const toast = useToast();
  const [all, setAll] = useState<All | null>(null);
  const [busy, setBusy] = useState<Target | null>(null);
  const confirmRef = useRef<HTMLDialogElement>(null);

  const refresh = useCallback(async () => {
    try { setAll(await (await fetch('/api/bot', { cache: 'no-store' })).json()); } catch { /* keep last */ }
  }, []);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [refresh]);

  async function act(action: 'start' | 'stop', target: Target) {
    setBusy(target);
    try {
      const r = await fetch('/api/bot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, target }) });
      const j: All = await r.json();
      setAll(j);
      const s = j[target];
      if (action === 'start') toast(s.status === 'error' ? 'error' : 'success', s.status === 'error' ? s.error ?? 'Could not start the bot.' : `${META[target].title} is starting.`);
      else toast('info', `${META[target].title} stopped.`);
    } catch (e: any) { toast('error', e.message); }
    finally { setBusy(null); }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-4 md:grid-cols-2">
        <BotCard target="test" snap={all?.test} busy={busy === 'test'} onStart={() => act('start', 'test')} onStop={() => act('stop', 'test')} />
        <BotCard target="live" snap={all?.live} busy={busy === 'live'} onStart={() => confirmRef.current?.showModal()} onStop={() => act('stop', 'live')} />
      </div>

      <dialog ref={confirmRef} className="modal" aria-labelledby="live-confirm">
        <div data-lenis-prevent className="modal-box">
          <h2 id="live-confirm" className="mb-2 text-xl font-bold">Start the live bot?</h2>
          <p>It will go online for every server it is in and answer real members. Data changes you make here apply immediately.</p>
          <div className="modal-action">
            <form method="dialog" className="flex gap-2">
              <button className="btn">Cancel</button>
              <button className="btn btn-primary" onClick={() => act('start', 'live')}>Start live bot</button>
            </form>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop"><button tabIndex={-1} aria-label="Close dialog">close</button></form>
      </dialog>
    </div>
  );
}
