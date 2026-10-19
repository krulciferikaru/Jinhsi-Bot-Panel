'use client';
import { useEffect, useMemo, useState } from 'react';
import { SKILL_CATEGORY_LABELS, docIcon, plain, type Doc } from '@/lib/schema';
import { properSetName } from '@/lib/sets';
import { ChoiceIcon, useChoiceIcons } from './ChoiceIcon';
import { Chips, Rich, Section, Shortcut, filterLink, q } from './Guides';
import { Icon } from './Icon';
import { StarIcon } from './Icons';

const emojiUrl = (code: unknown) => {
  const m = /<a?:\w+:(\d+)>/.exec(String(code ?? ''));
  return m ? `https://cdn.discordapp.com/emojis/${m[1]}.png?size=64` : undefined;
};
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter(Boolean) : v ? [String(v)] : []);

/** The top of every view dialog: the art, the name and one line of plain text. */
export function ViewHeader({ doc, collection, title, meta, art }: { doc: Doc; collection: 'resonators' | 'echoes' | 'weapons' | 'builds' | 'skills'; title: string; meta?: string; art?: string }) {
  return (
    <div className="flex items-center gap-4">
      <Icon url={art ?? docIcon(collection, doc)} label={title} size={64} />
      <div className="min-w-0">
        <h3 className="truncate text-xl font-semibold leading-snug">{title}</h3>
        {meta && <p className="truncate text-base-content/70">{meta}</p>}
      </div>
    </div>
  );
}

function Facts({ items }: { items: { label: string; value: React.ReactNode; link?: React.ReactNode }[] }) {
  return (
    <div className={`grid grid-cols-2 gap-3 ${items.length >= 4 ? 'sm:grid-cols-4' : items.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dl className="rounded-box border border-white/10 p-3">
            <dt className="text-xs uppercase text-base-content/60">{i.label}</dt>
            <dd className="mt-0.5 flex items-center gap-2 font-semibold">{i.value}</dd>
          </dl>
          {i.link && <div className="mt-2 px-1">{i.link}</div>}
        </div>
      ))}
    </div>
  );
}

function Links({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-x-5 gap-y-1">{children}</div>;
}

/** The record's Discord emoji, shown as pictures with their names (never the raw codes). */
function EmojiRow({ items }: { items: { label: string; code: unknown }[] }) {
  const shown = items.filter((i) => emojiUrl(i.code));
  if (!shown.length) return null;
  return (
    <Section title="Discord emoji">
      <ul className="flex flex-wrap gap-3">
        {shown.map((i) => (
          <li key={i.label} className="flex items-center gap-2 rounded-box border border-white/10 px-3 py-2 text-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={emojiUrl(i.code)} alt="" width={24} height={24} className="h-6 w-6 object-contain" />
            <span className="text-base-content/70">{i.label}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

const useRows = (path: string) => {
  const [rows, setRows] = useState<Doc[] | null>(null);
  useEffect(() => {
    let on = true;
    fetch(path).then((r) => r.json()).then((x) => on && setRows(Array.isArray(x) ? x : [])).catch(() => on && setRows([]));
    return () => { on = false; };
  }, [path]);
  return rows;
};

/* -------------------------------- Resonator -------------------------------- */

export function ResonatorView({ doc }: { doc: Doc }) {
  const iconFor = useChoiceIcons();
  const builds = useRows('/api/builds');
  const skills = useRows('/api/skills');
  // a build's echo set may hold emoji codes or just names ("Trailblazing Star X5"): use the code, else look the name up
  const setIcons = (v: unknown): string[] => {
    const raw = String(v ?? '');
    const coded = (raw.match(/<a?:\w+:\d+>/g) ?? []).map(emojiUrl).filter(Boolean) as string[];
    if (coded.length) return coded;
    return plain(raw).split('+').map((p) => iconFor(properSetName(p.trim().replace(/\s*X\d$/i, '')))).filter(Boolean) as string[];
  };
  const mine = (r: Doc) => String(r.resonator_id).toLowerCase() === String(doc.name).toLowerCase() && !r.archived;
  const myBuilds = useMemo(() => (builds ?? []).filter(mine).sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99)), [builds, doc.name]); // eslint-disable-line react-hooks/exhaustive-deps
  const mySkills = useMemo(() => (skills ?? []).filter(mine), [skills, doc.name]); // eslint-disable-line react-hooks/exhaustive-deps
  const byCategory = Object.entries(SKILL_CATEGORY_LABELS)
    .map(([k, label]) => [label, mySkills.filter((s) => s.skill_category === k).length] as const)
    .filter(([, n]) => n > 0);

  return (
    <div className="space-y-6">
      <ViewHeader doc={doc} collection="resonators" title={String(doc.name)} />
      <Section title="Overview">
        <Facts items={[
          { label: 'Element', value: <><ChoiceIcon src={iconFor(String(doc.element ?? ''))} />{doc.element || '—'}</> },
          { label: 'Weapon', value: <><ChoiceIcon src={iconFor(String(doc.weapon_type ?? ''))} />{doc.weapon_type || '—'}</> },
          { label: 'Rarity', value: doc.rarity ? <>{String(doc.rarity)}<StarIcon className="h-5 w-5 text-primary" /></> : '—' },
        ]} />
      </Section>
      <Section title="Builds">
        {builds === null ? <p className="text-base-content/60">Loading…</p>
          : myBuilds.length === 0 ? <p className="text-base-content/60">No builds yet.</p> : (
            <ul className="space-y-1">
              {myBuilds.map((b) => (
                <li key={String(b._id)} className="flex flex-wrap items-center gap-x-3 rounded-box border border-white/10 px-3 py-2">
                  {setIcons(b.echo_set).map((src) => <ChoiceIcon key={src} src={src} />)}
                  <span className="font-medium">{String(b.build_name)}</span>
                  {b.role && <span className="text-sm text-base-content/60">{plain(b.role)}</span>}
                  {b.is_primary && <span className="badge badge-sm badge-primary font-normal">Primary</span>}
                </li>
              ))}
            </ul>
          )}
        <Links><Shortcut href={`/builds${q(doc.name)}`}>View more {String(doc.name)} builds</Shortcut></Links>
      </Section>
      <Section title="Skills">
        {skills === null ? <p className="text-base-content/60">Loading…</p>
          : byCategory.length === 0 ? <p className="text-base-content/60">No skills yet.</p>
            : <p className="text-base-content/80">{mySkills.length} skills: {byCategory.map(([label, n]) => `${n} ${label.toLowerCase()}`).join(', ')}</p>}
        <Links><Shortcut href={`/skills${q(doc.name)}`}>View more {String(doc.name)} skills</Shortcut></Links>
      </Section>
      {arr(doc.shortcuts).length > 0 && <Section title="Aliases"><Chips items={arr(doc.shortcuts)} /></Section>}
      <EmojiRow items={[{ label: 'Resonator', code: doc.resonator_emoji }, { label: 'Element', code: doc.element_emoji }, { label: 'Weapon', code: doc.weapon_emoji }]} />
    </div>
  );
}

/* ---------------------------------- Echo ----------------------------------- */

export function EchoView({ doc }: { doc: Doc }) {
  const iconFor = useChoiceIcons();
  const sets = ((doc.sonata_effects ?? []) as string[])
    .flatMap((s) => String(s).match(/<a?:\w+:\d+>/g) ?? [])
    .map((code) => ({ code, name: properSetName(code.replace(/<a?:(\w+):\d+>/, '$1').replace(/([a-z])([A-Z])/g, '$1 $2')) }));
  return (
    <div className="space-y-6">
      <ViewHeader doc={doc} collection="echoes" title={String(doc.name)} />
      <Section title="Overview">
        <Facts items={[
          { label: 'Cost', value: String(doc.cost || '—'), link: doc.cost ? <Shortcut href={filterLink('echoes', 'cost', doc.cost)}>View more {String(doc.cost)}-cost echoes</Shortcut> : undefined },
          { label: 'Class', value: doc.class || '—', link: doc.class ? <Shortcut href={filterLink('echoes', 'class', doc.class)}>View more {String(doc.class)} echoes</Shortcut> : undefined },
        ]} />
      </Section>
      <Section title="Sonata sets" action={sets.length > 0 ? <span className="text-sm text-base-content/60">Select a set to see its echoes</span> : undefined}>
        {sets.length === 0 ? <p className="text-base-content/60">No Sonata sets yet.</p> : (
          <ul className="flex flex-wrap gap-2">
            {sets.map((s, i) => (
              <li key={`${s.code}-${i}`}>
                <a href={filterLink('echoes', 'sonata_effects', s.name)} className="badge badge-lg gap-2 hover:border-primary/60">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={emojiUrl(s.code)} alt="" width={20} height={20} className="h-5 w-5 object-contain" />
                  {s.name}
                </a>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Description">
        {doc.description ? <p className="whitespace-pre-wrap break-words"><Rich text={String(doc.description)} /></p> : <p className="text-base-content/60">No description yet.</p>}
      </Section>
      {arr(doc.shortcuts).length > 0 && <Section title="Aliases"><Chips items={arr(doc.shortcuts)} /></Section>}
      <EmojiRow items={[{ label: 'Echo', code: doc.emoji }]} />
    </div>
  );
}

/* ---------------------------------- Skill ---------------------------------- */

export function SkillView({ doc }: { doc: Doc }) {
  const category = SKILL_CATEGORY_LABELS[String(doc.skill_category)] ?? doc.skill_category;
  return (
    <div className="space-y-6">
      <ViewHeader doc={doc} collection="skills" title={String(doc.name ?? doc.skill_type)} art={emojiUrl(doc.emoji) ?? docIcon('skills', doc)} />
      <Section title="Overview">
        <Facts items={[
          { label: 'Resonator', value: String(doc.resonator_id ?? '—') },
          { label: 'Skill type', value: String(doc.skill_type ?? '—') },
          { label: 'Category', value: String(category ?? '—') },
          ...(doc.order != null && doc.order !== '' ? [{ label: 'Order', value: String(doc.order) }] : []),
        ]} />
      </Section>
      <Section title="Description">
        {doc.description ? <p className="whitespace-pre-wrap break-words"><Rich text={String(doc.description)} /></p> : <p className="text-base-content/60">No description yet.</p>}
      </Section>
      <Links>
        <Shortcut href={`/resonators${q(doc.resonator_id)}`}>View {String(doc.resonator_id)}</Shortcut>
        <Shortcut href={`/skills${q(doc.resonator_id)}`}>View more {String(doc.resonator_id)} skills</Shortcut>
        <Shortcut href={`/builds${q(doc.resonator_id)}`}>View {String(doc.resonator_id)} builds</Shortcut>
      </Links>
    </div>
  );
}
