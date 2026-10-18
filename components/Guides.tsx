'use client';
import { useEffect, useMemo, useState } from 'react';
import { docIcon, getPath, plain, type Doc } from '@/lib/schema';
import { Icon } from './Icon';
import { ChoiceIcon, useChoiceIcons } from './ChoiceIcon';

const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : []);
const clean = (v: unknown) => plain(v) || '—';
/** "Ages of Harvest (Best)" -> { name: "Ages of Harvest", note: "Best" } */
export const splitRank = (s: string) => {
  const m = /^(.*?)\s*\((.*)\)\s*$/.exec(s.trim());
  return m ? { name: m[1].trim(), note: m[2].trim() } : { name: s.trim(), note: '' };
};

/** **bold** from Discord markdown, for passive text. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (/^\*\*[^*]+\*\*$/.test(p) ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>))}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold tracking-tight text-primary">{title}</h3>
      {children}
    </section>
  );
}
const Chips = ({ items, ordered, iconFor }: { items: string[]; ordered?: boolean; iconFor?: (name: string) => string | undefined }) => (
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
        <Icon url={docIcon('builds', doc)} label={String(doc.resonator_id ?? '?')} size={56} />
        <div className="min-w-0">
          <p className="mono-label">{doc.resonator_id}{doc.role ? ` · ${doc.role}` : ''}</p>
          <p className="truncate text-xl font-semibold">{doc.build_name}</p>
        </div>
        {doc.is_primary && <span className="badge badge-primary ml-auto">Primary</span>}
      </div>

      {weapons.length > 0 && (
        <Section title="Best weapons">
          <ol className="space-y-1">
            {weapons.map((w, i) => (
              <li key={`${w.name}-${i}`} className="flex flex-wrap items-center gap-3 rounded-box border border-white/10 px-3 py-2">
                <span className="mono-label w-6 text-primary">{i + 1}</span>
                <span className="font-medium">{w.name}</span>
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
                      <td>{stats.length ? stats.map((x) => plain(x) || x).join(' / ') : '—'}</td>
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

type Rec = { resonator: string; build: string; rank: number; note: string; primary: boolean };

export function WeaponGuide({ doc }: { doc: Doc }) {
  const [builds, setBuilds] = useState<Doc[] | null>(null);
  useEffect(() => {
    fetch('/api/builds').then((r) => r.json()).then((rows) => Array.isArray(rows) && setBuilds(rows)).catch(() => setBuilds([]));
  }, []);

  // "Recommended for" is computed from the Builds' weapon lists, so it never needs typing twice.
  const recs = useMemo<Rec[]>(() => {
    const me = String(doc.name).toLowerCase();
    const out: Rec[] = [];
    for (const b of builds ?? []) {
      if (b.archived || b.is_current === false) continue;
      arr(b.weapons).map(splitRank).forEach((w, i) => {
        if (w.name.toLowerCase() === me) out.push({ resonator: String(b.resonator_id), build: String(b.build_name), rank: i + 1, note: w.note, primary: Boolean(b.is_primary) });
      });
    }
    return out.sort((a, b) => a.rank - b.rank || a.resonator.localeCompare(b.resonator));
  }, [builds, doc.name]);

  const stats: [string, string][] = [
    ['Type', String(doc.weapon_type ?? '—')],
    ['Rarity', doc.rarity ? '★'.repeat(Number(doc.rarity)) : '—'],
    ['Base ATK', clean(getPath(doc, 'base_attack.stats')).replace(/\*\*/g, '')],
    [String(getPath(doc, 'secondary_stat.title') ?? 'Secondary stat'), clean(getPath(doc, 'secondary_stat.stats')).replace(/\*\*/g, '')],
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Icon url={docIcon('weapons', doc)} label={String(doc.name)} size={56} />
        <div className="min-w-0"><p className="mono-label">{doc.weapon_type}</p><p className="truncate text-xl font-semibold">{doc.name}</p></div>
      </div>

      <Section title="Stats">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map(([k, v]) => (<div key={k} className="rounded-box border border-white/10 p-3"><dt className="text-xs uppercase text-base-content/60">{k}</dt><dd className="font-semibold">{v}</dd></div>))}
        </dl>
      </Section>

      <Section title="Passive">{doc.passive ? <p className="whitespace-pre-wrap wrap-break-word"><Rich text={String(doc.passive)} /></p> : <p className="text-base-content/60">—</p>}</Section>

      <Section title="Recommended for">
        {builds === null ? <p className="text-base-content/60">Checking your builds…</p>
          : recs.length === 0 ? <p className="text-base-content/60">No build lists this weapon yet. Add it to a build’s “Best weapons” and it will show up here.</p> : (
            <ul className="space-y-1">
              {recs.map((r, i) => (
                <li key={i} className="flex flex-wrap items-center gap-3 rounded-box border border-white/10 px-3 py-2">
                  <span className="badge badge-primary badge-sm">#{r.rank}</span>
                  <span className="font-medium">{r.resonator}</span>
                  <span className="text-sm text-base-content/60">{r.build}</span>
                  {r.note && <span className="badge badge-sm">{r.note}</span>}
                </li>
              ))}
            </ul>
          )}
      </Section>

      {doc.upgrade_materials && <Section title="Upgrade materials"><Text v={doc.upgrade_materials} /></Section>}
      {doc.notes && <Section title="Notes"><Text v={doc.notes} /></Section>}
    </div>
  );
}
