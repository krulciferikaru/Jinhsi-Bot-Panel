const WIDTHS = [64, 96, 128, 256, 384, 640];

/** Resized WebP/AVIF copy of a GitHub-hosted icon (via the Next.js image optimizer); other URLs are returned as they are. */
export function optimized(url: string, shown: number): string {
  if (!/^https:\/\/raw\.githubusercontent\.com\//.test(url)) return url;
  const w = WIDTHS.find((x) => x >= shown * 2) ?? WIDTHS[WIDTHS.length - 1];
  return `/_next/image?url=${encodeURIComponent(url)}&w=${w}&q=75`;
}
