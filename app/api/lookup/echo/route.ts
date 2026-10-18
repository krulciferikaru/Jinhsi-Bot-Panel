import { NextResponse } from 'next/server';
import { fail, withErrors } from '@/lib/api';
import { ECHO_CLASS_BY_RARITY, encore, gameText, normName } from '@/lib/gamedata';

export const dynamic = 'force-dynamic';

/** Cost, class, Sonata sets and description for an echo, from the public game data. Used by the form's Autofill button. */
export const GET = withErrors(async (req: Request) => {
  const name = new URL(req.url).searchParams.get('name')?.trim() ?? '';
  if (!name) return fail('Type the echo name first.');
  const list: any[] = (await encore('echo')).Echo ?? [];
  const hits = list.filter((e) => e.Type === 'Echo' && normName(e.Name) === normName(name));
  if (!hits.length) return fail(`No echo called "${name}" was found in the game data.`, 404);

  for (const e of hits) {
    const d = await encore(`echo/${e.Id}`);
    const sets = (d.FetterGroupDetails ?? []).map((g: any) => g.Group?.FetterGroupName).filter(Boolean);
    if (!sets.length && hits.length > 1) continue;
    const cls = ECHO_CLASS_BY_RARITY[e.Rarity];
    const text = String(d.Skill?.DescriptionEx ?? '').split(/<br\s*\/?>\s*<br\s*\/?>\s*CD/i)[0];
    return NextResponse.json({ name: e.Name, cost: cls?.cost, class: cls?.class, sonata: sets, description: text ? gameText(text) : '' });
  }
  return fail(`The game data has no details for "${name}".`, 404);
});
