import { notFound } from 'next/navigation';
import { Manager } from '@/components/Manager';
import { COLLECTION_KEYS, isCollection } from '@/lib/schema';

export function generateStaticParams() {
  return COLLECTION_KEYS.map((collection) => ({ collection }));
}
export const dynamicParams = false;

export default async function Page({ params }: { params: Promise<{ collection: string }> }) {
  const { collection } = await params;
  if (!isCollection(collection)) notFound();
  return <Manager collection={collection} />;
}
