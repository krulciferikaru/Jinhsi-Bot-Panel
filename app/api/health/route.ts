import { NextResponse } from 'next/server';
import { withErrors } from '@/lib/api';
import { runHealth } from '@/lib/health';

export const dynamic = 'force-dynamic';

export const GET = withErrors(async () => NextResponse.json(await runHealth()));
