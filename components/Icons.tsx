/** Small line icons for buttons. They are decorative: the button's own text is its name. */
const base = { 'aria-hidden': true, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export function PlusIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return <svg {...base} className={`shrink-0 ${className}`}><path d="M10 4v12M4 10h12" /></svg>;
}

export function UploadIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return <svg {...base} className={`shrink-0 ${className}`}><path d="M10 13V3.5M6.5 7L10 3.5 13.5 7M4 13.5v1.5a1.5 1.5 0 001.5 1.5h9a1.5 1.5 0 001.5-1.5v-1.5" /></svg>;
}

export function PencilIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return <svg {...base} className={`shrink-0 ${className}`}><path d="M13.5 3.5l3 3L7 16H4v-3L13.5 3.5zM11.5 5.5l3 3" /></svg>;
}

export function ArchiveIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return <svg {...base} className={`shrink-0 ${className}`}><path d="M3 5.5h14V8H3V5.5zM4.5 8v7a1.5 1.5 0 001.5 1.5h8a1.5 1.5 0 001.5-1.5V8M8 11.5h4" /></svg>;
}

export function RestoreIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return <svg {...base} className={`shrink-0 ${className}`}><path d="M3.5 10a6.5 6.5 0 102.1-4.8M3.5 3.5v3.2h3.2" /></svg>;
}

export function TrashIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return <svg {...base} className={`shrink-0 ${className}`}><path d="M4 6h12M8 6V4.5h4V6M5.5 6l.7 9.5h7.6l.7-9.5M8.5 9v4M11.5 9v4" /></svg>;
}

export function ChevronLeftIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return <svg {...base} className={`shrink-0 ${className}`}><path d="M12 4.5L6.5 10 12 15.5" /></svg>;
}

export function ChevronRightIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return <svg {...base} className={`shrink-0 ${className}`}><path d="M8 4.5L13.5 10 8 15.5" /></svg>;
}

/** A tray with an arrow going in: bring data into the panel. */
export function ImportIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return <svg {...base} className={`shrink-0 ${className}`}><path d="M10 3.5V12M6.5 8.5L10 12l3.5-3.5M4 13.5v1.5A1.5 1.5 0 005.5 16.5h9a1.5 1.5 0 001.5-1.5v-1.5" /></svg>;
}

/** A floppy disk: save what you changed. */
export function SaveIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return <svg {...base} className={`shrink-0 ${className}`}><path d="M4.5 3.5h8L16 7v8.5a1 1 0 01-1 1H5a1 1 0 01-1-1v-11a1 1 0 01.5-1zM7 3.5v3.5h5V3.5M7 16.5v-4.5h6v4.5" /></svg>;
}

export function CopyIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return <svg {...base} className={`shrink-0 ${className}`}><path d="M7.5 7.5h8v8h-8zM12.5 7.5v-3h-8v8h3" /></svg>;
}

export function ReplaceIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return <svg {...base} className={`shrink-0 ${className}`}><path d="M4 7.5h11M12 4.5l3 3-3 3M16 12.5H5M8 9.5l-3 3 3 3" /></svg>;
}

export function SmileIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return <svg {...base} className={`shrink-0 ${className}`}><circle cx="10" cy="10" r="6.5" /><path d="M7.5 11.5a3.5 3.5 0 005 0M7.8 8h.01M12.2 8h.01" /></svg>;
}

/** A filled star, used after a rarity number. */
export function StarIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className={`shrink-0 ${className}`}><path d="M10 2.5l2.2 4.7 5.1.6-3.8 3.5 1 5.1L10 13.8l-4.5 2.6 1-5.1L2.7 7.8l5.1-.6L10 2.5z" /></svg>;
}

/** A wrench: go and fix this. */
export function WrenchIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return <svg {...base} className={`shrink-0 ${className}`}><path d="M12.5 3.5a3.5 3.5 0 00-3.3 4.7L3.5 13.9a1.6 1.6 0 002.3 2.3l5.7-5.7a3.5 3.5 0 004.7-3.3l-2.2 2.2-2-.5-.5-2 2.2-2.2a3.5 3.5 0 00-1.2-.2z" /></svg>;
}

/** An eye: just have a look. */
export function EyeIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return <svg {...base} className={`shrink-0 ${className}`}><path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z" /><circle cx="10" cy="10" r="2.3" /></svg>;
}
