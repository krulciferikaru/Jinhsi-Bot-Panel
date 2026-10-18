import { NextResponse } from 'next/server';
import { COLLECTIONS, getPath, isCollection, setPath, slugify, type CollectionKey } from './schema';

export const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

export function withErrors<A extends unknown[]>(fn: (...a: A) => Promise<Response>) {
  return async (...a: A) => {
    try { return await fn(...a); }
    catch (e: any) { return fail(e?.message ?? 'Unexpected error', 500); }
  };
}

export function parseCollection(k: string): CollectionKey | null {
  return isCollection(k) ? k : null;
}

// Stored as numbers in the database (cost is a string there, so it is not listed).
const NUMERIC = new Set(['rarity', 'priority', 'order']);
const ELEMENT_COLORS: Record<string, number> = {
  Aero: 0x34ebc0, Electro: 0x8c00ff, Fusion: 0xeb5c34, Glacio: 0x69e1ff, Havoc: 0xe100ff, Spectro: 0xfff200,
};

/** Keep only schema fields (flat, dot-path keys) and coerce types. */
export function clean(c: CollectionKey, body: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const f of COLLECTIONS[c].fields) {
    if (!(f.key in body)) continue;
    let v = body[f.key];
    if (NUMERIC.has(f.key)) v = v === '' || v == null ? null : Number(v);
    if (f.type === 'boolean') v = Boolean(v);
    out[f.key] = v;
  }
  if ('archived' in body) out.archived = Boolean(body.archived);
  return out;
}

/** Slugs that the original data keeps alongside names. */
export function withDerived(c: CollectionKey, data: Record<string, any>) {
  const d = { ...data };
  if (c === 'builds') {
    if ('resonator_id' in d) d.resonator_slug = slugify(String(d.resonator_id));
    if ('build_name' in d) d.build_slug = slugify(String(d.build_name));
  } else if (c === 'skills') {
    if ('resonator_id' in d) d.resonator_slug = slugify(String(d.resonator_id));
  } else if ('name' in d) {
    d.slug = slugify(String(d.name));
  }
  return d;
}

/** Turn flat dot-path keys into a nested document and fill defaults for new records. */
export function forCreate(c: CollectionKey, flat: Record<string, any>) {
  const doc: Record<string, any> = {};
  for (const [k, v] of Object.entries(withDerived(c, flat))) setPath(doc, k, v);
  doc.archived = false;
  if (c === 'resonators') {
    const el = String(getPath(doc, 'element') ?? '');
    doc.ui = { color: ELEMENT_COLORS[el] ?? 0xcccccc, color_name: `${el}Color`, star_display: `${doc.rarity}★` };
  }
  if (c === 'builds' && doc.is_current == null) doc.is_current = true;
  return doc;
}

export function validate(c: CollectionKey, data: Record<string, any>, partial = false) {
  for (const f of COLLECTIONS[c].fields) {
    if (!f.required) continue;
    if (partial && !(f.key in data)) continue;
    const v = data[f.key];
    if (v == null || String(v).trim() === '') return `${f.label} is required.`;
  }
  return null;
}
