/** Sonata (echo set) names, as written in builds. */
export const SONATA_SETS = [
  'Celestial Light', 'Chromatic Foam', 'Crown of Valor', 'Dream of the Lost', 'Empyrean Anthem', 'Eternal Radiance',
  "Flamewing's Shadow", 'Flaming Clawprint', 'Flash of Electric Reflection', 'Flower of Tinged Yearning', 'Freezing Frost',
  'Frosty Resolve', 'Gusts of Welkin', 'Halo of Starry Radiance', "Heart of Evil's Purge", 'Heart of Sworn Vigil',
  'Lamp of Nether Road', 'Law of Harmony', 'Endless Resonance', 'Midnight Veil', 'Molten Rift', 'Moonlit Clouds', 'Pact of Neonlight Leap',
  'Reel of Spliced Memories', 'Rejuvenating Glow', 'Rite of Gilded Revelation', 'Shadow of Shattered Dreams', 'Sierra Gale',
  'Song of Feathered Trace', 'Sound of True Name', 'Sun-sinking Eclipse', 'Thread of Severed Fate', 'Tidebreaking Courage',
  'Trailblazing Star', 'Void Thunder', 'Windward Pilgrimage', 'Wishes of Quiet Snowfall',
];

/** Sets whose Discord emoji is still named after an older set name. */
export const SET_EMOJI_ALIAS: Record<string, string> = { 'Endless Resonance': 'Lingering Tunes' };

/** "Celestial Light X5", "Celestial Light X2" … for the echo-set dropdown (5-piece sets and the 2/3-piece halves of a mixed set). */
export const SET_OPTIONS = SONATA_SETS.flatMap((s) => [`${s} X5`, `${s} X3`, `${s} X2`]);

const ELEMENTS = ['Aero', 'Glacio', 'Fusion', 'Electro', 'Havoc', 'Spectro'];
export const elementDmg = (el?: string) => (el && ELEMENTS.includes(el) ? `${el} DMG` : '');

export type BuildRole = 'Main DPS' | 'Sub DPS' | 'Support' | 'Healer';
export const ROLE_PRESETS: BuildRole[] = ['Main DPS', 'Sub DPS', 'Support', 'Healer'];

/** Typical main stats for a role, given the resonator's element. */
export function statPreset(role: BuildRole, element?: string) {
  const el = elementDmg(element);
  switch (role) {
    case 'Healer': return { main_stats: ['Healing Bonus'], sub_stats1: ['Energy Regen'], sub_stats2: ['HP%'], sub_stats_priority: 'Energy Regen > Healing Bonus > HP% > CRIT RATE = CRIT DMG' };
    case 'Support': return { main_stats: ['CRIT RATE', 'ATK%'], sub_stats1: ['Energy Regen'], sub_stats2: ['ATK%'], sub_stats_priority: 'Energy Regen > CRIT RATE = CRIT DMG > ATK%' };
    default: return { main_stats: ['CRIT RATE', 'CRIT DMG'], sub_stats1: [el || 'ATK%'], sub_stats2: ['ATK%'], sub_stats_priority: 'Energy Regen >= CRIT RATE = CRIT DMG > ATK% > Flat ATK' };
  }
}

/** Main-stat choices offered under each echo cost. */
export function statChoices(cost: 4 | 3 | 1, element?: string): string[] {
  const el = elementDmg(element);
  if (cost === 4) return ['CRIT RATE', 'CRIT DMG', 'Healing Bonus', 'ATK%', 'HP%', 'DEF%'];
  if (cost === 3) {
    const all = ELEMENTS.map((e) => elementDmg(e));
    return [...(el ? [el] : []), ...all.filter((x) => x !== el), 'Energy Regen', 'ATK%', 'HP%', 'DEF%'];
  }
  return ['ATK%', 'HP%', 'DEF%'];
}

/** Build names: the set name, or "Alternative <set>" for a second build. */
export const BUILD_NAMES = [...SONATA_SETS, ...SONATA_SETS.map((s) => `Alternative ${s}`)];
