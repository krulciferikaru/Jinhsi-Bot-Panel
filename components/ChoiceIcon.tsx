'use client';
import { useEffect, useState } from 'react';

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const ALIAS: Record<string, string> = { gauntlet: 'gauntlets21d', gauntlets: 'gauntlets21d', crit: 'critrate', endlessresonance: 'lingeringtunes' };

let cache: Promise<Map<string, string>> | null = null;
let loadedAt = 0;
/** The emoji list is re-read after a minute, so an emoji you just added or renamed shows up without a full reload. */
function load(): Promise<Map<string, string>> {
  if (cache && Date.now() - loadedAt > 60_000) cache = null;
  if (!cache) loadedAt = Date.now();
  cache ??= fetch('/api/emojis').then((r) => r.json())
    .then((j) => new Map<string, string>((j.items ?? []).map((e: any) => [key(String(e.name)), String(e.url)])))
    .catch(() => { cache = null; return new Map<string, string>(); });
  return cache;
}

/** The Discord emoji art that matches a choice (element, weapon type, echo cost, stat), if there is one. */
export function useChoiceIcons() {
  const [map, setMap] = useState<Map<string, string>>(new Map());
  useEffect(() => { let on = true; load().then((m) => on && setMap(m)); return () => { on = false; }; }, []);
  return (option: string, label = ''): string | undefined => {
    // a bare number is only an echo cost when the field says so (not a rarity or a priority)
    if (/^\d+$/.test(option)) return /cost/i.test(label) ? map.get(`${option}cost`) : undefined;
    const k = key(option.replace(/\s*(dmg bonus|dmg)$/i, ' DMG'));
    for (const c of [k, key(option), ALIAS[k] ?? '', key(option.replace(/%$/, ''))]) if (c && map.has(c)) return map.get(c);
    return undefined;
  };
}

export function ChoiceIcon({ src }: { src?: string }) {
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" width={20} height={20} loading="lazy" className="h-5 w-5 shrink-0 object-contain" />;
}
