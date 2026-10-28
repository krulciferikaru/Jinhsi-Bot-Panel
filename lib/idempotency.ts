import { NextResponse } from 'next/server';

/**
 * Make a write safe to send twice. The client stamps a request with an `Idempotency-Key`; if the same key
 * arrives again (a double-click, or a network retry after the first reply was lost) the stored result is
 * returned instead of doing the work a second time, so no duplicate record or import is created.
 *
 * The memory is per server process and short-lived — long enough to cover a retry, not a real re-submit later.
 */
type Done = { at: number; body: unknown; status: number };
const done = new Map<string, Done>();
const inflight = new Map<string, Promise<{ body: unknown; status: number }>>();
const TTL = 2 * 60_000;

export function withIdempotency<A extends unknown[]>(fn: (req: Request, ...rest: A) => Promise<Response>) {
  return async (req: Request, ...rest: A): Promise<Response> => {
    const key = req.headers.get('Idempotency-Key') ?? '';
    if (!key) return fn(req, ...rest);

    const prior = done.get(key);
    if (prior && Date.now() - prior.at < TTL) return NextResponse.json(prior.body, { status: prior.status });

    let p = inflight.get(key);
    if (!p) {
      p = (async () => {
        const res = await fn(req, ...rest);
        let body: unknown = null;
        try { body = await res.clone().json(); } catch { /* non-JSON: fall through with null */ }
        if (res.ok) {
          done.set(key, { at: Date.now(), body, status: res.status });
          if (done.size > 500) for (const [k, v] of done) if (Date.now() - v.at > TTL) done.delete(k);
        }
        return { body, status: res.status };
      })().finally(() => inflight.delete(key));
      inflight.set(key, p);
    }
    const out = await p;
    return NextResponse.json(out.body, { status: out.status });
  };
}
