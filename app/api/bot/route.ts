import { NextResponse } from 'next/server';
import { isTarget, snapshotAll, startBot, stopBot } from '@/lib/bot/manager';
import { fail, withErrors } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const GET = withErrors(async () => NextResponse.json(snapshotAll()));

export const POST = withErrors(async (req: Request) => {
  const { action, target } = await req.json();
  if (!isTarget(target)) return fail('target must be "test" or "live"');
  if (action === 'start') await startBot(target);
  else if (action === 'stop') await stopBot(target);
  else return fail('action must be "start" or "stop"');
  return NextResponse.json(snapshotAll());
});
