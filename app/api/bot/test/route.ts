import { NextResponse } from 'next/server';
import { COMMANDS, runCommand } from '@/lib/bot/commands';
import { withErrors } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const GET = withErrors(async () =>
  NextResponse.json(COMMANDS.map(({ name, description, options }) => ({ name, description, options }))));

export const POST = withErrors(async (req: Request) => {
  const { command, args } = await req.json();
  return NextResponse.json(await runCommand(String(command), args ?? {}, { ping: 0 }));
});
