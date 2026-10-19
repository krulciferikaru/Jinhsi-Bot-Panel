import { getStore } from '../db';
import { docIcon, resonatorIconUrl, statLabel, type CollectionKey, type Doc } from '../schema';
import { decorator, emojiMap } from './decorate';
import type { BotTarget } from './manager';

/** Platform-neutral embed. Rendered by the in-browser tester and converted to a Discord embed by the live bot. */
export type Embed = {
  title?: string;
  description?: string;
  color?: string;
  thumbnail?: string;
  author?: { name: string; icon?: string };
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: string;
};
export type Reply = { content?: string; embed?: Embed; ephemeral?: boolean };
/** target: the bot answering, so its own emoji can be shown. The browser tester leaves it out. */
export type Ctx = { ping?: number; target?: BotTarget };

type Option = {
  name: string;
  description: string;
  required?: boolean;
  autocomplete?: 'resonators' | 'echoes' | 'weapons' | 'build-resonators' | 'skill-resonators' | 'variant' | 'skill';
  choices?: string[];
};
export type CommandDef = {
  name: string;
  description: string;
  options: Option[];
  run(args: Record<string, string | undefined>, ctx: Ctx): Promise<Reply>;
};

const ELEMENT_COLORS: Record<string, string> = {
  Aero: '#34ebc0', Electro: '#8c00ff', Fusion: '#eb5c34', Glacio: '#69e1ff', Havoc: '#e100ff', Spectro: '#fff200',
};
const ECHO_COLORS: Record<string, string> = { Common: '#ffffff', Elite: '#7cbf8e', Overlord: '#f2ffa1', Calamity: '#ff3636' };
const NEUTRAL = '#f2f2f2';

// Archived records are hidden from the bot, as are builds flagged is_current: false.
async function live(c: CollectionKey): Promise<Doc[]> {
  return (await getStore().list(c)).filter((d) => !d.archived && !(c === 'builds' && d.is_current === false));
}
const norm = (s?: string) => (s ?? '').trim().toLowerCase();
const matches = (d: Doc, key: string, name?: string) =>
  norm(d[key]) === norm(name) || (d.shortcuts ?? []).some((s: string) => norm(s) === norm(name));

async function find(c: CollectionKey, key: string, name?: string) {
  return (await live(c)).find((d) => matches(d, key, name)) ?? null;
}
const missing = (what: string, name?: string): Reply => ({
  content: `${what} "${name ?? ''}" was not found. Try the autocomplete suggestions.`, ephemeral: true,
});
const trunc = (s: string, n = 1024) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const list = (a?: string[]) => (a && a.length ? a.join(', ') : '—');
const stars = (n: number | string) => '★'.repeat(Number(n) || 0);
/** "Ages of Harvest (Best)" -> name + note */
const splitRank = (s: unknown) => {
  const m = /^(.*?)\s*\((.*)\)\s*$/.exec(String(s).trim());
  return m ? { name: m[1].trim(), note: m[2].trim() } : { name: String(s).trim(), note: '' };
};
/** Ordered list as "1. Ages of Harvest (Best)". */
const ranked = (a?: unknown, dress: (n: string) => string = (n) => n) => (Array.isArray(a) ? a : []).map((s, i) => {
  const { name, note } = splitRank(s);
  return `${i + 1}. ${dress(name)}${note ? ` (${note})` : ''}`;
}).join('\n');
const rankName = (s: unknown) => splitRank(s).name.toLowerCase();
const hex = (n?: number) => (typeof n === 'number' ? '#' + n.toString(16).padStart(6, '0') : undefined);

/** "<:SierraGale:123>" -> "Sierra Gale" */
export const emojiName = (code: string) => {
  const m = /<a?:(\w+):\d+>/.exec(code);
  return m ? m[1].replace(/([a-z])([A-Z])/g, '$1 $2') : code;
};

async function resonatorByName(name: string) {
  return (await live('resonators')).find((d) => matches(d, 'name', name)) ?? null;
}
const resonatorColor = (r: Doc | null) => hex(r?.ui?.color) ?? ELEMENT_COLORS[r?.element] ?? NEUTRAL;

function chunkFields(title: string, lines: string[]) {
  const fields: { name: string; value: string }[] = [];
  let buf = '';
  let part = 1;
  for (const l of lines) {
    if ((buf + '\n' + l).length > 1000) { fields.push({ name: part === 1 ? title : `${title} (cont.)`, value: buf }); buf = ''; part++; }
    buf = buf ? buf + '\n' + l : l;
  }
  if (buf) fields.push({ name: part === 1 ? title : `${title} (cont.)`, value: buf });
  return fields.slice(0, 25);
}

function groupList(rows: Doc[], by: (d: Doc) => string, line: (d: Doc) => string, title: string, head: (k: string) => string = (k) => k): Reply {
  const groups = new Map<string, string[]>();
  for (const d of rows) {
    const k = by(d) || 'Other';
    groups.set(k, [...(groups.get(k) ?? []), line(d)]);
  }
  const fields = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .flatMap(([k, lines]) => chunkFields(head(k), lines)).slice(0, 25);
  return { embed: { title, color: NEUTRAL, fields, footer: `${rows.length} total` } };
}

async function buildsFor(name?: string) {
  const r = await resonatorByName(name ?? '');
  const key = r?.name ?? name;
  return (await live('builds'))
    .filter((b) => norm(b.resonator_id) === norm(key))
    .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
}
async function skillsFor(name?: string) {
  const r = await resonatorByName(name ?? '');
  const key = r?.name ?? name;
  return (await live('skills'))
    .filter((s) => norm(s.resonator_id) === norm(key))
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
}

export const COMMANDS: CommandDef[] = [
  {
    name: 'build', description: "Show a resonator's recommended build",
    options: [
      { name: 'resonator', description: 'Resonator name', required: true, autocomplete: 'build-resonators' },
      { name: 'variant', description: 'Build variant', autocomplete: 'variant' },
    ],
    async run({ resonator, variant }, ctx) {
      const dec = decorator(ctx.target ? await emojiMap(ctx.target) : null);
      const builds = await buildsFor(resonator);
      if (!builds.length) return missing('Build for', resonator);
      const v = builds.find((b) => norm(b.build_name) === norm(variant)) ?? builds[0];
      const r = await resonatorByName(v.resonator_id);
      return {
        embed: {
          title: `${r ? `${dec.one(r.element)} · ${dec.one(r.weapon_type)} · ${stars(r.rarity)} ` : ''}${dec.one(v.resonator_id)}`,
          description: `**${v.build_name}**${v.role ? ` · ${v.role}` : ''}`,
          color: resonatorColor(r), thumbnail: r?.icon_url || resonatorIconUrl(v.resonator_id),
          fields: [
            ...(v.weapons?.length ? [{ name: 'Best weapons', value: trunc(ranked(v.weapons, dec.one)), inline: false }] : []),
            { name: 'Echo set', value: dec.sets(v.echo_set), inline: true },
            { name: v.main_echo && String(v.main_echo).includes(' / ') ? 'Main echoes' : 'Main echo', value: dec.names(v.main_echo, '\n'), inline: true },
            ...(v.echo_set_alt?.length ? [{ name: 'Other 2-piece sets', value: trunc(dec.names(v.echo_set_alt)), inline: false }] : []),
            { name: 'Main stats', value: dec.names(v.main_stats), inline: false },
            { name: v.sub_echo1 || 'Sub echo 1', value: dec.names(v.sub_stats1), inline: true },
            { name: v.sub_echo2 || 'Sub echo 2', value: dec.names(v.sub_stats2), inline: true },
            { name: 'Substat priority', value: v.sub_stats_priority || '—', inline: false },
            ...(v.skill_priority?.length ? [{ name: 'Skill order', value: trunc(v.skill_priority.join(' → ')), inline: false }] : []),
            ...(v.best_chain?.length ? [{ name: 'Chain nodes', value: trunc(v.best_chain.join(', ')), inline: true }] : []),
            ...(v.stat_targets ? [{ name: 'Stat targets', value: trunc(String(v.stat_targets), 500), inline: false }] : []),
            ...(v.team_main?.length ? [{ name: v.team_name ? `Team: ${v.team_name}` : 'Team', value: trunc(dec.names(v.team_main)), inline: false }] : []),
            ...(v.team_alt?.length ? [{ name: 'Alternative team', value: trunc(dec.names(v.team_alt)), inline: false }] : []),
            ...(v.playstyle ? [{ name: 'Playstyle', value: trunc(String(v.playstyle), 600), inline: false }] : []),
          ],
          footer: builds.length > 1 ? `Variants: ${builds.map((b) => b.build_name).join(' · ')}` : undefined,
        },
      };
    },
  },
  {
    name: 'skill', description: "Show a resonator's skills",
    options: [
      { name: 'resonator', description: 'Resonator name', required: true, autocomplete: 'skill-resonators' },
      { name: 'skill', description: 'Skill type', autocomplete: 'skill' },
    ],
    async run({ resonator, skill }, ctx) {
      const dec = decorator(ctx.target ? await emojiMap(ctx.target) : null);
      const skills = await skillsFor(resonator);
      if (!skills.length) return missing('Skills for', resonator);
      const r = await resonatorByName(skills[0].resonator_id);
      const color = resonatorColor(r);
      const icon = r?.icon_url || resonatorIconUrl(skills[0].resonator_id);
      const wanted = skills.find((s) => norm(s.skill_type) === norm(skill));
      if (wanted) {
        return {
          embed: {
            title: `${wanted.emoji ? wanted.emoji + ' ' : ''}${wanted.name}`, description: trunc(wanted.description ?? '', 4000), color, thumbnail: icon,
            author: { name: `${wanted.resonator_id} · ${wanted.skill_type}`, icon },
          },
        };
      }
      return {
        embed: {
          title: `${dec.one(skills[0].resonator_id)} skills`, color, thumbnail: icon,
          description: 'Pick a skill type with the `skill` option for full details.',
          fields: skills.slice(0, 25).map((s) => ({ name: s.skill_type, value: s.name || '—', inline: true })),
        },
      };
    },
  },
  {
    name: 'echo', description: 'Show information about an echo',
    options: [{ name: 'name', description: 'Echo name', required: true, autocomplete: 'echoes' }],
    async run({ name }, ctx) {
      const dec = decorator(ctx.target ? await emojiMap(ctx.target) : null);
      const e = await find('echoes', 'name', name);
      if (!e) return missing('Echo', name);
      return {
        embed: {
          title: dec.one(e.name), color: ECHO_COLORS[e.class] ?? NEUTRAL, thumbnail: docIcon('echoes', e),
          fields: [
            { name: 'Cost', value: dec.cost(e.cost), inline: true },
            { name: 'Class', value: dec.one(e.class), inline: true },
            { name: 'Sonata effect', value: dec.names((e.sonata_effects ?? []).map((s: string) => emojiName(s))), inline: true },
            { name: 'Description', value: trunc(e.description || '—') },
          ],
        },
      };
    },
  },
  {
    name: 'weapon', description: 'Show information about a weapon',
    options: [{ name: 'name', description: 'Weapon name', required: true, autocomplete: 'weapons' }],
    async run({ name }, ctx) {
      const dec = decorator(ctx.target ? await emojiMap(ctx.target) : null);
      const w = await find('weapons', 'name', name);
      if (!w) return missing('Weapon', name);
      // Which resonators' builds list this weapon, best rank first.
      const recs: { r: string; rank: number }[] = [];
      for (const b of await live('builds')) {
        (Array.isArray(b.weapons) ? b.weapons : []).forEach((x: unknown, i: number) => {
          if (rankName(x) === norm(w.name)) recs.push({ r: String(b.resonator_id), rank: i + 1 });
        });
      }
      recs.sort((a, b) => a.rank - b.rank || a.r.localeCompare(b.r));
      const recommended = [...new Map(recs.map((x) => [x.r, x])).values()].map((x) => `${x.r} (#${x.rank})`).join(', ');
      return {
        embed: {
          title: `${dec.one(w.name)} ${stars(w.rarity)}`, color: NEUTRAL, thumbnail: docIcon('weapons', w),
          fields: [
            { name: 'Type', value: dec.one(w.weapon_type), inline: true },
            { name: 'ATK', value: w.base_attack?.stats || '—', inline: true },
            { name: dec.one(statLabel(w.secondary_stat?.title, w.secondary_stat?.stats)) || 'Secondary stat', value: w.secondary_stat?.stats || '—', inline: true },
            { name: 'Passive', value: trunc(w.passive || '—') },
            ...(recommended ? [{ name: 'Recommended for', value: trunc(recommended), inline: false }] : []),
            ...(w.notes ? [{ name: 'Notes', value: trunc(String(w.notes), 500), inline: false }] : []),
          ],
        },
      };
    },
  },
  {
    name: 'resonatorlist', description: 'List all resonators',
    options: [{ name: 'sort_by', description: 'Group by', choices: ['element', 'weapon', 'star'] }],
    async run({ sort_by }, ctx) {
      const dec = decorator(ctx.target ? await emojiMap(ctx.target) : null);
      const by = sort_by === 'weapon' ? (d: Doc) => d.weapon_type : sort_by === 'star' ? (d: Doc) => `${d.rarity}★` : (d: Doc) => d.element;
      return groupList(await live('resonators'), by, (d) => dec.one(d.name), 'Resonators', sort_by === 'star' ? undefined : (k) => dec.one(k));
    },
  },
  {
    name: 'echolist', description: 'List all echoes',
    options: [{ name: 'sort_by', description: 'Group by', choices: ['class', 'cost', 'sonata'] }],
    async run({ sort_by }, ctx) {
      const dec = decorator(ctx.target ? await emojiMap(ctx.target) : null);
      const rows = await live('echoes');
      if (sort_by === 'sonata') {
        const exp = rows.flatMap((d) => (d.sonata_effects?.length ? d.sonata_effects : ['None']).map((s: string) => ({ ...d, _g: emojiName(s) })));
        return groupList(exp, (d) => d._g, (d) => dec.one(d.name), 'Echoes', (k) => dec.one(k));
      }
      const by = sort_by === 'cost' ? (d: Doc) => `Cost ${d.cost}` : (d: Doc) => d.class;
      return groupList(rows, by, (d) => dec.one(d.name), 'Echoes', sort_by === 'cost' ? (k) => { const c = dec.cost(k.replace('Cost ', '')); return c.includes('<:') ? c.replace(/ (\d)$/, ' Cost $1') : k; } : (k) => dec.one(k));
    },
  },
  {
    name: 'weaponlist', description: 'List all weapons',
    options: [{ name: 'sort_by', description: 'Group by', choices: ['weapon_type', 'star'] }],
    async run({ sort_by }, ctx) {
      const dec = decorator(ctx.target ? await emojiMap(ctx.target) : null);
      const by = sort_by === 'star' ? (d: Doc) => `${d.rarity}★` : (d: Doc) => d.weapon_type;
      return groupList(await live('weapons'), by, (d) => `${dec.one(d.name)} (${d.rarity}★)`, 'Weapons', sort_by === 'star' ? undefined : (k) => dec.one(k));
    },
  },
  {
    name: 'help', description: 'Command overview', options: [],
    async run() {
      return {
        embed: {
          title: 'Jinhsi Bot help', color: NEUTRAL,
          description: 'An information bot for **Wuthering Waves**. Data comes from your MongoDB database, so changes made in the dashboard show up here right away.',
          fields: COMMANDS.filter((c) => c.name !== 'help').map((c) => ({ name: `/${c.name}`, value: c.description })),
        },
      };
    },
  },
  {
    name: 'ping', description: 'Check bot latency', options: [],
    async run(_a, ctx) {
      return { content: ctx.ping != null && ctx.ping >= 0 ? `Pong! ${Math.round(ctx.ping)}ms` : 'Pong!' };
    },
  },
];

export const findCommand = (name: string) => COMMANDS.find((c) => c.name === name);

export async function runCommand(name: string, args: Record<string, string | undefined>, ctx: Ctx = {}): Promise<Reply> {
  const cmd = findCommand(name);
  if (!cmd) return { content: `Unknown command /${name}`, ephemeral: true };
  try {
    return await cmd.run(args, ctx);
  } catch (e: any) {
    return { content: `Something went wrong: ${e?.message ?? e}`, ephemeral: true };
  }
}

/** Suggestions for an option, at most 25 (Discord's limit). */
export async function suggest(cmdName: string, optName: string, typed: string, args: Record<string, string | undefined>, limit = 25): Promise<string[]> {
  const opt = findCommand(cmdName)?.options.find((o) => o.name === optName);
  if (!opt) return [];
  let names: string[] = opt.choices ?? [];
  switch (opt.autocomplete) {
    case 'variant': names = (await buildsFor(args.resonator)).map((b) => b.build_name); break;
    case 'skill': names = (await skillsFor(args.resonator)).map((s) => s.skill_type); break;
    case 'build-resonators': names = [...new Set((await live('builds')).map((b) => String(b.resonator_id)))]; break;
    case 'skill-resonators': names = [...new Set((await live('skills')).map((s) => String(s.resonator_id)))]; break;
    case 'resonators': case 'echoes': case 'weapons':
      names = (await live(opt.autocomplete)).map((d) => String(d.name)); break;
  }
  const t = typed.toLowerCase();
  return names.filter((n) => n.toLowerCase().includes(t)).sort().slice(0, limit);
}
