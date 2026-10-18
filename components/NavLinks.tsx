'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type NavLink = { href: string; label: string; /** other paths that count as being inside this section */ also?: string[] };

export function NavLinks({ links, className }: { links: NavLink[]; className?: string }) {
  const path = usePathname();
  const active = (l: NavLink) => (l.href === '/' ? path === '/' : [l.href, ...(l.also ?? [])].some((p) => path.startsWith(p)));
  return (
    <ul className={className}>
      {links.map((l) => (
        <li key={l.href}>
          <Link href={l.href} aria-current={active(l) ? 'page' : undefined}>{l.label}</Link>
        </li>
      ))}
    </ul>
  );
}
