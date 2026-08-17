import type { AccessLevel } from './asset-library';
import { readStorage, writeStorage, removeStorage } from './storage-keys';

/**
 * Feature flags and entitlement — the single source of truth for what a given
 * user is allowed to do.
 *
 * ## Why this exists
 *
 * The product rule is that **admin control is absolute**: the owner must be
 * able to turn any feature off, put it behind an ad, or make it premium,
 * *without a code change and without a redeploy*. Everything gateable is
 * therefore declared here as data, not scattered through `if` statements.
 *
 * ## Phase 2 shape
 *
 * Right now the flag table is served from `localStorage` by a mock backend so
 * the whole system is testable before any server exists. `loadFlags()` is async
 * and returns the same shape a real endpoint would, so swapping in
 * `fetch('/api/flags')` later touches exactly one function.
 *
 * ## The rule that matters
 *
 * A gate answers **allow / needs-ad / needs-upgrade / hidden**. It never
 * silently does nothing — a caller that ignores the answer is a bug, and the
 * UI is expected to show the reason.
 */

export type Tier = 'free' | 'basic' | 'pro' | 'enterprise';

/** Rank so comparisons read naturally: does this user reach the bar? */
const TIER_RANK: Record<Tier, number> = {
  free: 0,
  basic: 1,
  pro: 2,
  enterprise: 3,
};

export const TIERS: { id: Tier; name: string; price: string; blurb: string }[] = [
  { id: 'free', name: 'Free', price: '$0', blurb: 'Watermarked export, free assets' },
  { id: 'basic', name: 'Basic', price: '$4.99/mo', blurb: 'No watermark, all templates' },
  { id: 'pro', name: 'Pro', price: '$9.99/mo', blurb: 'Every module, premium assets, bulk tools' },
  { id: 'enterprise', name: 'Enterprise', price: '$24.99/mo', blurb: 'Commercial licence, priority support' },
  // Display strings only. The charged amount lives in Stripe and is looked up
  // server-side from the tier name — see server/src/lib/env.ts. Editing these
  // changes the label, never the price.
];

/**
 * Everything the owner can gate.
 *
 * Adding a capability here is the *only* step needed to make it controllable —
 * the admin panel renders this table automatically.
 */
export const FEATURES = {
  // ---- modules
  'module.sudoku': 'Sudoku generator',
  'module.wordsearch': 'Word search generator',
  'module.crossword': 'Crossword generator',
  // ---- export
  'export.pdf': 'PDF export',
  'export.png': 'PNG / JPG export',
  'export.300dpi': 'Print quality (300 DPI)',
  'export.nowatermark': 'Export without watermark',
  'export.cover': 'KDP cover export',
  // ---- authoring
  'pages.bulk': 'Bulk page creation',
  'pages.numbers': 'Automatic page numbers',
  'doc.import': 'Import an existing PDF',
  'doc.templates': 'Page templates',
  'doc.rulings': 'Ruled paper styles',
  'assets.premium': 'Premium sticker & icon packs',
  'kdp.cover': 'Cover creator',
  'kdp.preflight': 'KDP preflight checks',
} as const;

export type FeatureId = keyof typeof FEATURES;

/**
 * How a single feature is configured.
 *
 * ## Why routes rather than one access level
 *
 * The first version had a single `access` value, so free / ad / paid were
 * mutually exclusive — a feature could be ad-gated *or* premium, never both.
 * That is the wrong shape for this business: the most valuable setting is
 * "watch an ad **or** subscribe", which lets a free user through today and
 * still sells the subscription.
 *
 * So unlock routes are now independent switches. A user gets in if **any**
 * enabled route lets them:
 *
 *   free:false, ad:true,  paid:true   -> ad or upgrade (the money setting)
 *   free:false, ad:true,  paid:false  -> ad only
 *   free:false, ad:false, paid:true   -> subscribers only
 *   free:true                         -> everyone
 *   enabled:false                     -> nobody, including the owner
 */
export interface UnlockRoutes {
  /** anyone may use it, no ad and no subscription */
  free: boolean;
  /** a free user can unlock it by watching an ad */
  ad: boolean;
  /** subscribers at `minTier` and above get it outright */
  paid: boolean;
}

export interface FeatureFlag {
  /** off entirely — nobody sees it, including paying users */
  enabled: boolean;
  /** the ways in; a user needs to satisfy only one */
  routes: UnlockRoutes;
  /** lowest tier that counts as "paid" for this feature */
  minTier: Tier;
  /** cap for users who got in via the free or ad route */
  dailyLimit?: number;
  /** how long an ad unlock lasts; omit for the rest of the session */
  adUnlockMinutes?: number;
  /** shown to the user when they are blocked */
  note?: string;
}

export type FlagTable = Record<FeatureId, FeatureFlag>;

const routes = (free: boolean, ad: boolean, paid: boolean): UnlockRoutes => ({ free, ad, paid });

/** Everyone, no strings. */
const openToAll = (over: Partial<FeatureFlag> = {}): FeatureFlag => ({
  enabled: true,
  routes: routes(true, false, false),
  minTier: 'free',
  ...over,
});

/** Watch an ad, or subscribe — the setting most features should use. */
const adOrPaid = (over: Partial<FeatureFlag> = {}): FeatureFlag => ({
  enabled: true,
  routes: routes(false, true, true),
  minTier: 'basic',
  ...over,
});

/** Subscribers only. */
const paidOnly = (over: Partial<FeatureFlag> = {}): FeatureFlag => ({
  enabled: true,
  routes: routes(false, false, true),
  minTier: 'basic',
  ...over,
});

/**
 * Shipping defaults.
 *
 * Deliberately generous: the free tier can make and export a real book, because
 * a KDP seller will not pay before they have seen a finished PDF. What free
 * *cannot* do is export without the watermark.
 */
export const DEFAULT_FLAGS: FlagTable = {
  'module.sudoku': openToAll(),
  'module.wordsearch': openToAll(),
  'module.crossword': openToAll(),

  'export.pdf': openToAll({ dailyLimit: 5, note: 'Free accounts can export 5 books a day.' }),
  'export.png': openToAll(),
  'export.300dpi': adOrPaid({ note: 'Watch a short ad for print quality, or upgrade to skip ads.' }),
  'export.nowatermark': paidOnly({ note: 'Upgrade to remove the watermark.' }),
  'export.cover': openToAll(),

  'pages.bulk': adOrPaid({ note: 'Watch a short ad to add pages in bulk, or upgrade.' }),
  'pages.numbers': openToAll(),
  'doc.import': openToAll(),
  'doc.templates': openToAll(),
  'doc.rulings': openToAll(),
  'assets.premium': adOrPaid({ note: 'Watch an ad to use this pack, or upgrade for unlimited access.' }),
  'kdp.cover': openToAll(),
  'kdp.preflight': openToAll(),
};

// ------------------------------------------------------------------ verdict

export type GateStatus =
  | 'allowed'
  | 'needs_ad'        // ad is the only way in
  | 'needs_upgrade'   // subscribing is the only way in
  | 'needs_ad_or_upgrade' // either works — offer both
  | 'limit_reached'
  | 'hidden';

export interface GateResult {
  status: GateStatus;
  allowed: boolean;
  /** plain-English reason, safe to show the user */
  reason?: string;
  /** tier that would unlock it, when relevant */
  upgradeTo?: Tier;
  /** remaining uses today, when the feature is capped */
  remaining?: number;
  /** the routes still open to this user, so the UI can offer exactly those */
  canWatchAd?: boolean;
  canUpgrade?: boolean;
}

export interface Entitlement {
  tier: Tier;
  /** features unlocked by watching an ad, with the epoch ms it happened */
  adUnlocked: Record<string, number>;
  /** uses recorded today, per feature */
  usedToday: Partial<Record<FeatureId, number>>;
}

export const ANON: Entitlement = { tier: 'free', adUnlocked: {}, usedToday: {} };

/**
 * Is an ad unlock still valid?
 * `adUnlockMinutes` lets the owner sell a timed unlock ("2 hours of print
 * quality") rather than only a permanent one.
 */
export function adUnlockActive(
  key: string,
  ent: Entitlement,
  minutes?: number,
): boolean {
  const at = ent.adUnlocked?.[key];
  if (at === undefined) return false;
  if (!minutes) return true; // lasts the session
  return Date.now() - at < minutes * 60000;
}

/**
 * The one function that decides access.
 *
 * Everything else in the app asks this. Keeping the logic in a single pure
 * function is what makes it testable without a browser.
 */
export function evaluate(
  id: FeatureId,
  flags: FlagTable,
  ent: Entitlement,
): GateResult {
  // An id the client has never heard of must fail closed but not crash — a
  // stale client should hide a feature, never white-screen the editor.
  const flag = flags[id] ?? DEFAULT_FLAGS[id];
  const label = FEATURES[id] ?? id;
  if (!flag) {
    return { status: 'hidden', allowed: false, reason: `${label} is not available in this version.` };
  }

  // 1. killed by the owner — nobody gets it, including the owner.
  //
  // A row persisted by an older build may have no `routes` at all. Derive them
  // from its `access` value when present: falling back to the shipped default
  // is not enough, because the legacy row also carries `minTier: 'free'`, which
  // every user meets — that combination silently unlocked ad-gated features.
  const legacyAccess = (flag as { access?: AccessLevel }).access;
  const r =
    flag.routes ??
    (legacyAccess ? levelToRoutesLocal(legacyAccess) : undefined) ??
    DEFAULT_FLAGS[id]?.routes ?? { free: true, ad: false, paid: false };
  if (!flag.enabled || (!r.free && !r.ad && !r.paid)) {
    return { status: 'hidden', allowed: false, reason: flag.note ?? `${label} is currently unavailable.` };
  }

  const rank = TIER_RANK[ent.tier] ?? 0;
  // 'free' is not a meaningful bar for a gated route — every user clears it, so
  // the gate would never fire. Whenever a route is actually gating (not free),
  // treat minTier 'free' as 'basic': the lowest tier that means "has paid".
  // The loader normalises this on save; this is the second line of defence for
  // rows that reach `evaluate` some other way.
  const gating = !r.free && (r.paid || r.ad);
  const declared = TIER_RANK[flag.minTier] ?? TIER_RANK.basic;
  const bar = gating && declared === TIER_RANK.free ? TIER_RANK.basic : declared;
  const meetsTier = rank >= bar;
  const isPaying = rank >= TIER_RANK.basic;

  // 2. open to everyone
  if (r.free) return withLimit(id, flag, ent, rank);

  // 3. this user has already paid past it
  if (r.paid && meetsTier) return { status: 'allowed', allowed: true };

  // 4. this user has already watched the ad
  if (r.ad && (isPaying || adUnlockActive(id, ent, flag.adUnlockMinutes))) {
    return withLimit(id, flag, ent, rank);
  }

  // 5. blocked — say exactly which doors are open
  const canWatchAd = r.ad;
  const canUpgrade = r.paid;
  const status: GateStatus =
    canWatchAd && canUpgrade ? 'needs_ad_or_upgrade'
      : canWatchAd ? 'needs_ad'
        : 'needs_upgrade';

  const fallbackReason =
    status === 'needs_ad_or_upgrade'
      ? `Watch a short ad to use ${label.toLowerCase()}, or upgrade to skip ads.`
      : status === 'needs_ad'
        ? `Watch a short ad to use ${label.toLowerCase()}.`
        : `${label} is part of ${titleOf(flag.minTier)}.`;

  return {
    status,
    allowed: false,
    reason: flag.note ?? fallbackReason,
    upgradeTo: canUpgrade ? flag.minTier : undefined,
    canWatchAd,
    canUpgrade,
  };
}

/** Apply the daily cap. Paid users are never capped. */
function withLimit(
  id: FeatureId,
  flag: FeatureFlag,
  ent: Entitlement,
  rank: number,
): GateResult {
  if (flag.dailyLimit === undefined || rank > 0) return { status: 'allowed', allowed: true };
  const used = ent.usedToday[id] ?? 0;
  const remaining = Math.max(0, flag.dailyLimit - used);
  if (remaining === 0) {
    return {
      status: 'limit_reached',
      allowed: false,
      reason: flag.note ?? `You have used today's ${(FEATURES[id] ?? id).toLowerCase()} allowance.`,
      upgradeTo: 'basic',
      canUpgrade: true,
      remaining: 0,
    };
  }
  return { status: 'allowed', allowed: true, remaining };
}

const titleOf = (t: Tier) => TIERS.find((x) => x.id === t)?.name ?? t;

/**
 * Decide access from a set of routes. Shared by named features and by content
 * items, so a template and a feature can never drift apart in behaviour.
 */
export function evaluateRoutes(
  routes: UnlockRoutes,
  minTier: Tier,
  ent: Entitlement,
  unlockKey: string,
  opts: { label?: string; adUnlockMinutes?: number; note?: string } = {},
): GateResult {
  const label = opts.label ?? 'This item';
  if (!routes || (!routes.free && !routes.ad && !routes.paid)) {
    return { status: 'hidden', allowed: false, reason: opts.note ?? `${label} is unavailable.` };
  }
  if (routes.free) return { status: 'allowed', allowed: true };

  const rank = TIER_RANK[ent.tier] ?? 0;
  if (routes.paid && rank >= TIER_RANK[minTier]) return { status: 'allowed', allowed: true };
  if (routes.ad && (rank >= TIER_RANK.basic || adUnlockActive(unlockKey, ent, opts.adUnlockMinutes))) {
    return { status: 'allowed', allowed: true };
  }

  const canWatchAd = routes.ad;
  const canUpgrade = routes.paid;
  const status: GateStatus =
    canWatchAd && canUpgrade ? 'needs_ad_or_upgrade'
      : canWatchAd ? 'needs_ad'
        : 'needs_upgrade';
  const fallback =
    status === 'needs_ad_or_upgrade'
      ? `Watch a short ad to use ${label.toLowerCase()}, or upgrade to skip ads.`
      : status === 'needs_ad'
        ? `Watch a short ad to use ${label.toLowerCase()}.`
        : `${label} is part of ${titleOf(minTier)}.`;

  return {
    status,
    allowed: false,
    reason: opts.note ?? fallback,
    upgradeTo: canUpgrade ? minTier : undefined,
    canWatchAd,
    canUpgrade,
  };
}

/**
 * Access level for a *content item* (a template, an asset), which carries its
 * own level rather than being a named feature.
 */
export function evaluateContent(
  level: AccessLevel,
  ent: Entitlement,
  key: string,
): GateResult {
  if (level === 'disabled') {
    return { status: 'hidden', allowed: false, reason: 'This item has been withdrawn.' };
  }
  if (level === 'free') return { status: 'allowed', allowed: true };

  const rank = TIER_RANK[ent.tier] ?? 0;
  if (level === 'premium_only') {
    return rank >= TIER_RANK.basic
      ? { status: 'allowed', allowed: true }
      : { status: 'needs_upgrade', allowed: false, reason: 'This design is part of Basic.', upgradeTo: 'basic' };
  }
  // ad_unlock — an ad works, and so does subscribing
  if (rank >= TIER_RANK.basic) return { status: 'allowed', allowed: true };
  if (adUnlockActive(key, ent)) return { status: 'allowed', allowed: true };
  return {
    status: 'needs_ad_or_upgrade',
    allowed: false,
    reason: 'Watch a short ad to use this design, or upgrade to skip ads.',
    upgradeTo: 'basic',
    canWatchAd: true,
    canUpgrade: true,
  };
}

// ------------------------------------------------------- server flag mirror

/**
 * The server's feature_flags table names features with underscores
 * (`export_pdf`); the client names them with dots (`export.pdf`). Both are
 * persisted, so the mapping is explicit rather than a string transform —
 * renaming a feature keeps working on every old client that ships the map.
 */
const SERVER_TO_LOCAL: Record<string, FeatureId> = {
  module_sudoku: 'module.sudoku',
  module_wordsearch: 'module.wordsearch',
  module_crossword: 'module.crossword',
  export_pdf: 'export.pdf',
  export_png: 'export.png',
  export_300dpi: 'export.300dpi',
  export_nowatermark: 'export.nowatermark',
  export_cover: 'export.cover',
  pages_bulk: 'pages.bulk',
  pages_numbers: 'pages.numbers',
  doc_import: 'doc.import',
  doc_templates: 'doc.templates',
  doc_rulings: 'doc.rulings',
  assets_premium: 'assets.premium',
  kdp_cover: 'kdp.cover',
  kdp_preflight: 'kdp.preflight',
};

/** server `export_pdf` -> client `export.pdf`, or null when unknown. */
export function serverFeatureIdToLocal(id: string): FeatureId | null {
  return SERVER_TO_LOCAL[id] ?? null;
}

/** client `export.pdf` -> server `export_pdf`. */
export function localFeatureIdToServer(id: FeatureId): string {
  return id.replaceAll('.', '_');
}

/** One row of the server's feature_flags table. */
export interface ServerFlagRow {
  feature_id: string;
  enabled: boolean;
  route_free: boolean;
  route_paid: boolean;
  min_tier: Tier;
  daily_limit: number | null;
}

/**
 * Convert a server flag row into a client FeatureFlag patch.
 * Returns null for feature ids this client does not know — a stale client
 * should ignore new server flags, not crash on them.
 */
export function serverFlagRowToLocal(row: ServerFlagRow): { id: FeatureId; flag: Partial<FeatureFlag> } | null {
  const id = serverFeatureIdToLocal(row.feature_id);
  if (!id) return null;
  return {
    id,
    flag: {
      enabled: row.enabled,
      routes: { free: row.route_free, ad: false, paid: row.route_paid },
      minTier: row.min_tier ?? 'basic',
      dailyLimit: row.daily_limit ?? undefined,
    },
  };
}

// ------------------------------------------------------------- mock backend

const FLAGS_KEY = 'novelka.flags.v1';
const ENT_KEY = 'novelka.entitlement.v1';

/**
 * Load the flag table.
 *
 * Async and merged over the defaults on purpose: when this becomes a real
 * endpoint, a flag added in a later release is still safe on a client holding
 * a stale table, and a failed request falls back to shipping defaults rather
 * than locking the app.
 */
/**
 * A row as written by *some* version of the app.
 * `access` is the pre-routes shape and may still be sitting in a browser.
 */
type StoredFlag = Partial<FeatureFlag> & { access?: AccessLevel };

/**
 * Bring one saved row up to the current shape.
 *
 * The first release stored a single `access` value; the current one stores
 * independent `routes`. A shallow merge replaced the whole default row with the
 * old one, so `routes` came back undefined and every read of `f.routes.free`
 * threw. Anything persisted has to be migrated, never assumed.
 */
function migrateFlag(saved: StoredFlag | undefined, fallback: FeatureFlag): FeatureFlag {
  if (!saved) return fallback;

  const routes: UnlockRoutes =
    saved.routes && typeof saved.routes === 'object'
      ? {
          free: !!saved.routes.free,
          ad: !!saved.routes.ad,
          paid: !!saved.routes.paid,
        }
      : saved.access
        ? levelToRoutesLocal(saved.access)
        : fallback.routes;

  // A legacy gated row carries minTier 'free', which every user clears — so a
  // paid or ad route derived from it would let everyone straight through.
  // Raise the bar to 'basic', the lowest tier that means "has paid".
  const gated = !routes.free && (routes.paid || routes.ad);
  const savedTier = saved.minTier ?? fallback.minTier;
  const minTier: Tier = gated && savedTier === 'free' ? 'basic' : savedTier;

  return {
    enabled: saved.enabled ?? fallback.enabled,
    routes,
    minTier,
    dailyLimit: saved.dailyLimit ?? fallback.dailyLimit,
    adUnlockMinutes: saved.adUnlockMinutes ?? fallback.adUnlockMinutes,
    note: saved.note ?? fallback.note,
  };
}

/** Old single-value access level -> the equivalent routes. */
function levelToRoutesLocal(level: AccessLevel): UnlockRoutes {
  switch (level) {
    case 'free': return { free: true, ad: false, paid: false };
    case 'ad_unlock': return { free: false, ad: true, paid: true };
    case 'premium_only': return { free: false, ad: false, paid: true };
    default: return { free: false, ad: false, paid: false };
  }
}

export async function loadFlags(): Promise<FlagTable> {
  const out = { ...DEFAULT_FLAGS };
  try {
    const raw = readStorage(FLAGS_KEY);
    if (!raw) return out;
    const saved = JSON.parse(raw) as Record<string, StoredFlag>;
    // Merge per row and per field, so a row saved by any older build — or a
    // row for a feature this build has never heard of — cannot produce a
    // half-built flag.
    for (const id of Object.keys(DEFAULT_FLAGS) as FeatureId[]) {
      out[id] = migrateFlag(saved[id], DEFAULT_FLAGS[id]);
    }
    return out;
  } catch {
    return { ...DEFAULT_FLAGS };
  }
}

export async function saveFlags(flags: FlagTable): Promise<void> {
  writeStorage(FLAGS_KEY, JSON.stringify(flags));
}

export async function resetFlags(): Promise<FlagTable> {
  removeStorage(FLAGS_KEY);
  return { ...DEFAULT_FLAGS };
}

/** Today's date key, so daily limits roll over at local midnight. */
const today = () => new Date().toISOString().slice(0, 10);

export async function loadEntitlement(): Promise<Entitlement> {
  try {
    const raw = readStorage(ENT_KEY);
    if (!raw) return { ...ANON };
    const saved = JSON.parse(raw) as Omit<Entitlement, 'adUnlocked'> & {
      day?: string;
      adUnlocked?: Record<string, number> | string[];
    };
    // a new day wipes both the usage counters and any ad unlocks
    if (saved.day !== today()) {
      return { tier: saved.tier ?? 'free', adUnlocked: {}, usedToday: {} };
    }
    // An earlier build stored unlocks as a plain array. Migrate rather than
    // discard, or a user loses an unlock they just watched an ad for.
    const raw2 = saved.adUnlocked ?? {};
    const adUnlocked: Record<string, number> = Array.isArray(raw2)
      ? Object.fromEntries(raw2.map((k) => [k, Date.now()]))
      : raw2;
    return {
      tier: saved.tier ?? 'free',
      adUnlocked,
      usedToday: saved.usedToday ?? {},
    };
  } catch {
    return { ...ANON };
  }
}

export async function saveEntitlement(e: Entitlement): Promise<void> {
  writeStorage(ENT_KEY, JSON.stringify({ ...e, day: today() }));
}
