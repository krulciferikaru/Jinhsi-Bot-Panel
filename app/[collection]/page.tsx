import { notFound } from 'next/navigation';
import { Manager } from '@/components/Manager';
import { COLLECTION_KEYS, isCollection, type Doc } from '@/lib/schema';
import { getStore } from '@/lib/db';

export const dynamic = 'force-dynamic';
export function generateStaticParams() {
  return COLLECTION_KEYS.map((collection) => ({ collection }));
}

export default async function Page({ params }: { params: Promise<{ collection: string }> }) {
  const { collection } = await params;
  if (!isCollection(collection)) notFound();
  // Fetch the list on the server so the first paint already shows the cards (no skeleton on a fresh load).
  // A read failure is not fatal: the client fetches it the moment it mounts.
  let initialRows: Doc[] | null = null;
  try { initialRows = JSON.parse(JSON.stringify(await getStore().list(collection))); } catch { initialRows = null; }
  return <Manager collection={collection} initialRows={initialRows} />;
}
