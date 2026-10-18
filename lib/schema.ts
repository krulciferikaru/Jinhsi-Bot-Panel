/**
 * Mirrors the documents that already exist in the `wuthering_waves` MongoDB database.
 * Field keys may use dot paths (e.g. "base_attack.stats") for nested objects.
 */
import { EXAMPLES } from './examples';

export type CollectionKey = 'resonators' | 'echoes' | 'weapons' | 'builds' | 'skills';

export type Field = {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'tags' | 'ref' | 'boolean' | 'image';
  required?: boolean;
  help?: string;
  placeholder?: string;
  options?: string[];
  ref?: CollectionKey; // type "ref": pick a record name from another collection
  wide?: boolean;
  /** heading shown above this field (and the ones after it) in forms and guides */
  section?: string;
  /** a realistic sample value, shown under the field in forms (see lib/examples.ts) */
  example?: string;
  /** type "image": key of the emoji field in the same record, filled when an emoji is created from the icon */
  emojiKey?: string;
  /** type "image": folder in the asset repository */
  folder?: 'CharacterIcons' | 'EchoIcons' | 'WeaponIcons';
  /** text fields: pick from a list (the typed value is kept if it is not in the list) */
  suggest?: 'sonata' | 'echo4' | 'buildname';
  /** tags fields: tick boxes from a known list instead of typing */
  choices?: 'sonata' | 'sets';
  /** tags fields: clickable suggestions derived from the chosen resonator */
  assist?: 'stats4' | 'stats3' | 'stats1' | 'weapons';
  /** shown inside the collapsed 'More details' block of the form */
  advanced?: boolean;
  /** saved with the record but drawn by a custom control, not as an ordinary form field */
  hidden?: boolean;
};

export type CollectionConfig = {
  key: CollectionKey;
  label: string;
  singular: string;
  blurb: string;
  titleKey: string;
  subtitleKey?: string;
  columns: { key: string; label: string }[];
  fields: Field[];
  badge?: string;
  /** doc field holding an icon URL */
  iconKey?: string;
  /** otherwise, resonator whose icon to use (looked up by name in this doc field) */
  iconResonatorKey?: string;
  /** dropdown filters; options are built from the data (array fields are flattened) */
  filters?: { key: string; label: string }[];
  /** show one card per distinct value of this field, listing its records inside */
  groupBy?: string;
};

export const ELEMENTS = ['Aero', 'Electro', 'Fusion', 'Glacio', 'Havoc', 'Spectro'];
export const WEAPON_TYPES = ['Broadblade', 'Gauntlet', 'Pistols', 'Rectifier', 'Sword'];
export const ECHO_CLASSES = ['Common', 'Elite', 'Overlord', 'Calamity'];
export const SKILL_TYPES = [
  'Basic Attack', 'Resonance Skill', 'Resonance Liberation', 'Forte Circuit', 'Intro Skill', 'Outro Skill',
  'Inherent Skill 1', 'Inherent Skill 2', 'Sequence 1', 'Sequence 2', 'Sequence 3', 'Sequence 4', 'Sequence 5', 'Sequence 6',
];
export const SKILL_CATEGORIES = ['Active', 'Passive', 'Chain', 'Concerto'];
export const ROLES = ['Main DPS', 'Sub DPS', 'Support', 'Healer', 'Hybrid'];

const SHORTCUTS: Field = { key: 'shortcuts', label: 'Shortcuts / aliases', type: 'tags', help: 'Alternative names players can type, e.g. "jh".' };
const EMOJI_HELP = 'Discord emoji code, e.g. <:Name:123456789>.';

export const COLLECTIONS: Record<CollectionKey, CollectionConfig> = {
  resonators: {
    key: 'resonators', label: 'Resonators', singular: 'Resonator', titleKey: 'name', badge: 'element', iconKey: 'icon_url',
    blurb: 'Playable resonataors, that shows their respective element, weapon and rarity.',
    filters: [{ key: 'element', label: 'Element' }, { key: 'weapon_type', label: 'Weapon' }, { key: 'rarity', label: 'Rarity' }],
    columns: [{ key: 'element', label: 'Element' }, { key: 'weapon_type', label: 'Weapon' }, { key: 'rarity', label: 'Rarity' }],
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'element', label: 'Element', type: 'select', options: ELEMENTS, required: true },
      { key: 'weapon_type', label: 'Weapon type', type: 'select', options: WEAPON_TYPES, required: true },
      { key: 'rarity', label: 'Rarity (stars)', type: 'select', options: ['4', '5'], required: true },
      SHORTCUTS,
      { key: 'icon_url', label: 'Icon', type: 'image', folder: 'CharacterIcons', emojiKey: 'resonator_emoji', wide: true },
      { key: 'resonator_emoji', label: 'Resonator emoji', type: 'text', help: EMOJI_HELP },
      { key: 'element_emoji', label: 'Element emoji', type: 'text', help: EMOJI_HELP },
      { key: 'weapon_emoji', label: 'Weapon emoji', type: 'text', help: EMOJI_HELP },
    ],
  },
  echoes: {
    key: 'echoes', label: 'Echoes', singular: 'Echo', titleKey: 'name', badge: 'class', iconKey: 'icon_url',
    blurb: 'Equipable echoes that shows their respective cost, class and sonata effects.',
    filters: [{ key: 'class', label: 'Class' }, { key: 'cost', label: 'Cost' }, { key: 'sonata_effects', label: 'Sonata effect' }],
    columns: [{ key: 'cost', label: 'Cost' }, { key: 'class', label: 'Class' }],
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'cost', label: 'Cost', type: 'select', options: ['1', '3', '4'], required: true },
      { key: 'class', label: 'Class', type: 'select', options: ECHO_CLASSES, required: true },
      { key: 'sonata_effects', label: 'Sonata effects', type: 'tags', choices: 'sonata', help: 'Tick every set this echo can use. Anything else goes under Other.' },
      { key: 'description', label: 'Description', type: 'textarea', help: 'Discord markdown works, e.g. **bold**.' },
      SHORTCUTS,
      { key: 'icon_url', label: 'Icon', type: 'image', folder: 'EchoIcons', emojiKey: 'emoji', wide: true },
      { key: 'emoji', label: 'Emoji', type: 'text', help: EMOJI_HELP },
    ],
  },
  weapons: {
    key: 'weapons', label: 'Weapons', singular: 'Weapon', titleKey: 'name', badge: 'weapon_type', iconKey: 'icon_url',
    blurb: 'Equipable weapons that shows their respective type, rarity and secondary stat.',
    filters: [{ key: 'weapon_type', label: 'Weapon type' }, { key: 'rarity', label: 'Rarity' }, { key: 'secondary_stat.title', label: 'Secondary stat' }],
    columns: [{ key: 'weapon_type', label: 'Type' }, { key: 'rarity', label: 'Rarity' }, { key: 'secondary_stat.title', label: 'Stat' }],
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true, section: 'Overview' },
      { key: 'weapon_type', label: 'Weapon type', type: 'select', options: WEAPON_TYPES, required: true },
      { key: 'rarity', label: 'Rarity (stars)', type: 'select', options: ['1', '2', '3', '4', '5'], required: true },
      { key: 'base_attack.stats', label: 'Base ATK', type: 'text', placeholder: '**587**' },
      { key: 'secondary_stat.title', label: 'Secondary stat', type: 'text', placeholder: 'CRIT Rate' },
      { key: 'secondary_stat.stats', label: 'Secondary stat value', type: 'text', placeholder: '**24.3%**' },
      { key: 'passive', label: 'Passive', type: 'textarea', section: 'Passive', help: 'List the values for refinements 1 to 5 separated by slashes, e.g. **12.8%/16%/19.2%/22.4%/25.6%**.' },
      { key: 'upgrade_materials', label: 'Upgrade materials', type: 'textarea', section: 'Guide', wide: true, help: 'What it costs to level it. Free text.' },
      { key: 'notes', label: 'Notes', type: 'textarea', wide: true, help: 'Anything players should know. The “recommended for” list is built automatically from your Builds.' },
      SHORTCUTS,
      { key: 'icon_url', label: 'Icon', type: 'image', folder: 'WeaponIcons', emojiKey: 'emoji', wide: true },
      { key: 'emoji', label: 'Emoji', type: 'text', help: EMOJI_HELP },
    ],
  },
  builds: {
    key: 'builds', label: 'Builds', singular: 'Build', titleKey: 'build_name', subtitleKey: 'resonator_id', iconResonatorKey: 'resonator_id',
    blurb: 'Recommended builds for each resonator, showing the echo sets and stats. ',
    groupBy: 'resonator_id',
    filters: [{ key: 'resonator_id', label: 'Resonator' }, { key: 'role', label: 'Role' }, { key: 'is_primary', label: 'Primary' }, { key: 'echo_set', label: 'Echo set' }],
    columns: [{ key: 'priority', label: 'Priority' }, { key: 'is_primary', label: 'Primary' }, { key: 'echo_set', label: 'Echo set' }],
    fields: [
      { key: 'resonator_id', label: 'Resonator', type: 'ref', ref: 'resonators', required: true, section: 'Overview' },
      { key: 'build_name', label: 'Build name', type: 'text', required: true, suggest: 'buildname', help: 'Named after the Sonata set. Pick "Alternative …" for a second build.' },
      { key: 'role', label: 'Role', type: 'select', options: ROLES },
      { key: 'priority', label: 'Priority', type: 'number', help: '1 is shown first.' },
      { key: 'is_primary', label: 'Primary build', type: 'boolean' },
      { key: 'is_current', label: 'Current (shown by the bot)', type: 'boolean' },
      { key: 'tags', label: 'Tags', type: 'tags' },

      { key: 'weapons', label: 'Best weapons, in order', type: 'tags', wide: true, assist: 'weapons', section: 'Weapons', help: 'Best first. Add an optional note in brackets: "Ages of Harvest (Best)", "Kumokiri (87.9%)".', advanced: true },

      { key: 'echo_set', label: 'Echo set', type: 'text', section: 'Echoes', suggest: 'sonata' },
      { key: 'echo_set_alt', label: 'Other 2-piece sets that pair well', type: 'tags', wide: true, choices: 'sets', help: 'For a 3-piece or mixed set: the 2-piece sets that can go with it, such as Void Thunder or Reel of Spliced Memories.' },
      { key: 'echo_layout', label: 'Echo cost layout', type: 'select', options: ['43311', '44111'], hidden: true },
      { key: 'main_echo', label: 'Main echoes', type: 'text', suggest: 'echo4', help: 'Add one or more. A 4-cost echo is the usual choice, but 3-cost and 1-cost echoes work too.' },
      { key: 'main_stats', label: 'Main stats on the 4-cost echo', type: 'tags', wide: true, assist: 'stats4' },
      { key: 'sub_echo1', label: '3-cost echoes', type: 'text' },
      { key: 'sub_stats1', label: 'Main stats on the 3-cost echoes', type: 'tags', assist: 'stats3' },
      { key: 'sub_echo2', label: '1-cost echoes', type: 'text' },
      { key: 'sub_stats2', label: 'Main stats on the 1-cost echoes', type: 'tags', assist: 'stats1' },

      { key: 'sub_stats_priority', label: 'Substat priority', type: 'textarea', section: 'Stats and priorities', help: 'Highest first, e.g. Energy Regen >= CRIT RATE = CRIT DMG > ATK%.' },
      { key: 'skill_priority', label: 'Skill upgrade order', type: 'tags', wide: true, help: 'First to upgrade first.', advanced: true },
      { key: 'best_chain', label: 'Resonance chain nodes worth getting', type: 'tags', help: 'Best first, e.g. S5, S6, S3.', advanced: true },
      { key: 'stat_targets', label: 'Stat targets', type: 'textarea', wide: true, advanced: true },

      { key: 'team_name', label: 'Main team name', type: 'text', section: 'Teams', advanced: true },
      { key: 'team_main', label: 'Main team', type: 'tags', help: 'Resonator names.', advanced: true },
      { key: 'team_alt', label: 'Alternative team', type: 'tags', help: 'Resonator names.', advanced: true },

      { key: 'playstyle', label: 'Rotation and playstyle notes', type: 'textarea', wide: true, section: 'Notes', advanced: true },
    ],
  },
  skills: {
    key: 'skills', label: 'Skills', singular: 'Skill', titleKey: 'name', subtitleKey: 'resonator_id', iconResonatorKey: 'resonator_id',
    blurb: 'Shows the skill descriptions of each playable resonator.',
    groupBy: 'resonator_id',
    filters: [{ key: 'resonator_id', label: 'Resonator' }, { key: 'skill_type', label: 'Skill type' }, { key: 'skill_category', label: 'Category' }],
    columns: [{ key: 'skill_type', label: 'Type' }, { key: 'skill_category', label: 'Category' }, { key: 'order', label: 'Order' }],
    fields: [
      { key: 'resonator_id', label: 'Resonator', type: 'ref', ref: 'resonators', required: true },
      { key: 'skill_type', label: 'Skill type', type: 'select', options: SKILL_TYPES, required: true },
      { key: 'skill_category', label: 'Category', type: 'select', options: SKILL_CATEGORIES },
      { key: 'name', label: 'Skill name', type: 'text', required: true },
      { key: 'order', label: 'Order', type: 'number' },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'emoji', label: 'Emoji', type: 'text', help: EMOJI_HELP },
    ],
  },
};

export const COLLECTION_KEYS = Object.keys(COLLECTIONS) as CollectionKey[];

// Attach the sample values to their fields.
for (const c of COLLECTION_KEYS) for (const f of COLLECTIONS[c].fields) f.example = EXAMPLES[c][f.key];
export const isCollection = (k: string): k is CollectionKey => k in COLLECTIONS;

export type Doc = { _id: string; archived?: boolean; [k: string]: any };

export const ASSET_BASE = 'https://raw.githubusercontent.com/krulciferikaru/Database/main/WutheringWavesAssets';
export const resonatorIconUrl = (name: string) => `${ASSET_BASE}/CharacterIcons/${String(name).replace(/ /g, '_')}.png`;

/** Icon URL for any document: its own icon_url, or its resonator's icon. */
export function docIcon(c: CollectionKey, d: Doc): string {
  const cfg = COLLECTIONS[c];
  if (cfg.iconKey && d[cfg.iconKey]) return String(d[cfg.iconKey]);
  if (cfg.iconResonatorKey && d[cfg.iconResonatorKey]) return resonatorIconUrl(d[cfg.iconResonatorKey]);
  return '';
}

export function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
}

export const getPath = (o: any, p: string) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
export function setPath(o: Record<string, any>, p: string, v: any) {
  const ks = p.split('.');
  let cur = o;
  ks.slice(0, -1).forEach((k) => { cur = cur[k] ??= {}; });
  cur[ks[ks.length - 1]] = v;
  return o;
}

/** "<:SierraGale:123>" -> "Sierra Gale"; other values pass through. */
export const emojiName = (code: string) => {
  const m = /<a?:(\w+):\d+>/.exec(code);
  return m ? m[1].replace(/([a-z])([A-Z])/g, '$1 $2') : code;
};

/** Strip Discord emoji codes and backticks for plain-text display. */
export const plain = (s: unknown) => String(s ?? '').replace(/<a?:\w+:\d+>/g, '').replace(/`/g, '').replace(/\s+/g, ' ').trim();
