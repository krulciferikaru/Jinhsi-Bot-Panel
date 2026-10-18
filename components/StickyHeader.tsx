'use client';
import { useEffect, useState } from 'react';

/** Sticky site header that is see-through at the top of the page and turns into a glass bar once scrolled. */
export function StickyHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return <header className={className} data-stuck={stuck}>{children}</header>;
}
