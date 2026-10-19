'use client';
import { docIcon, plain, statLabel, type CollectionKey, type Doc } from '@/lib/schema';
import { properSetName } from '@/lib/sets';
import { ActionMenu, type MenuItem } from './ActionMenu';
import { Icon } from './Icon';

/**
 * A grid card kept deliberately quiet: art, a name and two lines of plain text.
 * The whole card opens the record (one stretched button on the name, so it is a single tab stop and keeps its accessible name);
 * Edit, Archive and the rest live in an overflow menu, with the destructive one last.
 */
const codeUrl = (code: string) => {
  const m = /^<a?:\w+:(\d+)>$/.exec(code.trim());
  return m ? `https://cdn.discordapp.com/emojis/${m[1]}.png?size=64` : undefined;
};

export function DocCard({ collection, d, title, onOpen, menu, dense }: { collection: CollectionKey; d: Doc; title: string; onOpen: () => void; menu: MenuItem[]; dense?: boolean }) {
  const dot = ' · ';
  let meta = '';
  let detail = '';
  let setList: { code: string; name: string }[] = [];

  if (collection === 'resonators') {
    meta = [d.element, d.weapon_type].filter(Boolean).join(dot);
  } else if (collection === 'echoes') {
    meta = [d.cost ? `Cost ${d.cost}` : '', d.class].filter(Boolean).join(dot);
    setList = ((d.sonata_effects ?? []) as string[])
      .flatMap((s) => String(s).match(/<a?:\w+:\d+>/g) ?? [])
      .map((code) => ({ code, name: properSetName(code.replace(/<a?:(\w+):\d+>/, '$1').replace(/([a-z])([A-Z])/g, '$1 $2')) }));
    if (!setList.length) detail = 'No Sonata sets yet';
  } else if (collection === 'weapons') {
    meta = d.weapon_type ?? '';
    const atk = plain(d.base_attack?.stats).replace(/\*\*/g, '');
    const sec = plain(d.secondary_stat?.stats).replace(/\*\*/g, '');
    detail = [atk && `ATK ${atk}`, sec && d.secondary_stat?.title ? `${statLabel(d.secondary_stat.title, d.secondary_stat.stats)} ${sec}` : ''].filter(Boolean).join(dot);
  }

  return (
    <div className={`doc-card card-body relative h-full ${dense ? 'gap-1 p-3' : 'gap-3 p-4'}`}>
      <div className="flex items-start gap-3">
        <Icon url={docIcon(collection, d)} label={title} size={dense ? 40 : 56} />
        <div className="min-w-0 flex-1 pt-0.5">
          <h2 className="truncate text-base font-semibold leading-snug">
            <button type="button" className="doc-card-link" onClick={onOpen} title={title}>{title}</button>
          </h2>
          {meta && <p className="truncate text-sm text-base-content/70">{meta}</p>}
        </div>
        <div className="relative z-10 -mr-2 -mt-1 shrink-0">
          <ActionMenu label={`More actions for ${title}`} items={menu} />
        </div>
      </div>
      {!dense && (
        <div className="mt-auto flex h-7 items-center justify-between gap-3 border-t border-white/10 pt-2">
          <div className="min-w-0 flex-1 text-sm text-base-content/70">
            {setList.length > 0 ? (
              <ul className="flex min-w-0 items-center gap-x-3 overflow-hidden whitespace-nowrap" aria-label="Sonata sets">
                {setList.slice(0, 2).map(({ code, name }, i) => (
                  <li key={`${code}-${i}`} className="flex min-w-0 items-center gap-1.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={codeUrl(code)} alt="" width={18} height={18} loading="lazy" className="h-[18px] w-[18px] shrink-0 object-contain" />
                    <span className="truncate">{name}</span>
                  </li>
                ))}
                {setList.length > 2 && <li className="shrink-0 text-base-content/60">+{setList.length - 2}</li>}
              </ul>
            ) : <p className="truncate">{detail}</p>}
          </div>
          <button type="button" className="doc-card-all relative z-10 shrink-0 text-sm font-semibold text-primary hover:underline" onClick={onOpen} aria-label={`View ${title}`}>
            View
          </button>
        </div>
      )}
    </div>
  );
}
