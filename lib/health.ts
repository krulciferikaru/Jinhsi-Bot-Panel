import { getStore } from './db';
import { keyOfUrl, listAssets, type AssetFile } from './github';
import { COLLECTIONS, SKILL_TYPES, getPath, type CollectionKey, type Doc } from './schema';

export type Severity = 'error' | 'warning' | 'info';
export type Issue = {
  id: string;
  severity: Severity;
  check: string;
  /** collection key or "assets" */
  area: string;
  title: string;
  message: string;
  href?: string;
};
export type HealthReport = { scannedAt: string; issues: Issue[]; notes: string[]; totals: Record<Severity, number>; scanned: Record<string, number> };

const empty = (v: unknown) => v == null || String(v).trim() === '' || (Array.isArray(v) && v.length === 0);
const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();
const edit = (c: CollectionKey, d: Doc) => `/${c}?edit=${encodeURIComponent(String(d._id))}`;
const find = (c: CollectionKey, q: string) => `/${c}?q=${encodeURIComponent(q)}`;

// What each collection must have for the bot to answer well.
const REQUIRED: Record<CollectionKey, { key: string; label: string }[]> = {
  resonators: [{ key: 'element', label: 'element' }, { key: 'weapon_type', label: 'weapon type' }, { key: 'rarity', label: 'rarity' }],
  echoes: [{ key: 'cost', label: 'cost' }, { key: 'class', label: 'class' }, { key: 'description', label: 'description' }, { key: 'sonata_effects', label: 'Sonata effects' }],
  weapons: [{ key: 'weapon_type', label: 'weapon type' }, { key: 'passive', label: 'passive' }, { key: 'base_attack.stats', label: 'base ATK' }, { key: 'secondary_stat.title', label: 'secondary stat' }, { key: 'secondary_stat.stats', label: 'secondary stat value' }],
  builds: [{ key: 'echo_set', label: 'echo set' }, { key: 'main_echo', label: 'main echo' }, { key: 'main_stats', label: 'main stats' }, { key: 'sub_stats_priority', label: 'substat priority' }],
  skills: [{ key: 'name', label: 'skill name' }, { key: 'description', label: 'description' }, { key: 'skill_type', label: 'skill type' }],
};

export async function runHealth(): Promise<HealthReport> {
  const store = getStore();
  const notes: string[] = [];
  const issues: Issue[] = [];
  let n = 0;
  const add = (i: Omit<Issue, 'id'>) => issues.push({ ...i, id: String(n++) });

  const all = {} as Record<CollectionKey, Doc[]>;
  for (const c of Object.keys(COLLECTIONS) as CollectionKey[]) all[c] = (await store.list(c)).filter((d) => !d.archived);
  const { resonators, echoes, weapons, builds, skills } = all;

  let assets: AssetFile[] | null = null;
  try { assets = await listAssets(); } catch (e: any) { notes.push(`Image checks were skipped: ${e.message}`); }
  const assetKeys = new Set((assets ?? []).map((a) => `${a.folder}/${a.name}`.toLowerCase()));

  /* ---- per-record content and icons ---- */
  for (const c of Object.keys(COLLECTIONS) as CollectionKey[]) {
    const cfg = COLLECTIONS[c];
    for (const d of all[c]) {
      const title = String(getPath(d, cfg.titleKey) ?? '') || '(no name)';
      const label = cfg.subtitleKey ? `${getPath(d, cfg.subtitleKey) ?? '?'} · ${title}` : title;

      const missing = REQUIRED[c].filter((r) => empty(getPath(d, r.key)));
      if (missing.length) {
        add({ severity: 'warning', check: 'Missing details', area: c, title: label, message: `No ${missing.map((m) => m.label).join(', ')}.`, href: edit(c, d) });
      }

      if (cfg.iconKey) {
        const url = d[cfg.iconKey];
        if (empty(url)) {
          add({ severity: 'warning', check: 'Missing icon', area: c, title: label, message: 'No icon set, so the bot shows no image.', href: edit(c, d) });
        } else if (assets) {
          const key = keyOfUrl(url);
          if (key && !assetKeys.has(key)) {
            const file = decodeURIComponent(String(url).split('?')[0].split('/').pop() ?? key);
            add({ severity: 'error', check: 'Broken icon link', area: c, title: label, message: `Points to ${file}, which is not in the repository.`, href: edit(c, d) });
          }
        }
      }
    }
  }

  /* ---- relationships ---- */
  const resNames = new Set(resonators.map((r) => norm(r.name)));
  const buildsBy = new Map<string, Doc[]>();
  const skillsBy = new Map<string, Doc[]>();
  builds.forEach((b) => buildsBy.set(norm(b.resonator_id), [...(buildsBy.get(norm(b.resonator_id)) ?? []), b]));
  skills.forEach((s) => skillsBy.set(norm(s.resonator_id), [...(skillsBy.get(norm(s.resonator_id)) ?? []), s]));

  for (const r of resonators) {
    const b = buildsBy.get(norm(r.name)) ?? [];
    const s = skillsBy.get(norm(r.name)) ?? [];
    if (b.length === 0) add({ severity: 'warning', check: 'Resonator without builds', area: 'builds', title: r.name, message: '/build has nothing to show for this resonator.', href: find('builds', r.name) });
    else if (!b.some((x) => x.is_primary)) add({ severity: 'warning', check: 'No primary build', area: 'builds', title: r.name, message: `${b.length} build${b.length > 1 ? 's' : ''}, but none is marked primary.`, href: find('builds', r.name) });
    if (s.length === 0) add({ severity: 'warning', check: 'Resonator without skills', area: 'skills', title: r.name, message: '/skill has nothing to show for this resonator.', href: find('skills', r.name) });
    else {
      const have = new Set(s.map((x) => x.skill_type));
      const gap = SKILL_TYPES.filter((t) => !have.has(t));
      if (gap.length) add({ severity: 'info', check: 'Incomplete skill set', area: 'skills', title: r.name, message: `Missing: ${gap.join(', ')}.`, href: find('skills', r.name) });
    }
  }

  for (const [c, rows] of [['builds', builds], ['skills', skills]] as const) {
    for (const d of rows) {
      if (!resNames.has(norm(d.resonator_id))) {
        add({ severity: 'error', check: 'Orphaned record', area: c, title: `${d.resonator_id ?? '?'} · ${d[COLLECTIONS[c].titleKey] ?? ''}`, message: 'Its resonator does not exist, so nobody can reach it.', href: edit(c, d) });
      }
    }
  }

  /* ---- duplicates ---- */
  const dupes = (c: CollectionKey, rows: Doc[], keyOf: (d: Doc) => string, label: (d: Doc) => string) => {
    const seen = new Map<string, Doc[]>();
    rows.forEach((d) => { const k = keyOf(d); if (k.replace(/\|/g, '')) seen.set(k, [...(seen.get(k) ?? []), d]); });
    for (const group of seen.values()) {
      if (group.length < 2) continue;
      group.forEach((d) => add({ severity: 'error', check: 'Duplicate', area: c, title: label(d), message: `${group.length} records share this name; the bot can only show one.`, href: edit(c, d) }));
    }
  };
  dupes('resonators', resonators, (d) => norm(d.name), (d) => d.name);
  dupes('echoes', echoes, (d) => norm(d.name), (d) => d.name);
  dupes('weapons', weapons, (d) => norm(d.name), (d) => d.name);
  dupes('builds', builds, (d) => `${norm(d.resonator_id)}|${norm(d.build_name)}`, (d) => `${d.resonator_id} · ${d.build_name}`);
  dupes('skills', skills, (d) => `${norm(d.resonator_id)}|${norm(d.skill_type)}`, (d) => `${d.resonator_id} · ${d.skill_type}`);

  /* ---- unused images ---- */
  if (assets) {
    const used = new Set<string>();
    for (const c of ['resonators', 'echoes', 'weapons'] as const) all[c].forEach((d) => { const k = keyOfUrl(d.icon_url); if (k) used.add(k); });
    // Builds and skills borrow the resonator's icon, so a resonator image is used if its name matches.
    for (const a of assets) {
      if (!used.has(`${a.folder}/${a.name}`.toLowerCase())) {
        add({ severity: 'info', check: 'Unused image', area: 'assets', title: a.label, message: `${a.folder} · not referenced by any record.`, href: `/assets?q=${encodeURIComponent(a.label)}` });
      }
    }
  }

  const totals: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  issues.forEach((i) => { totals[i.severity]++; });
  const scanned = { ...Object.fromEntries((Object.keys(all) as CollectionKey[]).map((c) => [c, all[c].length])), assets: assets?.length ?? 0 };
  return { scannedAt: new Date().toISOString(), issues, notes, totals, scanned };
}
