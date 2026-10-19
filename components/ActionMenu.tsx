'use client';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

export type MenuItem = { label: string; onSelect: () => void; danger?: boolean; separatorBefore?: boolean; icon?: React.ReactNode };

/**
 * An overflow ("more actions") menu following the WAI-ARIA menu button pattern:
 * Enter, Space or the arrow keys open it and focus the first item, the arrows, Home and End move between items,
 * Escape closes it and returns focus to the button, and Tab closes it. The panel is in the top layer, so it is never clipped.
 */
export function ActionMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const uid = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }, []);

  const place = useCallback(() => {
    const r = trigger.current?.getBoundingClientRect();
    const p = panel.current;
    if (!r || !p) return;
    const w = p.offsetWidth || 176;
    const h = p.offsetHeight || 120;
    const left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8));
    const below = window.innerHeight - r.bottom - 8;
    const top = below >= h || below >= r.top - 8 ? r.bottom + 6 : Math.max(8, r.top - h - 6);
    setPos({ left, top });
  }, []);

  const menuButtons = () => [...(panel.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];

  useEffect(() => {
    const p = panel.current;
    if (!p) return;
    if (open) {
      if (!p.matches(':popover-open')) p.showPopover();
      place();
      menuButtons()[0]?.focus();
      const outside = (e: PointerEvent) => {
        const t = e.target as Node;
        if (!p.contains(t) && !trigger.current?.contains(t)) close(false);
      };
      const away = () => close(false);
      document.addEventListener('pointerdown', outside, true);
      window.addEventListener('resize', away);
      window.addEventListener('scroll', away, true);
      return () => {
        document.removeEventListener('pointerdown', outside, true);
        window.removeEventListener('resize', away);
        window.removeEventListener('scroll', away, true);
      };
    }
    if (p.matches(':popover-open')) p.hidePopover();
  }, [open, place, close]);

  const onTriggerKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); if (e.key === 'ArrowUp') requestAnimationFrame(() => menuButtons().at(-1)?.focus()); }
  };

  const onMenuKey = (e: React.KeyboardEvent) => {
    const list = menuButtons();
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); list[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); list.at(-1)?.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === 'Tab') close(false);
  };

  return (
    <>
      <button
        ref={trigger} type="button"
        className="action-menu-trigger" aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={`${uid}-menu`}
        onClick={() => setOpen((o) => !o)} onKeyDown={onTriggerKey}
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor"><circle cx="10" cy="4" r="1.6" /><circle cx="10" cy="10" r="1.6" /><circle cx="10" cy="16" r="1.6" /></svg>
      </button>
      <div ref={panel} id={`${uid}-menu`} popover="manual" role="menu" aria-label={label} className="combo-panel action-menu" onKeyDown={onMenuKey}
        style={{ left: pos.left, top: pos.top }}>
        {items.map((it) => (
          <div key={it.label} role="none">
            {it.separatorBefore && <div role="separator" className="my-1 h-px bg-white/10" />}
            <button type="button" role="menuitem" tabIndex={-1} className={`combo-option w-full text-left ${it.danger ? 'text-error' : ''}`}
              onClick={() => { close(false); it.onSelect(); }}>
              <span className="flex items-center gap-2.5">{it.icon}{it.label}</span>
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
