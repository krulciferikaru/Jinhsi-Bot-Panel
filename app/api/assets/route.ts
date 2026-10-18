import { NextResponse } from 'next/server';
import { fail, withErrors } from '@/lib/api';
import { record } from '@/lib/activity';
import { isTarget, type BotTarget } from '@/lib/bot/manager';
import { ensureEmoji, emojiName } from '@/lib/discord-emoji';
import { branch, cleanName, contents, filePath, hasToken, isFolder, rawUrl, repo } from '@/lib/github';
import { ImageError, MAX_IMAGE_BYTES, toPng } from '@/lib/images';
import { linkRecord } from '@/lib/link-records';

export const dynamic = 'force-dynamic';

/** Whether uploads are configured, so the UI can explain what is missing. */
export const GET = withErrors(async () =>
  NextResponse.json({ enabled: hasToken(), repo: repo(), branch: branch() }));

/**
 * Commit one image to the asset repository as <folder>/<Name_With_Underscores>.png (replaces an existing file).
 * PNG, WebP and JPEG are accepted; WebP and JPEG are converted to PNG first. For many files use /api/assets/bulk.
 *
 * Optional fields:
 *   emoji=true            also create (or reuse) a Discord application emoji named after the file
 *   emojiTargets[]        "live" and/or "test" (default: live)
 *   linkRecords=true      fill the matching record's empty icon / emoji fields
 * The image is committed first; an emoji or link problem is reported but never undoes the upload.
 */
export const POST = withErrors(async (req: Request) => {
  if (!hasToken()) return fail('GITHUB_TOKEN is not set. Add it to .env.local and restart the app.', 400);

  const form = await req.formData();
  const file = form.get('file');
  const folder = form.get('folder');
  if (!(file instanceof File)) return fail('Choose an image file first.');
  if (!isFolder(folder)) return fail('Unknown asset folder.');
  let fileName: string;
  try { fileName = cleanName(String(form.get('name') ?? '')); } catch (e: any) { return fail(e.message); }
  if (file.size > MAX_IMAGE_BYTES) return fail('The image is larger than 5 MB.');

  let png: Buffer, converted: string | null;
  try { ({ png, converted } = await toPng(Buffer.from(await file.arrayBuffer()))); }
  catch (e) { if (e instanceof ImageError) return fail(e.message); throw e; }

  const path = filePath(folder, fileName);

  // Updating an existing icon needs its current blob sha.
  const existing = await contents(path);
  let sha: string | undefined;
  if (existing.ok) sha = (await existing.json()).sha;
  else if (existing.status !== 404) return fail(`GitHub error ${existing.status} while checking the file.`, 502);

  const put = await contents(path, {
    method: 'PUT',
    body: JSON.stringify({
      message: `${sha ? 'Update' : 'Add'} icon: ${fileName}${converted ? ` (converted from ${converted})` : ''}`,
      content: png.toString('base64'),
      branch: branch(),
      ...(sha ? { sha } : {}),
    }),
  }, false);
  if (!put.ok) {
    const detail = (await put.json().catch(() => ({})))?.message ?? '';
    return fail(`GitHub rejected the upload (${put.status}). ${detail}`.trim(), 502);
  }
  const url = rawUrl(path);
  const label = fileName.replace(/\.png$/i, '').replace(/_/g, ' ');

  // Optional: Discord emoji, then optional: fill the matching record.
  let emoji: Awaited<ReturnType<typeof ensureEmoji>> | null = null;
  if (form.get('emoji') === 'true') {
    const targets = form.getAll('emojiTargets').map(String).filter(isTarget) as BotTarget[];
    try { emoji = await ensureEmoji(targets.length ? [...new Set(targets)] : ['live'], emojiName(label), png); }
    catch (e: any) { emoji = [{ target: 'live', error: e?.message ?? 'Could not create the emoji.' }]; }
  }
  const liveCode = emoji?.find((r) => r.target === 'live')?.code; // a Test-bot code would not render for players
  const linked = form.get('linkRecords') === 'true' ? await linkRecord(folder, label, url, liveCode) : null;

  const bits: string[] = [folder];
  if (converted) bits.push(`converted from ${converted}`);
  if (emoji) bits.push(emoji.map((r) => (r.code ? `${r.target} emoji ${r.created ? 'created' : 'reused'}` : `${r.target} emoji failed`)).join(', '));
  if (linked?.record) bits.push(`linked to ${linked.record}`);
  await record({ action: sha ? 'asset-replace' : 'asset-upload', collection: 'assets', title: fileName, detail: bits.join(', '), undoable: false });

  return NextResponse.json({ url, replaced: Boolean(sha), name: fileName, converted, emoji, linked });
});
