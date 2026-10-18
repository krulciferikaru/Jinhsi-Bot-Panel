'use client';
import { useEffect, useState } from 'react';
import { optimized } from '@/lib/img';

/** Asset-library icon with a lettered fallback when the image is missing. */
export function Icon({ url, label, size = 48 }: { url: string; label: string; size?: number }) {
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [url]);
  if (!url || bad) {
    return (
      <div className="grid place-items-center rounded-xl bg-white/10 font-semibold text-[#ffd93b]" style={{ width: size, height: size }} aria-hidden="true">
        {label.slice(0, 1).toUpperCase()}
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={optimized(url, size)} alt="" width={size} height={size} loading="lazy" onError={() => setBad(true)} className="rounded-xl bg-white/5 object-cover" style={{ width: size, height: size }} />;
}
