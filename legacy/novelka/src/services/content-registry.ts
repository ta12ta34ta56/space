import type { AccessLevel } from './asset-library';
import { readStorage, writeStorage, removeStorage } from './storage-keys';
import type { UnlockRoutes, Tier } from './feature-flags';

/**
 * Every individually-gateable piece of content in the app.
 *
 * ## Why this exists
 *
 * Page templates, rulings, puzzle-page designs and asset packs each ship with a
 * hardcoded `accessLevel` in their source file. That meant changing "this
 * template is PRO" needed a code edit and a redeploy — exactly what the owner
 * asked not to do.
 *
 * This registry collects all of them into one list at runtime and layers the
 * owner's overrides on top. The source file's `accessLevel` becomes a *default*
 * that can be changed from the admin panel, never a hard rule.
 *
 * The registry is built lazily from the real modules so a new template added
 * anywhere shows up here automatically — nothing to remember to update.
 */

export type ContentKind =
  | 'page-template'
  | 'ruling'
  | 'sudoku-design'
  | 'wordsearch-design'
  | 'crossword-design'
  | 'asset-pack';

export interface ContentItem {
  /** stable key: `${kind}:${id}` */
  key: string;
  kind: ContentKind;
  id: string;
  name: string;
  /** shown in the admin list to help the owner find things */
  group?: string;
  /** what the source file declares — the fallback when there is no override */
  defaultLevel: AccessLevel;
}

/** The owner's override for one item. Absent means "use the default". */
export interface ContentOverride {
  routes: UnlockRoutes;
  minTier: Tier;
  /** how long an ad unlock lasts; omit for the session */
  adUnlockMinutes?: number;
}

export type ContentOverrides = Record<string, ContentOverride>;

export const KIND_LABEL: Record<ContentKind, string> = {
  'page-template': 'Page templates',
  ruling: 'Ruled paper',
  'sudoku-design': 'Sudoku page designs',
  'wordsearch-design': 'Word search page designs',
  'crossword-design': 'Crossword page designs',
  'asset-pack': 'Asset packs',
};

/** Turn a source-file access level into the equivalent unlock routes. */
export function levelToRoutes(level: AccessLevel): UnlockRoutes {
  switch (level) {
    case 'free':
      return { free: true, ad: false, paid: false };
    case 'ad_unlock':
      // Historically "ad only". The owner can open the paid route too.
      return { free: false, ad: true, paid: true };
    case 'premium_only':
      return { free: false, ad: false, paid: true };
    case 'disabled':
      return { free: false, ad: false, paid: false };
  }
}

let cache: ContentItem[] | null = null;

/**
 * Collect every gateable item.
 *
 * Imported dynamically so the admin panel does not drag the whole template and
 * asset library into the initial bundle — the editor already loads them when
 * they are actually needed.
 */
export async function loadContentItems(): Promise<ContentItem[]> {
  if (cache) return cache;
  const items: ContentItem[] = [];

  const push = (
    kind: ContentKind,
    id: string,
    name: string,
    defaultLevel: AccessLevel,
    group?: string,
  ) => items.push({ key: `${kind}:${id}`, kind, id, name, defaultLevel, group });

  // NOTE: these are `await import(...)` but the same modules are also imported
  // statically by the panels, so Rollup cannot split them into separate chunks
  // and warns about it. That is expected and harmless — the dynamic form is
  // used so a failure in one registry source cannot take down the others (see
  // the try/catch around each). Silenced in vite.config.ts rather than left as
  // recurring build noise that trains people to ignore warnings.
  try {
    const { TEMPLATES } = await import('./templates');
    for (const t of TEMPLATES) {
      push('page-template', t.id, t.name, t.accessLevel as AccessLevel, t.category);
    }
  } catch { /* a missing module must not break the panel */ }

  try {
    const { RULINGS } = await import('./rulings');
    for (const r of RULINGS) {
      push('ruling', r.id, r.name, r.accessLevel as AccessLevel, r.group);
    }
  } catch { /* ignore */ }

  try {
    const { SUDOKU_TEMPLATES } = await import('../modules/sudoku-maker/templates');
    for (const t of SUDOKU_TEMPLATES) {
      push('sudoku-design', t.id, t.name, t.accessLevel as AccessLevel, t.audience);
    }
  } catch { /* ignore */ }

  try {
    const { WS_TEMPLATES } = await import('../modules/word-search/templates');
    for (const t of WS_TEMPLATES) {
      push('wordsearch-design', t.id, t.name, t.accessLevel as AccessLevel, t.audience);
    }
  } catch { /* ignore */ }

  try {
    const { CW_TEMPLATES } = await import('../modules/crossword/templates');
    for (const t of CW_TEMPLATES) {
      push('crossword-design', t.id, t.name, t.accessLevel as AccessLevel, t.audience);
    }
  } catch { /* ignore */ }

  // Assets are gated by pack rather than one-by-one: 129 individual switches
  // would be unusable, and nobody prices a single sticker.
  try {
    const { ALL_ASSETS } = await import('./asset-library');
    const packs = new Map<string, { n: number; level: AccessLevel }>();
    for (const a of ALL_ASSETS) {
      const pack = a.category ?? a.kind;
      const cur = packs.get(pack);
      // a pack counts as premium if anything in it is
      const level: AccessLevel =
        cur?.level === 'premium_only' || a.accessLevel === 'premium_only'
          ? 'premium_only'
          : cur?.level === 'ad_unlock' || a.accessLevel === 'ad_unlock'
            ? 'ad_unlock'
            : 'free';
      packs.set(pack, { n: (cur?.n ?? 0) + 1, level });
    }
    for (const [pack, info] of [...packs].sort((a, b) => a[0].localeCompare(b[0]))) {
      push('asset-pack', pack, `${pack} (${info.n})`, info.level, 'assets');
    }
  } catch { /* ignore */ }

  cache = items;
  return items;
}

// ------------------------------------------------------------- persistence

const KEY = 'novelka.content-overrides.v1';

export async function loadContentOverrides(): Promise<ContentOverrides> {
  try {
    const raw = readStorage(KEY);
    return raw ? (JSON.parse(raw) as ContentOverrides) : {};
  } catch {
    return {};
  }
}

export async function saveContentOverrides(o: ContentOverrides): Promise<void> {
  writeStorage(KEY, JSON.stringify(o));
}

export async function clearContentOverrides(): Promise<void> {
  removeStorage(KEY);
}

/**
 * The effective rule for an item: the owner's override if there is one,
 * otherwise whatever the source file declared.
 */
export function effectiveRules(
  item: Pick<ContentItem, 'key' | 'defaultLevel'>,
  overrides: ContentOverrides,
): ContentOverride {
  const o = overrides[item.key];
  if (o) return o;
  // minTier must never default to 'free' for a paid route: every user meets
  // 'free', so the gate would silently let everyone through. 'basic' is the
  // lowest tier that actually means "has paid".
  return {
    routes: levelToRoutes(item.defaultLevel),
    minTier: 'basic',
  };
}
