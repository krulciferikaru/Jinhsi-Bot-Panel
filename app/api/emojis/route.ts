import { NextResponse } from 'next/server';
import { fail, withErrors } from '@/lib/api';
import { record } from '@/lib/activity';
import { clientIdFor } from '@/lib/bot/invite';
import { isTarget, type BotTarget } from '@/lib/bot/manager';
import {
  EMOJI_LIMIT, EmojiError, createEmoji, deleteEmoji, emojiName, listEmojis, prepareEmojiImage, renameEmoji,
} from '@/lib/discord-emoji';

export const dynamic = 'force-dynamic';

const MAX_FILES = 40;
const MAX_IN = 8 * 1024 * 1024;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const bad = (e: unknown) => (e instanceof EmojiError ? fail(e.message, e.status) : null);

/** GET ?target=live|test: every application emoji the bot owns. */
export const GET = withErrors(async (req: Request) => {
  const target = new URL(req.url).searchParams.get('target') ?? 'live';
  if (!isTarget(target)) return fail('target must be "live" or "test".');
  try {
    const items = await listEmojis(target);
    return NextResponse.json({ target, appId: clientIdFor(target), items, limit: EMOJI_LIMIT });
  } catch (e) { return bad(e) ?? Promise.reject(e); }
});

/**
 * POST multipart: files[], names[] (parallel arrays), targets[] (default ["live"]).
 * Each image is shrunk to a 128x128 PNG and created as an application emoji. Not all-or-nothing: every
 * file gets its own result, because Discord has no batch call.
 */
export const POST = withErrors(async (req: Request) => {
  const form = await req.formData();
  const files = form.getAll('files');
  const names = form.getAll('names').map(String);
  const targets = (form.getAll('targets').map(String).filter(isTarget) as BotTarget[]);
  const use = targets.length ? [...new Set(targets)] : (['live'] as BotTarget[]);

  if (files.length === 0) return fail('Choose at least one image.');
  if (files.length > MAX_FILES) return fail(`Upload at most ${MAX_FILES} emojis at a time.`);
  if (names.length !== files.length) return fail('Each image needs a name.');

  type R = { name: string; target: BotTarget; ok: boolean; code?: string; id?: string; url?: string; error?: string; existing?: string };
  const results: R[] = [];
  const existing = new Map<BotTarget, Map<string, string>>();
  for (const t of use) {
    try { existing.set(t, new Map((await listEmojis(t)).map((e) => [e.name.toLowerCase(), e.code]))); }
    catch (e) { return bad(e) ?? Promise.reject(e); }
  }

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    let name = names[i];
    try {
      if (!(f instanceof File)) throw new EmojiError('Not a file.');
      if (f.size > MAX_IN) throw new EmojiError('Larger than 8 MB.');
      name = emojiName(names[i]);
      const image = await prepareEmojiImage(Buffer.from(await f.arrayBuffer()));
      for (const t of use) {
        const dup = existing.get(t)!.get(name.toLowerCase());
        if (dup) { results.push({ name, target: t, ok: false, error: `An emoji named ${name} already exists on the ${t} bot.`, existing: dup }); continue; }
        try {
          const e = await createEmoji(t, name, image);
          existing.get(t)!.set(name.toLowerCase(), e.code);
          results.push({ name, target: t, ok: true, code: e.code, id: e.id, url: e.url });
          await record({ action: 'emoji-upload', collection: 'emojis', title: name, detail: `${t} bot ${e.code}`, undoable: false });
          await sleep(350); // stay under Discord's rate limit
        } catch (err: any) {
          results.push({ name, target: t, ok: false, error: err instanceof EmojiError ? err.message : 'Discord request failed.' });
          if (err instanceof EmojiError && err.status === 429) {
            for (let j = i + 1; j < files.length; j++) use.forEach((t2) => results.push({ name: names[j], target: t2, ok: false, error: 'Skipped: Discord is rate limiting. Try again in a minute.' }));
            return NextResponse.json({ results });
          }
        }
      }
    } catch (err: any) {
      const msg = err instanceof EmojiError ? err.message : 'Could not process that image.';
      use.forEach((t) => results.push({ name, target: t, ok: false, error: msg }));
    }
  }
  return NextResponse.json({ results });
});

/** PATCH { target, id, name } */
export const PATCH = withErrors(async (req: Request) => {
  const { target, id, name } = await req.json();
  if (!isTarget(target) || typeof id !== 'string' || !/^\d+$/.test(id)) return fail('Invalid request.');
  try {
    const clean = emojiName(String(name ?? ''));
    const before = (await listEmojis(target)).find((e) => e.id === id);
    const e = await renameEmoji(target, id, clean);
    await record({ action: 'emoji-rename', collection: 'emojis', title: `${before?.name ?? id} → ${clean}`, detail: `${target} bot ${e.code}. Records that use the old code keep working: the id did not change.`, undoable: false });
    return NextResponse.json(e);
  } catch (e) { return bad(e) ?? Promise.reject(e); }
});

/** DELETE { target, id } */
export const DELETE = withErrors(async (req: Request) => {
  const { target, id } = await req.json();
  if (!isTarget(target) || typeof id !== 'string' || !/^\d+$/.test(id)) return fail('Invalid request.');
  try {
    const before = (await listEmojis(target)).find((e) => e.id === id);
    await deleteEmoji(target, id);
    await record({ action: 'emoji-delete', collection: 'emojis', title: before?.name ?? id, detail: `${target} bot ${before?.code ?? ''}`, undoable: false });
    return NextResponse.json({ ok: true });
  } catch (e) { return bad(e) ?? Promise.reject(e); }
});
