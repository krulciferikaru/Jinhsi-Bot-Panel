'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/assets', label: 'Images', hint: 'Icons in your GitHub repository' },
  { href: '/emojis', label: 'Emojis', hint: 'The bot’s Discord emojis' },
];

/** Switch between the two halves of "Assets": repository images and Discord emojis. */
export function AssetTabs() {
  const path = usePathname();
  return (
    <nav aria-label="Assets sections" className="tabs tabs-box w-fit">
      {TABS.map((t) => {
        const on = path.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} title={t.hint} aria-current={on ? 'page' : undefined} className={`tab ${on ? 'tab-active' : ''}`}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
