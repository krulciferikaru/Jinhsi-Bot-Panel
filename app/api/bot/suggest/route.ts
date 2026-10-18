import { NextResponse } from 'next/server';
import { suggest } from '@/lib/bot/commands';
import { withErrors } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const POST = withErrors(async (req: Request) => {
  const { command, option, typed, args, limit } = await req.json();
  return NextResponse.json(await suggest(String(command), String(option), String(typed ?? ''), args ?? {}, Math.min(Number(limit) || 25, 500)));
});
