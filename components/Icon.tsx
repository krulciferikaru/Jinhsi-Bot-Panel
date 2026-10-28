'use client';
import { useEffect, useRef, useState } from 'react';
import { optimized } from '@/lib/img';

/** Asset-library icon with a lettered fallback when the image is missing, and a quiet fade-in so it never pops in. */
export function Icon({ url, label, size = 48 }: { url: string; label: string; size?: number }) {
  const [bad, setBad] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    setBad(false);
    setLoaded(ref.current?.complete ?? false); // a cached image is already complete, so don't fade it
  }, [url]);
  if (!url || bad) {
    return (
      <div className="grid place-items-center rounded-xl bg-white/10 font-semibold text-[#ffd93b]" style={{ width: size, height: size }} aria-hidden="true">
        {label.slice(0, 1).toUpperCase()}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={ref} src={optimized(url, size)} alt="" width={size} height={size} loading="lazy"
      onLoad={() => setLoaded(true)} onError={() => setBad(true)}
      className={`rounded-xl bg-white/5 object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      style={{ width: size, height: size }} />
  );
}
