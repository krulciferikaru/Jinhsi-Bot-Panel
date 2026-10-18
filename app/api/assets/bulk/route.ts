import { NextResponse } from 'next/server';
import { fail, withErrors } from '@/lib/api';
import { record } from '@/lib/activity';
import { isTarget, type BotTarget } from '@/lib/bot/manager';
import { emojiName, ensureEmoji, type EmojiCache } from '@/lib/discord-emoji';
import { GitError, cleanName, commitFiles, filePath, hasToken, isFolder, listAssets, rawUrl, type AssetFolder } from '@/lib/github';
import { ImageError, MAX_IMAGE_BYTES, toPng } from '@/lib/images';
import { linkRecord } from '@/lib/link-records';

export const dynamic = 'force-dynamic';

const MAX_FILES = 60;
const MAX_TOTAL = 60 * 1024 * 1024;

/**
 * Upload many images as ONE commit.
 * multipart fields: files[], names[], folders[] (parallel arrays), plus optional:
 *   emoji=true          also create (or reuse) a Discord application emoji for each image
 *   emojiTargets[]      "live" and/or "test" (default: live)
 *   linkRecords=true    fill matching records' empty icon and emoji fields
 * All-or-nothing for the images: if any is unusable the response is 400 with `problems` and nothing is committed.
 * Emoji and linking happen after the commit and report problems without undoing it.
 */
export const POST = withErrors(async (req: Request) => {
  if (!hasToken()) return fail('GITHUB_TOKEN is not set. Add it to .env.local and restart the app.');

  const form = await req.formData();
  const files = form.getAll('files');
  const names = form.getAll('names').map(String);
  const folders = form.getAll('folders').map(String);
  const linkRecords = form.get('linkRecords') === 'true';
  const wantEmoji = form.get('emoji') === 'true';
  const targets = (form.getAll('emojiTargets').map(String).filter(isTarget) as BotTarget[]);
  const emojiTargets: BotTarget[] = targets.length ? [...new Set(targets)] : ['live'];

  if (files.length === 0) return fail('Choose at least one image.');
  if (files.length > MAX_FILES) return fail(`Upload at most ${MAX_FILES} images at a time.`);
  if (names.length !== files.length || folders.length !== files.length) return fail('Each image needs a name and a folder.');

  const problems: { index: number; name: string; error: string }[] = [];
  const prepared: { folder: AssetFolder; fileName: string; label: string; png: Buffer; converted: string | null }[] = [];
  const seen = new Set<string>();
  let total = 0;

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const problem = (error: string) => problems.push({ index: i, name: names[i] || (f instanceof File ? f.name : ''), error });
    if (!(f instanceof File)) { problem('Not a file.'); continue; }
    const folder = folders[i];
    if (!isFolder(folder)) { problem('Unknown folder.'); continue; }
    let fileName: string;
    try { fileName = cleanName(names[i]); } catch (e: any) { problem(e.message); continue; }
    if (wantEmoji) { try { emojiName(fileName.replace(/\.png$/i, '').replace(/_/g, ' ')); } catch (e: any) { problem(e.message); continue; } }
    const key = `${folder}/${fileName}`.toLowerCase();
    if (seen.has(key)) { problem(`Another image in this batch is also named ${fileName}.`); continue; }
    seen.add(key);
    if (f.size > MAX_IMAGE_BYTES) { problem('Larger than 5 MB.'); continue; }
    try {
      const { png, converted } = await toPng(Buffer.from(await f.arrayBuffer()));
      total += png.length;
      prepared.push({ folder, fileName, label: fileName.replace(/\.png$/i, '').replace(/_/g, ' '), png, converted });
    } catch (e) {
      if (e instanceof ImageError) problem(e.message); else throw e;
    }
  }
  if (problems.length) return NextResponse.json({ error: 'Some images cannot be used, so nothing was uploaded.', problems }, { status: 400 });
  if (total > MAX_TOTAL) return fail('The images add up to more than 60 MB. Upload them in smaller batches.');

  // Which of these already exist (they will be replaced)?
  const existing = new Set((await listAssets()).map((a) => `${a.folder}/${a.name}`.toLowerCase()));
  const replaced = prepared.filter((p) => existing.has(`${p.folder}/${p.fileName}`.toLowerCase())).length;
  const added = prepared.length - replaced;
  const converted = prepared.filter((p) => p.converted).length;

  let commit: string;
  try {
    commit = await commitFiles(
      prepared.map((p) => ({ path: filePath(p.folder, p.fileName), content: p.png })),
      `Upload ${prepared.length} icon${prepared.length === 1 ? '' : 's'} (${added} new, ${replaced} replaced)`,
    );
  } catch (e) {
    if (e instanceof GitError) return fail(e.message, e.status);
    throw e;
  }

  // After the commit: emojis, then linking to records. Neither can undo the upload.
  const cache: EmojiCache = new Map();
  let emojisCreated = 0, emojisReused = 0, linked = 0;
  const emojiErrors: { name: string; error: string }[] = [];
  let rateLimited = false;
  for (const p of prepared) {
    let code: string | undefined;
    if (wantEmoji && !rateLimited) {
      const res = await ensureEmoji(emojiTargets, emojiName(p.label), p.png, cache);
      for (const r of res) {
        if (r.error) { emojiErrors.push({ name: `${p.label} (${r.target})`, error: r.error }); if (/rate limit/i.test(r.error)) rateLimited = true; }
        else if (r.created) emojisCreated++; else emojisReused++;
      }
      code = res.find((r) => r.target === 'live')?.code; // only the Live bot's code goes on records
    }
    if (linkRecords) {
      const l = await linkRecord(p.folder, p.label, rawUrl(filePath(p.folder, p.fileName)), code);
      if (l.iconSet || l.emojiSet) linked++;
    }
  }

  await record({
    action: 'asset-bulk', collection: 'assets', undoable: false,
    title: `${prepared.length} image${prepared.length === 1 ? '' : 's'} in one commit`,
    detail: [
      `${added} new, ${replaced} replaced`,
      converted ? `${converted} converted to PNG` : '',
      wantEmoji ? `${emojisCreated} emoji created, ${emojisReused} reused${emojiErrors.length ? `, ${emojiErrors.length} failed` : ''}` : '',
      linked ? `${linked} record${linked === 1 ? '' : 's'} linked` : '',
    ].filter(Boolean).join('; ') + `: ${prepared.slice(0, 8).map((p) => p.fileName).join(', ')}${prepared.length > 8 ? '…' : ''}`,
  });
  return NextResponse.json({ commit, added, replaced, converted, linked, count: prepared.length, emojisCreated, emojisReused, emojiErrors });
});
