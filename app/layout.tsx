import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import './globals.css';
import { COLLECTIONS, COLLECTION_KEYS } from '@/lib/schema';
import { Providers } from '@/components/Providers';
import { MegaNav, NavLinks, type NavEntry } from '@/components/NavLinks';
import { BackToTop } from '@/components/BackToTop';
import { StickyHeader } from '@/components/StickyHeader';

const grotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-grotesk', weight: ['300', '400', '500', '600', '700'] });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains', weight: ['400', '500'] });

export const viewport: Viewport = { themeColor: '#0d0b08', colorScheme: 'dark' };

export const metadata: Metadata = {
  title: 'Jinhsi Bot Panel',
  description: 'Manage Jinhsi Bot data and run the Discord bot.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const blurb: Record<string, string> = {
    resonators: 'Characters and elements',
    echoes: 'Costs and Sonata sets',
    weapons: 'Stats and passives',
    builds: 'Echo sets and stats',
    skills: 'Skill descriptions',
  };
  const entries: NavEntry[] = [
    { kind: 'link', href: '/', label: 'Home' },
    { kind: 'group', label: 'Data', items: COLLECTION_KEYS.map((k) => ({ href: `/${k}`, label: COLLECTIONS[k].label, blurb: blurb[k] })) },
    { kind: 'group', label: 'Library', items: [
      { href: '/assets', label: 'Assets', blurb: 'Icon images' },
      { href: '/emojis', label: 'Emojis', blurb: 'Discord emojis' },
    ] },
    { kind: 'group', label: 'System', items: [
      { href: '/activity', label: 'Activity', blurb: 'Recent changes' },
      { href: '/health', label: 'Health', blurb: 'Data problems' },
      { href: '/bot', label: 'Tester', blurb: 'Run the bots' },
    ] },
  ];
  return (
    <html lang="en" data-theme="obsidian" className={`${grotesk.variable} ${mono.variable}`}>
      <body className="min-h-screen">
        <a href="#main" className="btn btn-primary sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50">
          Skip to content
        </a>
        <div className="drawer">
          <input id="nav-drawer" type="checkbox" className="drawer-toggle" aria-label="Toggle navigation menu" />
          <div className="drawer-content">
            <div className="shell">
              <div className="backdrop" aria-hidden="true"><div className="glow a" /><div className="glow b" /></div>
              <StickyHeader className="site-header sticky top-0 z-30 flex items-center justify-between gap-4 px-5 py-3 sm:px-8 lg:grid lg:grid-cols-[1fr_auto_1fr]">
                <div className="flex shrink-0 items-center gap-3 lg:invisible">
                  <label htmlFor="nav-drawer" className="btn btn-square btn-ghost lg:hidden" aria-label="Open navigation menu">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
                  </label>
                  <Link href="/" className="flex shrink-0 items-center gap-3" aria-label="Jinhsi Bot home">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/icon.png" alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-xl object-cover" />
                    <span className="hidden whitespace-nowrap text-lg font-semibold tracking-tight xl:inline">Jinhsi Bot</span>
                  </Link>
                </div>
                <div className="hidden lg:block"><MegaNav entries={entries} logo={
                  <Link href="/" aria-label="Jinhsi Bot home" className="!p-0.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/icon.png" alt="" width={28} height={28} className="h-7 w-7 rounded-full object-cover" />
                  </Link>
                } /></div>
                <div className="hidden lg:block" aria-hidden="true" />
              </StickyHeader>
              <Providers>
                <main id="main" className="relative z-10 mx-auto w-full max-w-6xl grow px-5 pb-16 pt-4 sm:px-8">{children}</main>
                <BackToTop />
              </Providers>
              <footer className="relative z-10 flex flex-wrap items-center justify-center gap-2 border-t border-white/10 px-5 py-5 sm:px-8">
                <p className="mono-label">Jinhsi Bot © {new Date().getFullYear()}</p>
              </footer>
            </div>
          </div>
          <div className="drawer-side z-40">
            <label htmlFor="nav-drawer" aria-label="Close navigation menu" className="drawer-overlay" />
            <NavLinks entries={entries} className="menu min-h-full w-64 bg-base-100 p-4" />
          </div>
        </div>
      </body>
    </html>
  );
}
