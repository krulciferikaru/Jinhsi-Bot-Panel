import { AssetLibrary } from '@/components/AssetLibrary';
import { hasToken, listAssets } from '@/lib/github';

export const metadata = { title: 'Assets · Jinhsi Bot Panel' };
export const dynamic = 'force-dynamic';

export default function AssetsPage() {
  // start reading the repository now, while the page is still on its way to the browser
  if (hasToken()) void listAssets().catch(() => {});
  return <AssetLibrary />;
}
