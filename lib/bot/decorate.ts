import { listEmojis } from '../discord-emoji';
import type { BotTarget } from './manager';

/** Puts each bot's own Discord emoji in front of set, echo and stat names that were saved as plain text. */
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const ALIAS: Record<string, string> = {
  endlessresonance: 'lingeringtunes', havoceclipse: 'sunsinkingeclipse', gauntlet: 'gauntlets21d', critrate: 'critrate', critdmg: 'critdmg',
  atk: 'atk', hp: 'hp', def: 'def', energyregen: 'energyregen', healingbonus: 'healingbonus',
};

const cache = new Map<BotTarget, { at: number; map: Map<string, string> }>();

/** name (letters and numbers only, lower case) -> "<:Name:id>" for one bot. Re-read every minute; empty if the bot's emoji cannot be listed. */
export async function emojiMap(target: BotTarget): Promise<Map<string, string>> {
  const hit = cache.get(target);
  if (hit && Date.now() - hit.at < 60_000) return hit.map;
  let map = new Map<string, string>();
  try { map = new Map((await listEmojis(target)).map((e) => [norm(e.name), e.code])); } catch { /* the embed just goes without emoji */ }
  cache.set(target, { at: Date.now(), map });
  return map;
}

export type Decorator = {
  /** the emoji for one name, or '' */
  of(name?: string): string;
  /** a name with its emoji in front, if it has one */
  one(name?: string): string;
  /** echo cost 1, 3 or 4 with its emoji */
  cost(n?: string | number): string;
  /** "Void Thunder X2 + Moonlit Clouds X2" -> each part with its emoji */
  sets(v?: string): string;
  /** a list of names (echoes, stats), each with its emoji */
  names(v?: string | string[], joiner?: string): string;
};

export function decorator(map: Map<string, string> | null): Decorator {
  const code = (name: string): string => {
    if (!map || !name || name.includes('<:')) return '';
    const base = name.replace(/\s*X\d$/i, '').replace(/`/g, '').trim();
    const k = norm(base);
    const stat = norm(base.replace(/%$/, ''));
    return map.get(k) ?? map.get(ALIAS[k] ?? '') ?? map.get(norm(base.replace(/\s*DMG( Bonus)?$/i, ' DMG'))) ?? map.get(ALIAS[stat] ?? stat) ?? '';
  };
  const dress = (s: string) => { const c = code(s); return c ? `${c} ${s}` : s; };
  return {
    of: (name) => code(String(name ?? '')),
    one: (name) => dress(String(name ?? '')),
    cost: (n) => { const c = map?.get(`${n}cost`); return c ? `${c} ${n}` : String(n ?? '—'); },
    sets: (v) => (v ? v.split('+').map((p) => dress(p.trim())).join(' + ') : '—'),
    names: (v, joiner = ', ') => {
      const items = (Array.isArray(v) ? v : v ? String(v).split(' / ') : []).map((x) => String(x).trim()).filter(Boolean);
      return items.length ? items.map(dress).join(joiner) : '—';
    },
  };
}
