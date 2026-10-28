'use client';

/**
 * A tiny in-memory cache that lives for the life of the tab, so returning to a page shows its
 * last data at once (stale) while a fresh copy loads in the background (revalidate). It is not
 * persisted and never the source of truth — the server is — it only removes the empty flash.
 */
const store = new Map<string, unknown>();
export const cacheGet = <T>(key: string): T | undefined => store.get(key) as T | undefined;
export const cacheSet = (key: string, value: unknown) => { store.set(key, value); };

/**
 * Run a DOM update inside a View Transition so the change cross-fades instead of snapping.
 * Falls back to running it directly where the API is missing or the person prefers reduced motion.
 */
export function withViewTransition(update: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready?: Promise<unknown>; finished?: Promise<unknown> } };
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (typeof doc.startViewTransition === 'function' && !reduce) {
    try {
      const t = doc.startViewTransition(update);
      // a transition that is skipped or interrupted rejects these; ignore so it never surfaces as an error
      t?.ready?.catch?.(() => {});
      t?.finished?.catch?.(() => {});
    } catch { update(); }
  } else update();
}
