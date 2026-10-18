import { withErrors } from '@/lib/api';
import { buildBackup } from '@/lib/backup';

export const dynamic = 'force-dynamic';

/** Download every record the dashboard manages as one JSON file. */
export const GET = withErrors(async () => {
  const file = await buildBackup();
  const day = file.exportedAt.slice(0, 10);
  return new Response(JSON.stringify(file, null, 1), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="jinhsi-backup-${day}.json"`,
      'Cache-Control': 'no-store',
    },
  });
});
