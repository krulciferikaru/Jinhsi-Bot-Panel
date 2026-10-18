import { COLLECTIONS, getPath, type CollectionKey, type Field } from './schema';
import { EXAMPLES } from './examples';

/** Shared by the Import page (live preview) and the import API (the real check). Pure functions, no server code. */

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/* ---------------------------------- CSV ---------------------------------- */

/** RFC 4180 parser: quotes, doubled quotes, line breaks inside quotes, CRLF, BOM. Picks , ; or tab from the header. */
export function parseCsv(input: string): Record<string, string>[] {
  const text = input.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delim = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];

  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"' && cell === '') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  if (rows.length < 2) return [];

  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? '']).filter(([h]) => h)));
}

/** A ready-to-fill template: headers are the field keys, with one example row from real data. */
export function templateCsv(c: CollectionKey): string {
  const fields = COLLECTIONS[c].fields.filter((f) => f.type !== 'image' || f.key === 'icon_url');
  const esc = (v: string) => (/[",\n\r;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const example = fields.map((f) => {
    const e = EXAMPLES[c][f.key] ?? '';
    if (f.type === 'boolean') return 'yes';
    return f.type === 'tags' ? e.split(',').join('|') : e;
  });
  return `${fields.map((f) => f.key).join(',')}\n${example.map(esc).join(',')}\n`;
}

/* ----------------------------- Row validation ----------------------------- */

export type Ctx = { resonators: Set<string>; resonatorNames: Map<string, string> };
export type Normalized = { values: Record<string, any>; errors: string[] };

const YES = new Set(['yes', 'true', '1', 'y', 'on', 'x']);
const NO = new Set(['no', 'false', '0', 'n', 'off', '']);

/** Map a spreadsheet header to a schema field: key, label, or key with other casing. */
function fieldFor(c: CollectionKey, header: string): Field | undefined {
  const h = header.trim().toLowerCase();
  return COLLECTIONS[c].fields.find((f) => f.key.toLowerCase() === h || f.label.toLowerCase() === h);
}

/** `requireAll: false` skips the required-field check, for rows that will update an existing record. */
export function normalizeRow(c: CollectionKey, raw: Record<string, unknown>, ctx: Ctx, requireAll = true): Normalized {
  const values: Record<string, any> = {};
  const errors: string[] = [];

  for (const [header, v] of Object.entries(raw)) {
    const f = fieldFor(c, header);
    if (!f) continue; // unknown columns are ignored
    const s = typeof v === 'string' ? v : v == null ? '' : v;
    const text = typeof s === 'string' ? s.trim() : s;
    const bad = (msg: string) => errors.push(`${f.label}: ${msg}`);

    switch (f.type) {
      case 'tags': {
        const list = Array.isArray(s) ? s.map(String) : String(s).split(/[|;]/);
        values[f.key] = list.map((x) => x.trim()).filter(Boolean);
        break;
      }
      case 'boolean': {
        const t = String(text).toLowerCase();
        if (typeof s === 'boolean') values[f.key] = s;
        else if (YES.has(t)) values[f.key] = true;
        else if (NO.has(t)) values[f.key] = false;
        else bad(`"${text}" is not yes or no.`);
        break;
      }
      case 'number': {
        if (text === '') break;
        const n = Number(text);
        if (Number.isFinite(n)) values[f.key] = n; else bad(`"${text}" is not a number.`);
        break;
      }
      case 'select': {
        if (text === '') break;
        const hit = f.options!.find((o) => o.toLowerCase() === String(text).toLowerCase());
        if (hit) values[f.key] = hit; else bad(`"${text}" is not allowed. Use one of: ${f.options!.join(', ')}.`);
        break;
      }
      case 'ref': {
        if (text === '') break;
        const hit = ctx.resonatorNames.get(norm(text));
        if (hit) values[f.key] = hit; else bad(`"${text}" does not exist yet. Import or add that resonator first.`);
        break;
      }
      default: // text, textarea, image
        if (text !== '') values[f.key] = String(text).replace(/\\n/g, '\n');
    }
  }

  if (requireAll) errors.push(...requiredErrors(c, values, errors));
  return { values, errors };
}

/** "Label: required." for each required field that has no value (and no other error already). */
export function requiredErrors(c: CollectionKey, values: Record<string, any>, existing: string[] = []): string[] {
  return COLLECTIONS[c].fields
    .filter((f) => f.required && (values[f.key] == null || String(values[f.key]).trim() === '') && !existing.some((e) => e.startsWith(`${f.label}:`)))
    .map((f) => `${f.label}: required.`);
}

/** What makes two records "the same thing" when deciding between add and update. */
export function identity(c: CollectionKey, d: Record<string, any>): string {
  switch (c) {
    case 'builds': return `${norm(d.resonator_id)}|${norm(d.build_name)}`;
    case 'skills': return `${norm(d.resonator_id)}|${norm(d.skill_type)}`;
    default: return norm(getPath(d, COLLECTIONS[c].titleKey));
  }
}

export const MAX_IMPORT_ROWS = 500;

/** Which columns of an uploaded file map to fields, and which will be ignored (usually a typo in the header). */
export function headerReport(c: CollectionKey, headers: string[]) {
  const used: { header: string; field: string }[] = [];
  const ignored: string[] = [];
  for (const h of headers) {
    const f = fieldFor(c, h);
    if (f) used.push({ header: h, field: f.label }); else ignored.push(h);
  }
  const missingRequired = COLLECTIONS[c].fields.filter((f) => f.required && !used.some((u) => u.field === f.label)).map((f) => f.label);
  return { used, ignored, missingRequired };
}
