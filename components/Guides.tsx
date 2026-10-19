'use client';
import { useEffect, useMemo, useState } from 'react';
import { docIcon, getPath, plain, statLabel, type Doc } from '@/lib/schema';
import { Icon } from './Icon';
import { StarIcon } from './Icons';
import { ChoiceIcon, useChoiceIcons } from './ChoiceIcon';

const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : []);
const clean = (v: unknown) => plain(v) || '—';
/** "Ages of Harvest (Best)" -> { name: "Ages of Harvest", note: "Best" } */
export const splitRank = (s: string) => {
  const m = /^(.*?)\s*\((.*)\)\s*$/.exec(s.trim());
  return m ? { name: m[1].trim(), note: m[2].trim() } : { name: s.trim(), note: '' };
};

/** **bold** from Discord markdown, for passive text. */
export function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (/^\*\*[^*]+\*\*$/.test(p) ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>))}
    </>
  );
}

/**
 * A small link to the same resonator, echo or type on another page. The lists read ?q= and ?f.<filter>= from the address,
 * and a plain link (a full page load) makes them re-read it, even when the link goes to the page you are already on.
 */
export function Shortcut({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="group inline-flex items-center gap-1 text-sm font-semibold text-primary underline decoration-primary/50 underline-offset-4 hover:decoration-primary">
      {children}
      <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 11.5l7-7M5.5 4.5h6v6" /></svg>
    </a>
  );
}
export const q = (name: unknown) => `?q=${encodeURIComponent(String(name ?? ''))}`;
export const filterLink = (page: string, key: string, value: unknown) => `/${page}?f.${key}=${encodeURIComponent(String(value ?? ''))}`;

export function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold tracking-tight text-primary">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}
export const Chips = ({ items, ordered, iconFor }: { items: string[]; ordered?: boolean; iconFor?: (name: string) => string | undefined }) => (
  items.length === 0 ? <p className="text-base-content/60">—</p> : (
    <ul className="flex flex-wrap gap-2">
      {items.map((t, i) => (
        <li key={`${t}-${i}`} className="badge badge-lg gap-2">
          {ordered && <span className="mono-label text-primary">{i + 1}</span>}
          {iconFor && <ChoiceIcon src={iconFor(plain(t) || t)} />}{plain(t) || t}
        </li>
      ))}
    </ul>
  )
);
const Text = ({ v }: { v: unknown }) => (v ? <p className="whitespace-pre-wrap wrap-break-word">{plain(v).length ? String(v).replace(/<a?:\w+:\d+>/g, '').replace(/`/g, '') : '—'}</p> : <p className="text-base-content/60">—</p>);

/* ---------------------------------- Build ---------------------------------- */

export function BuildGuide({ doc }: { doc: Doc }) {
  const iconFor = useChoiceIcons();
  const [known, setKnown] = useState<Set<string> | null>(null);
  useEffect(() => {
    fetch('/api/weapons').then((r) => r.json()).then((rows: Doc[]) => Array.isArray(rows) && setKnown(new Set(rows.map((w) => String(w.name).toLowerCase())))).catch(() => {});
  }, []);

  const weapons = arr(doc.weapons).map(splitRank);
  const second4 = doc.echo_layout === '44111' || (!doc.echo_layout && /cost\s*4/i.test(plain(doc.sub_echo1)));
  // only the slots that have something in them (a 44111 build has no 3-cost echoes)
  const slots: [string, unknown, string[]][] = ([
    ['4-cost', doc.main_echo, arr(doc.main_stats)],
    [second4 ? '4-cost' : '3-cost', doc.sub_echo1, arr(doc.sub_stats1)],
    ['1-cost', doc.sub_echo2, arr(doc.sub_stats2)],
  ] as [string, unknown, string[]][]).filter(([, echoes, stats]) => plain(echoes) || stats.length);
  const team = arr(doc.team_main), alt = arr(doc.team_alt);
  const hasStats = Boolean(plain(doc.sub_stats_priority) || arr(doc.skill_priority).length || arr(doc.best_chain).length || plain(doc.stat_targets));
  const label = 'text-xs uppercase text-base-content/60';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Icon url={docIcon('builds', doc)} label={String(doc.resonator_id ?? '?')} size={64} />
        <div className="min-w-0">
          <h3 className="truncate text-xl font-semibold leading-snug">{doc.build_name}</h3>
        </div>
        {doc.is_primary && <span className="badge badge-sm badge-primary ml-auto font-normal">Primary</span>}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        <Shortcut href={`/resonators${q(doc.resonator_id)}`}>View {String(doc.resonator_id)}</Shortcut>
        <Shortcut href={`/skills${q(doc.resonator_id)}`}>View {String(doc.resonator_id)} skills</Shortcut>
        <Shortcut href={`/builds${q(doc.resonator_id)}`}>View more {String(doc.resonator_id)} builds</Shortcut>
      </div>

      {weapons.length > 0 && (
        <Section title="Best weapons">
          <ol className="space-y-1">
            {weapons.map((w, i) => (
              <li key={`${w.name}-${i}`} className="flex flex-wrap items-center gap-3 rounded-box border border-white/10 px-3 py-2">
                <span className="mono-label w-6 text-primary">{i + 1}</span>
                <a href={`/weapons${q(w.name)}`} className="font-medium hover:underline">{w.name}</a>
                {w.note && <span className="badge badge-sm">{w.note}</span>}
                {known && !known.has(w.name.toLowerCase()) && <span className="badge badge-warning badge-sm" title="No weapon with this name in your Weapons list">not in your weapons</span>}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {(plain(doc.echo_set) || arr(doc.echo_set_alt).length > 0 || slots.length > 0) && (
        <Section title="Echoes">
          {plain(doc.echo_set) && (
            <div>
              <p className={`mb-1 ${label}`}>Echo set</p>
              <Chips items={plain(doc.echo_set).split('+').map((p) => p.trim()).filter(Boolean)} iconFor={(n) => iconFor(n.replace(/\s*X\d$/i, ''))} />
            </div>
          )}
          {arr(doc.echo_set_alt).length > 0 && <div><p className={`mb-1 ${label}`}>Other 2-piece sets that pair well</p><Chips items={arr(doc.echo_set_alt)} iconFor={(n) => iconFor(n)} /></div>}
          {slots.length > 0 && (
            <div className="overflow-x-auto rounded-box border border-white/10">
              <table className="table table-sm">
                <thead><tr><th>Slot</th><th>Echoes</th><th>Main stat</th></tr></thead>
                <tbody>
                  {slots.map(([slot, echoes, stats], i) => (
                    <tr key={`${slot}-${i}`}>
                      <td className="font-medium">{slot}</td>
                      <td className="text-base-content/70">{clean(Array.isArray(echoes) ? echoes.join(', ') : echoes)}</td>
                      <td>{stats.length ? <span className="flex flex-wrap gap-x-3 gap-y-1">{stats.map((x) => <span key={x} className="inline-flex items-center gap-1"><ChoiceIcon src={iconFor(plain(x) || x)} />{plain(x) || x}</span>)}</span> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      {hasStats && (
        <Section title="Stats and priorities">
          {plain(doc.sub_stats_priority) && <div><p className={label}>Substat priority</p><Text v={doc.sub_stats_priority} /></div>}
          {arr(doc.skill_priority).length > 0 && <div><p className={`mb-1 ${label}`}>Skill upgrade order</p><Chips items={arr(doc.skill_priority)} ordered /></div>}
          {arr(doc.best_chain).length > 0 && <div><p className={`mb-1 ${label}`}>Chain nodes worth getting</p><Chips items={arr(doc.best_chain)} ordered /></div>}
          {plain(doc.stat_targets) && <div><p className={label}>Stat targets</p><Text v={doc.stat_targets} /></div>}
        </Section>
      )}

      {(team.length > 0 || alt.length > 0) && (
        <Section title="Teams">
          {team.length > 0 && <div><p className={`mb-1 ${label}`}>{doc.team_name || 'Main team'}</p><Chips items={team} /></div>}
          {alt.length > 0 && <div><p className={`mb-1 ${label}`}>Alternative</p><Chips items={alt} /></div>}
        </Section>
      )}

      {plain(doc.playstyle) && <Section title="Rotation and playstyle"><Text v={doc.playstyle} /></Section>}
      {arr(doc.tags).length > 0 && <Chips items={arr(doc.tags)} />}
    </div>
  );
}

/* --------------------------------- Weapon ---------------------------------- */

export function WeaponGuide({ doc }: { doc: Doc }) {
  const [resonators, setResonators] = useState<Doc[]>([]);
  useEffect(() => {
    fetch('/api/resonators').then((r) => r.json()).then((rows) => Array.isArray(rows) && setResonators(rows)).catch(() => {});
  }, []);
  const iconOf = (name: string) => { const r = resonators.find((x) => String(x.name).toLowerCase() === name.toLowerCase()); return r ? docIcon('resonators', r) : undefined; };
  const signature = plain(doc.signature_for);
  const recommended = arr(doc.recommended_for);
  const who = (name: string) => (
    <li key={name}>
      <a href={`/resonators${q(name)}`} className="badge badge-lg gap-2 hover:border-primary/60">
        <ChoiceIcon src={iconOf(name)} />{name}
      </a>
    </li>
  );

  const stats: [string, React.ReactNode][] = [
    ['Rarity', doc.rarity ? <>{String(doc.rarity)}<StarIcon className="h-5 w-5 text-primary" /></> : '—'],
    ['Base ATK', clean(getPath(doc, 'base_attack.stats')).replace(/\*\*/g, '')],
    [statLabel(getPath(doc, 'secondary_stat.title'), getPath(doc, 'secondary_stat.stats')) || 'Secondary stat', clean(getPath(doc, 'secondary_stat.stats')).replace(/\*\*/g, '')],
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Icon url={docIcon('weapons', doc)} label={String(doc.name)} size={64} />
        <div className="min-w-0"><h3 className="truncate text-xl font-semibold leading-snug">{doc.name}</h3></div>
      </div>

      <Section title="Stats">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {stats.map(([k, v]) => (<div key={k} className="rounded-box border border-white/10 p-3"><dt className="text-xs uppercase text-base-content/60">{k}</dt><dd className="flex items-center gap-1.5 font-semibold">{v}</dd></div>))}
        </dl>
      </Section>

      <Section title="Passive">{doc.passive ? <p className="whitespace-pre-wrap wrap-break-word"><Rich text={String(doc.passive)} /></p> : <p className="text-base-content/60">—</p>}</Section>

      {(signature || recommended.length > 0) && (
        <Section title="Resonators">
          {signature && <div><p className="mb-1 text-xs uppercase text-base-content/60">Signature weapon of</p><ul className="flex flex-wrap gap-2">{who(signature)}</ul></div>}
          {recommended.length > 0 && <div><p className="mb-1 text-xs uppercase text-base-content/60">Recommended for</p><ul className="flex flex-wrap gap-2">{recommended.map(who)}</ul></div>}
        </Section>
      )}

      {doc.upgrade_materials && <Section title="Upgrade materials"><Text v={doc.upgrade_materials} /></Section>}
      {doc.notes && <Section title="Notes"><Text v={doc.notes} /></Section>}
    </div>
  );
}
