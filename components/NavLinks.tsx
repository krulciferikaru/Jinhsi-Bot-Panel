'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type NavItem = { href: string; label: string; blurb?: string; /** other paths that count as being inside this page */ also?: string[] };
export type NavEntry = ({ kind: 'link' } & NavItem) | { kind: 'group'; label: string; items: NavItem[] };

const isActive = (path: string, l: NavItem) => (l.href === '/' ? path === '/' : [l.href, ...(l.also ?? [])].some((p) => path.startsWith(p)));

/** The phone drawer: the same entries as the header, with a small heading above each group. */
export function NavLinks({ entries, className }: { entries: NavEntry[]; className?: string }) {
  const path = usePathname();
  const row = (l: NavItem) => (
    <li key={l.href}><Link href={l.href} aria-current={isActive(path, l) ? 'page' : undefined}>{l.label}</Link></li>
  );
  return (
    <ul className={className}>
      {entries.map((e) => e.kind === 'link' ? row(e) : (
        <Fragment key={e.label}>
          <li className="menu-title mt-3">{e.label}</li>
          {e.items.map(row)}
        </Fragment>
      ))}
    </ul>
  );
}

/**
 * The desktop header menu. A group opens a wide panel under the header (hover, or click / Enter / Space), the page behind dims,
 * and the panel's links fade in one after another. Moving to the next group swaps the links without closing the panel.
 * Escape closes it and gives focus back to the group button; clicking the dimmed page closes it too.
 */
export function MegaNav({ entries, logo }: { entries: NavEntry[]; logo?: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  const [shown, setShown] = useState<string | null>(null); // the group whose links are drawn (kept while the panel closes)
  const [mounted, setMounted] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const openedAt = useRef(0);
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});
  useEffect(() => setMounted(true), []);

  const show = useCallback((g: string) => { clearTimeout(timer.current); timer.current = undefined; if (!open) openedAt.current = Date.now(); setShown(g); setOpen(g); }, [open]);
  const hide = useCallback((delay = 0) => { // keeps the first pending close, so a moving pointer does not keep pushing it back
    if (delay > 0 && timer.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = undefined; setOpen(null); }, delay);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => setOpen(null), [path]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const g = open; setOpen(null); buttons.current[g]?.focus();
    };
    const onDown = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(null); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown); };
  }, [open]);

  const groups = entries.filter((e): e is Extract<NavEntry, { kind: 'group' }> => e.kind === 'group');

  return (
    <div ref={root} className="mega" data-open={open ? 'true' : 'false'} onPointerLeave={(e) => { if (e.pointerType !== 'touch') hide(0); }} onPointerEnter={() => { clearTimeout(timer.current); timer.current = undefined; }}>
      <nav aria-label="Main" className="pill-nav p-1">
        <ul className="flex items-center gap-1">
          {logo && <li className="pill-logo" onPointerEnter={(ev) => { if (ev.pointerType !== 'touch') hide(0); }}>{logo}</li>}
          {entries.map((e) => e.kind === 'link' ? (
            <li key={e.href}>
              <Link href={e.href} aria-current={isActive(path, e) ? 'page' : undefined} onPointerEnter={(ev) => { if (ev.pointerType !== 'touch') hide(0); }}>{e.label}</Link>
            </li>
          ) : (
            <li key={e.label}>
              <button type="button" ref={(el) => { buttons.current[e.label] = el; }}
                aria-expanded={open === e.label} aria-controls={`mega-${e.label}`}
                data-current={e.items.some((i) => isActive(path, i)) ? 'true' : undefined}
                onPointerEnter={(ev) => { if (ev.pointerType !== 'touch') show(e.label); }}
                onClick={() => (open === e.label ? setOpen(null) : show(e.label))}>
                {e.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mega-panel" aria-hidden={open ? undefined : true}>
        <div className="mega-clip">
          {groups.map((g) => (
            <ul key={g.label} id={`mega-${g.label}`} aria-label={g.label} className="mega-items" style={{ ['--n' as string]: g.items.length }} data-on={open === g.label ? 'true' : 'false'} data-shown={shown === g.label ? 'true' : 'false'} inert={open !== g.label}>
              {g.items.map((i, n) => (
                <li key={i.href} style={{ ['--i' as string]: n }}>
                  <Link href={i.href} aria-current={isActive(path, i) ? 'page' : undefined} onClick={() => setOpen(null)}>
                    <span className="mega-title">{i.label}</span>
                    {i.blurb && <span className="mega-blurb">{i.blurb}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>

      {mounted && createPortal(<div className="mega-dim" data-open={open ? 'true' : 'false'} aria-hidden="true" onPointerMove={(e) => {
        if (e.pointerType === 'touch' || Date.now() - openedAt.current < 500) return;
        // the panel may still be growing under the pointer: only a pointer clearly outside it counts as leaving
        const r = root.current?.querySelector('.mega-panel')?.getBoundingClientRect();
        if (r && e.clientY <= r.bottom + 4 && e.clientY >= 0) return;
        hide(0);
      }} />, document.querySelector('.shell') ?? document.body)}
    </div>
  );
}
