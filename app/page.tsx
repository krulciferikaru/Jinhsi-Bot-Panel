import Link from 'next/link';
import { BotPanel } from '@/components/BotPanel';
import { COLLECTIONS, COLLECTION_KEYS } from '@/lib/schema';
import { getStore } from '@/lib/db';
import { runHealth, type HealthReport } from '@/lib/health';

export const dynamic = 'force-dynamic';

export default async function Home() {
  let counts: Record<string, { active: number; archived: number }> = {};
  let error = '';
  let health: HealthReport | null = null;
  try {
    const store = getStore();
    for (const c of COLLECTION_KEYS) {
      const rows = await store.list(c);
      counts[c] = { active: rows.filter((r) => !r.archived).length, archived: rows.filter((r) => r.archived).length };
    }
  } catch (e: any) {
    error = e.message;
  }
  if (!error) { try { health = await runHealth(); } catch { /* the card still links to the report */ } }
  return (
    <div className="space-y-8">
      <h1 className="sr-only">Jinhsi Bot dashboard</h1>

      {error && (
        <div role="alert" className="alert alert-error alert-vertical">
          <div>
            <h2 className="font-bold">Database not connected</h2>
            <p className="text-sm">{error}</p>
            <p className="text-sm">Copy <code>.env.example</code> to <code>.env.local</code>, set <code>MONGODB_URI</code>, then restart.</p>
          </div>
        </div>
      )}

      <BotPanel />

      <section aria-labelledby="data-heading">
        <h2 id="data-heading" className="mb-3 text-xl font-bold">Data</h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {COLLECTION_KEYS.map((k) => (
            <li key={k}>
              <Link href={`/${k}`} className="card card-border h-full bg-base-100 transition hover:border-primary focus-visible:outline">
                <div className="card-body gap-1">
                  <h3 className="card-title">{COLLECTIONS[k].label}</h3>
                  <p className="text-sm text-base-content/70">{COLLECTIONS[k].blurb}</p>
                  <p className="mt-2 text-sm">
                    <span className="text-2xl font-bold text-primary">{counts[k]?.active ?? '–'}</span> active
                    {counts[k]?.archived ? <span className="text-base-content/60"> · {counts[k].archived} archived</span> : null}
                  </p>
                </div>
              </Link>
            </li>
          ))}
          <li>
            <Link href="/health" className="card card-border h-full bg-base-100 transition hover:border-primary focus-visible:outline">
              <div className="card-body gap-1">
                <h3 className="card-title">Health</h3>
                <p className="text-sm text-base-content/70">Missing icons, empty details and records the bot can't answer well.</p>
                <p className="mt-2 text-sm">
                  {health ? (
                    <>
                      <span className="text-2xl font-bold text-primary">{health.totals.error + health.totals.warning}</span> to fix
                      {health.totals.info ? <span className="text-base-content/60"> · {health.totals.info} notes</span> : null}
                    </>
                  ) : <span className="text-base-content/60">Open the report</span>}
                </p>
              </div>
            </Link>
          </li>
        </ul>
      </section>
    </div>
  );
}
