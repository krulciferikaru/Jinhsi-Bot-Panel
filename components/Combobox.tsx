'use client';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';

type Props = {
  id?: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  /** Adds a first entry that sets the value to "" (e.g. "All" for filters). */
  clearLabel?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  'aria-label'?: string;
  'aria-describedby'?: string;
  /** small picture shown beside an option (and in the closed box) */
  iconFor?: (option: string) => string | undefined;
};

/** Searchable select with an opaque panel. The panel lives in the popover top layer so it is never clipped. */
export function Combobox({ id, value, options, onChange, clearLabel, placeholder = 'Choose…', disabled, iconFor, ...aria }: Props) {
  const pic = (o: string) => { const u = o ? iconFor?.(o) : undefined; return u ? <img src={u} alt="" width={20} height={20} loading="lazy" className="h-5 w-5 shrink-0 rounded object-contain" /> : null; };
  const uid = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; width: number; max: number }>({ left: 0, width: 0, max: 288 });

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = options.filter((o) => !q || o.toLowerCase().includes(q));
    return clearLabel && !q ? ['', ...list] : list;
  }, [options, query, clearLabel]);

  const place = useCallback(() => {
    const r = trigger.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const up = below < 220 && above > below;
    setPos({
      left: Math.min(r.left, Math.max(8, window.innerWidth - r.width - 8)),
      width: r.width,
      max: Math.max(160, Math.min(320, up ? above : below)),
      ...(up ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
    });
  }, []);

  const close = useCallback((refocus = false) => {
    setOpen(false); setQuery('');
    if (refocus) trigger.current?.focus();
  }, []);

  useLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;
    if (open) {
      place();
      if (!el.matches(':popover-open')) el.showPopover();
      const i = items.indexOf(value);
      setActive(i >= 0 ? i : 0);
      requestAnimationFrame(() => search.current?.focus());
    } else if (el.matches(':popover-open')) {
      el.hidePopover();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !trigger.current?.contains(t)) close();
    };
    const move = (e?: Event) => { if (e?.target instanceof Node && panel.current?.contains(e.target)) return; place(); };
    document.addEventListener('pointerdown', down);
    window.addEventListener('resize', move);
    window.addEventListener('scroll', move, true);
    return () => {
      document.removeEventListener('pointerdown', down);
      window.removeEventListener('resize', move);
      window.removeEventListener('scroll', move, true);
    };
  }, [open, close, place]);

  // Keep the highlighted option in view.
  useEffect(() => {
    if (open) document.getElementById(`${uid}-opt-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open, uid]);

  const pick = (v: string) => { onChange(v); close(true); };
  const onSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(items.length - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); if (items[active] !== undefined) pick(items[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === 'Tab') close();
  };

  const listId = `${uid}-list`;
  return (
    <>
      <button
        ref={trigger} id={id} type="button" disabled={disabled}
        className="select-trigger" aria-haspopup="listbox" aria-expanded={open} aria-controls={listId}
        aria-label={aria['aria-label']} aria-describedby={aria['aria-describedby']}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); } }}
      >
        <span className="flex min-w-0 items-center gap-2">
          {pic(value)}
          <span className={value ? 'truncate' : 'truncate text-base-content/50'}>{value || (clearLabel ?? placeholder)}</span>
        </span>
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 shrink-0 opacity-70"><path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>

      <div ref={panel} popover="manual" className="combo-panel" data-lenis-prevent
        style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, maxHeight: pos.max }}>
        <div className="combo-search">
          <input
            ref={search} type="text" role="combobox" aria-expanded="true" aria-controls={listId} aria-autocomplete="list"
            aria-activedescendant={items.length ? `${uid}-opt-${active}` : undefined} aria-label="Search options"
            placeholder="Type to search…" autoComplete="off" value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }} onKeyDown={onSearchKey}
          />
        </div>
        <ul id={listId} role="listbox" className="combo-list">
          {items.length === 0 && <li className="combo-empty" role="presentation">No matches</li>}
          {items.map((o, i) => (
            <li
              key={o || '__clear'} id={`${uid}-opt-${i}`} role="option" aria-selected={o === value}
              className={`combo-option ${i === active ? 'is-active' : ''} ${o === value ? 'is-selected' : ''}`}
              onPointerEnter={() => setActive(i)} onClick={() => pick(o)}
            >
              <span className="flex min-w-0 items-center gap-2">{pic(o)}<span className="truncate">{o === '' ? clearLabel : o}</span></span>
              {o === value && <span aria-hidden="true">✓</span>}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
