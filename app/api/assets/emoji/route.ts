import { NextResponse } from 'next/server';
import { fail, withErrors } from '@/lib/api';
import { record } from '@/lib/activity';
import { isTarget, type BotTarget } from '@/lib/bot/manager';
import { EmojiError, deleteEmoji, emojiName, ensureEmoji, listEmojis } from '@/lib/discord-emoji';
import { filePath, isFolder, rawUrl } from '@/lib/github';
import { linkRecord } from '@/lib/link-records';

export const dynamic = 'force-dynamic';

const targetsOf = (v: unknown): BotTarget[] =>
  [...new Set((Array.isArray(v) ? v : []).map(String).filter(isTarget) as BotTarget[])];

/**
 * POST { folder, name, label, targets[] }: create (or reuse) the Discord emoji for an uploaded icon, named after it,
 * and fill the matching record's empty emoji field with the Live bot's code.
 */
export const POST = withErrors(async (req: Request) => {
  const { folder, name, label, targets } = await req.json();
  const use = targetsOf(targets);
  if (!isFolder(folder) || typeof name !== 'string' || typeof label !== 'string' || use.length === 0) return fail('Invalid request.');

  const src = rawUrl(filePath(folder, name));
  const res = await fetch(src, { cache: 'no-store' });
  if (!res.ok) return fail('Could not read that image from the repository.', 502);
  const png = Buffer.from(await res.arrayBuffer());

  let results;
  try { results = await ensureEmoji(use, emojiName(label), png); }
  catch (e) { if (e instanceof EmojiError) return fail(e.message, e.status); throw e; }

  const liveCode = results.find((r) => r.target === 'live')?.code;
  const linked = liveCode ? await linkRecord(folder, label, src, liveCode) : null;
  for (const r of results) {
    if (r.code && r.created) await record({ action: 'emoji-upload', collection: 'emojis', title: emojiName(label), detail: `${r.target} bot ${r.code}`, undoable: false });
  }
  return NextResponse.json({ results, linked });
});

/** DELETE { label, targets[] }: remove the emoji named after this icon from the chosen bots. */
export const DELETE = withErrors(async (req: Request) => {
  const { label, targets } = await req.json();
  const use = targetsOf(targets);
  if (typeof label !== 'string' || use.length === 0) return fail('Invalid request.');
  const want = emojiName(label).toLowerCase();

  const results: { target: BotTarget; removed: boolean; error?: string }[] = [];
  for (const t of use) {
    try {
      const hit = (await listEmojis(t)).find((e) => e.name.toLowerCase() === want);
      if (!hit) { results.push({ target: t, removed: false }); continue; }
      await deleteEmoji(t, hit.id);
      await record({ action: 'emoji-delete', collection: 'emojis', title: hit.name, detail: `${t} bot ${hit.code}`, undoable: false });
      results.push({ target: t, removed: true });
    } catch (e: any) {
      results.push({ target: t, removed: false, error: e instanceof EmojiError ? e.message : 'Discord request failed.' });
    }
  }
  return NextResponse.json({ results });
});
