/** Helpers for reading game data from the public Encore.moe API. */
const NL = String.fromCharCode(10);
export const normName = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/memphis/g, 'mephis').replace(/[^a-z0-9]/g, '');

/** Game text (HTML with template tags) to Discord markdown, with every number in bold. */
export function gameText(html: string): string {
  return String(html)
    .replace(/<\/?SapTag(=\w+)?>/g, '')
    .replace(/(\d+(?:\.\d+)?)(<\/span>)?\s*\{Cus:Sap,S=(.+?) P=(.+?) SapTag=\w+\}/g, (_m, n, c, a, b) => n + (c ?? '') + ' ' + (+n === 1 ? a : b))
    .replace(/\{Cus:Ipt,Touch=.*? PC=(.*?) Gamepad=.*?\}/g, '$1')
    .replace(/<br\s*\/?>/gi, NL)
    .replace(/<span[^>]*>(.*?)<\/span>/gs, (_m, t) => (/\d/.test(t.replace(/<[^>]+>/g, '')) ? `**${t}**` : t))
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/\*\*\s*\*\*/g, '')
    .split(/(\*\*.*?\*\*)/s).map((p) => (p.startsWith('**') ? p : p.replace(/(?<![\w.])\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)*(?:%|s\b|m\b)?/g, '**$&**'))).join('')
    .replace(/\n{3,}/g, NL + NL).trim();
}

const H = { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' as const };
export const encore = async (path: string) => {
  const r = await fetch(`https://api-v2.encore.moe/api/en/${path}`, H);
  if (!r.ok) throw new Error(`The game data service answered ${r.status}.`);
  return r.json();
};

export const ECHO_CLASS_BY_RARITY: Record<number, { class: string; cost: string }> = {
  0: { class: 'Common', cost: '1' }, 1: { class: 'Elite', cost: '3' }, 2: { class: 'Overlord', cost: '4' }, 3: { class: 'Calamity', cost: '4' },
};
