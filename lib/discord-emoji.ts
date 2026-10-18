import { REST, Routes } from 'discord.js';
import { clientIdFor, tokenFor } from './bot/invite';
import type { BotTarget } from './bot/manager';

/** Discord's limit for an emoji image. */
export const EMOJI_MAX_BYTES = 256 * 1024;
export const EMOJI_LIMIT = 2000;

export class EmojiError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export type AppEmoji = { id: string; name: string; animated: boolean; url: string; code: string };

function api(target: BotTarget) {
  const token = tokenFor(target);
  const appId = clientIdFor(target);
  if (!token || !appId) throw new EmojiError(`The ${target} bot is not configured. Set DISCORD_TOKEN_${target.toUpperCase()} in .env.local and restart.`);
  return { rest: new REST({ version: '10' }).setToken(token), appId };
}

const shape = (e: any): AppEmoji => ({
  id: e.id, name: e.name, animated: Boolean(e.animated),
  url: `https://cdn.discordapp.com/emojis/${e.id}.${e.animated ? 'gif' : 'png'}?size=64`,
  code: `<${e.animated ? 'a' : ''}:${e.name}:${e.id}>`,
});

/** Wrap Discord REST errors in something readable. */
function explain(e: any): never {
  const status = e?.status ?? 500;
  if (status === 429) throw new EmojiError('Discord is rate limiting emoji changes. Wait a minute and try again.', 429);
  if (status === 401) throw new EmojiError('Discord rejected the bot token.', 401);
  if (status === 403) throw new EmojiError('This bot is not allowed to manage its emojis.', 403);
  if (status === 400) throw new EmojiError(String(e?.rawError?.message ?? e?.message ?? 'Discord rejected the emoji.'), 400);
  throw new EmojiError(e?.message ?? 'Discord request failed.', status >= 400 && status < 600 ? status : 502);
}

// Discord takes seconds to list ~1000 emojis, so the list is kept: a changed emoji shows within 20 seconds,
// and the old list is served at once while a new one loads. Our own create, rename and delete clear it.
const listed = new Map<BotTarget, { at: number; items: AppEmoji[] }>();
const loading = new Map<BotTarget, Promise<AppEmoji[]>>();
const LIST_FRESH_MS = 20_000;

async function fetchEmojis(target: BotTarget): Promise<AppEmoji[]> {
  const { rest, appId } = api(target);
  try {
    const r: any = await rest.get(Routes.applicationEmojis(appId));
    const items = ((r.items ?? r) as any[]).map(shape).sort((a, b) => a.name.localeCompare(b.name));
    listed.set(target, { at: Date.now(), items });
    return items;
  } catch (e) { return explain(e); }
}

export async function listEmojis(target: BotTarget): Promise<AppEmoji[]> {
  const hit = listed.get(target);
  const refresh = () => {
    let p = loading.get(target);
    if (!p) { p = fetchEmojis(target).finally(() => loading.delete(target)); loading.set(target, p); }
    return p;
  };
  if (hit) {
    if (Date.now() - hit.at > LIST_FRESH_MS) refresh().catch(() => {});
    return hit.items;
  }
  return refresh();
}

/** "Aero Predator" -> "AeroPredator"; Discord allows 2-32 letters, numbers and underscores. */
export function emojiName(input: string): string {
  const joined = input.replace(/[^A-Za-z0-9_]+/g, ' ').trim().split(/\s+/).map((w) => w[0]?.toUpperCase() + w.slice(1)).join('');
  const name = joined.slice(0, 32);
  if (name.length < 2) throw new EmojiError('Emoji names need at least 2 letters or numbers.');
  return name;
}

/** Turn any PNG/WebP/JPEG into a 128x128 PNG under Discord's size limit. GIFs are passed through untouched. */
export async function prepareEmojiImage(input: Buffer): Promise<{ data: Buffer; mime: 'image/png' | 'image/gif' }> {
  if (input.length > 3 && input.toString('ascii', 0, 3) === 'GIF') {
    if (input.length > EMOJI_MAX_BYTES) throw new EmojiError('That GIF is larger than 256 KB, which is Discord’s limit for emojis.');
    return { data: input, mime: 'image/gif' };
  }
  const sharp = (await import('sharp')).default;
  try {
    for (const [size, palette] of [[128, false], [128, true], [96, true], [64, true]] as const) {
      const out = await sharp(input).rotate()
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ compressionLevel: 9, palette }).toBuffer();
      if (out.length <= EMOJI_MAX_BYTES) return { data: out, mime: 'image/png' };
    }
  } catch {
    throw new EmojiError('Could not read that image. Use a PNG, WebP, JPEG or GIF.');
  }
  throw new EmojiError('Could not shrink that image under 256 KB.');
}

export async function createEmoji(target: BotTarget, name: string, image: { data: Buffer; mime: string }): Promise<AppEmoji> {
  const { rest, appId } = api(target);
  listed.delete(target);
  try {
    const e = await rest.post(Routes.applicationEmojis(appId), {
      body: { name, image: `data:${image.mime};base64,${image.data.toString('base64')}` },
    });
    return shape(e);
  } catch (e) { return explain(e); }
}

export async function renameEmoji(target: BotTarget, id: string, name: string): Promise<AppEmoji> {
  const { rest, appId } = api(target);
  listed.delete(target);
  try { return shape(await rest.patch(Routes.applicationEmoji(appId, id), { body: { name } })); }
  catch (e) { return explain(e); }
}

export async function deleteEmoji(target: BotTarget, id: string): Promise<void> {
  const { rest, appId } = api(target);
  listed.delete(target);
  try { await rest.delete(Routes.applicationEmoji(appId, id)); }
  catch (e) { explain(e); }
}

/** Which field of each icon-bearing collection holds the Discord emoji code. */
export const EMOJI_FIELD = { resonators: 'resonator_emoji', echoes: 'emoji', weapons: 'emoji' } as const;

export type EnsureResult = { target: BotTarget; code?: string; id?: string; created?: boolean; error?: string };

/**
 * Create the emoji on each bot, or reuse one that already has that name (so uploading an icon twice, or for a
 * record that already has an emoji, never errors or makes duplicates). One failing bot does not stop the others.
 */
export type EmojiCache = Map<BotTarget, Map<string, { code: string; id: string }>>;

export async function ensureEmoji(targets: BotTarget[], name: string, png: Buffer, cache?: EmojiCache): Promise<EnsureResult[]> {
  const out: EnsureResult[] = [];
  let image: { data: Buffer; mime: string };
  try { image = await prepareEmojiImage(png); }
  catch (e: any) { return targets.map((target) => ({ target, error: e instanceof EmojiError ? e.message : 'Could not prepare the emoji image.' })); }
  for (const target of targets) {
    try {
      // Reuse a known list when many emojis are made in a row, so Discord is not asked for it each time.
      let known = cache?.get(target);
      if (!known) {
        known = new Map((await listEmojis(target)).map((e) => [e.name.toLowerCase(), { code: e.code, id: e.id }]));
        cache?.set(target, known);
      }
      const found = known.get(name.toLowerCase());
      if (found) { out.push({ target, code: found.code, id: found.id, created: false }); continue; }
      const e = await createEmoji(target, name, image);
      known.set(name.toLowerCase(), { code: e.code, id: e.id });
      out.push({ target, code: e.code, id: e.id, created: true });
      if (cache) await new Promise((r) => setTimeout(r, 350)); // stay under Discord's rate limit in a batch
    } catch (e: any) {
      out.push({ target, error: e instanceof EmojiError ? e.message : 'Discord request failed.' });
    }
  }
  return out;
}
