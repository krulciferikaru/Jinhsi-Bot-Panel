import { getStore } from './db';
import { EMOJI_FIELD } from './discord-emoji';
import type { AssetFolder } from './github';
import type { CollectionKey } from './schema';

export const FOLDER_COLLECTION: Record<AssetFolder, keyof typeof EMOJI_FIELD> = {
  CharacterIcons: 'resonators', EchoIcons: 'echoes', WeaponIcons: 'weapons',
};
const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();

export type LinkResult = { record?: string; iconSet: boolean; emojiSet: boolean };

/**
 * Find the active record whose name matches an uploaded icon and fill in what it is missing:
 * the icon URL and/or the Discord emoji code. Fields that already have a value are never overwritten.
 */
export async function linkRecord(folder: AssetFolder, label: string, iconUrl: string, emojiCode?: string): Promise<LinkResult> {
  const collection: CollectionKey = FOLDER_COLLECTION[folder];
  const store = getStore();
  const doc = (await store.list(collection)).find((d) => !d.archived && norm(d.name) === norm(label));
  if (!doc) return { iconSet: false, emojiSet: false };

  const emojiKey = EMOJI_FIELD[FOLDER_COLLECTION[folder]];
  const patch: Record<string, string> = {};
  if (!String(doc.icon_url ?? '').trim()) patch.icon_url = iconUrl;
  if (emojiCode && !String(doc[emojiKey] ?? '').trim()) patch[emojiKey] = emojiCode;
  if (Object.keys(patch).length) await store.update(collection, String(doc._id), patch);
  return { record: String(doc.name), iconSet: 'icon_url' in patch, emojiSet: emojiKey in patch };
}
