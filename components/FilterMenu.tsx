'use client';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ChoiceIcon } from './ChoiceIcon';

/**
 * A compact single-choice dropdown for short filter lists: one button showing the label and the current choice,
 * and a small menu of radio-style options. Keyboard: Enter, Space or the arrows open it on the current choice, the arrows,
 * Home and End move, Enter or Space picks, a letter jumps to the next option starting with it, Escape closes and returns focus.
 */
export function FilterMenu({ label, value, options, onChange, iconFor }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void; iconFor?: (option: string) => string | undefined;
}) {
  const uid = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0, minWidth: 0, maxHeight: 320 });
  const all = ['', ...options];

  const close = useCallback((restoreFocus: boolean) => { setOpen(false); if (restoreFocus) trigger.current?.focus(); }, []);
  const items = () => [...(panel.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])];

  const place = useCallback(() => {
    const r = trigger.current?.getBoundingClientRect();
    const p = panel.current;
    if (!r || !p) return;
    const w = Math.max(p.offsetWidth, r.width);
    const h = p.scrollHeight;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    // open on the side with room for the whole list; if neither side has it, use the larger side and let the list scroll
    const below = window.innerHeight - r.bottom - 14;
    const above = r.top - 14;
    const down = below >= h || below >= above;
    const space = down ? below : above;
    const height = Math.min(h, space);
    setPos({ left, top: down ? r.bottom + 6 : Math.max(8, r.top - height - 6), minWidth: r.width, maxHeight: Math.max(120, space) });
  }, []);

  useEffect(() => {
    const p = panel.current;
    if (!p) return;
    if (open) {
      if (!p.matches(':popover-open')) p.showPopover();
      place();
      const checked = items().find((b) => b.getAttribute('aria-checked') === 'true') ?? items()[0];
      checked?.focus();
      const outside = (e: PointerEvent) => { const t = e.target as Node; if (!p.contains(t) && !trigger.current?.contains(t)) close(false); };
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

  const onMenuKey = (e: React.KeyboardEvent) => {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); list[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); list.at(-1)?.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === 'Tab') close(false);
    else if (e.key.length === 1 && /\S/.test(e.key)) {
      const next = [...list.slice(i + 1), ...list.slice(0, i + 1)].find((b) => b.textContent?.trim().toLowerCase().startsWith(e.key.toLowerCase()));
      if (next) { e.preventDefault(); next.focus(); }
    }
  };

  const shown = value || 'All';
  return (
    <>
      <button
        ref={trigger} type="button" className="select-trigger filter-trigger" aria-haspopup="menu" aria-expanded={open} aria-controls={`${uid}-menu`}
        aria-label={`${label}: ${shown}. Change filter`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); } }}
      >
        <span className="flex min-w-0 items-center gap-2">
          {value && iconFor && <ChoiceIcon src={iconFor(value)} />}
          <span className={value ? 'truncate font-semibold' : 'truncate text-base-content/70'}>{shown}</span>
        </span>
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 shrink-0 opacity-70"><path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <div ref={panel} id={`${uid}-menu`} popover="manual" role="menu" aria-label={label} className="combo-panel action-menu filter-menu" onKeyDown={onMenuKey}
        style={{ left: pos.left, top: pos.top, minWidth: pos.minWidth, maxHeight: pos.maxHeight, overflowY: 'auto' }} data-lenis-prevent>
        {all.map((o) => {
          const on = value === o;
          return (
            <button key={o || 'all'} type="button" role="menuitemradio" aria-checked={on} tabIndex={-1}
              className={`combo-option w-full text-left ${on ? 'is-selected' : ''}`}
              onClick={() => { close(true); onChange(o); }}>
              <span className="flex min-w-0 items-center gap-2">
                {o && iconFor && <ChoiceIcon src={iconFor(o)} />}
                <span className="truncate">{o || 'All'}</span>
              </span>
              {on && <span aria-hidden="true">✓</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}
