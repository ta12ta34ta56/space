import { useMemo } from 'react';
import { create } from 'zustand';
import {
  ANON,
  evaluateRoutes,
  DEFAULT_FLAGS,
  evaluate,
  loadEntitlement,
  loadFlags,
  saveEntitlement,
  saveFlags,
  resetFlags,
  serverFeatureIdToLocal,
  serverFlagRowToLocal,
  type Entitlement,
  type FeatureId,
  type FlagTable,
  type GateResult,
  type Tier,
} from '../services/feature-flags';
import { isSupabaseConfigured } from '../services/auth';
import { fetchEntitlement } from '../services/payments';
import type { AccessLevel } from '../services/asset-library';
import {
  effectiveRules,
  loadContentItems,
  loadContentOverrides,
  saveContentOverrides,
  clearContentOverrides,
  type ContentItem,
  type ContentOverride,
  type ContentOverrides,
} from '../services/content-registry';

/**
 * Live feature-flag state.
 *
 * Kept separate from the canvas store so a flag change never touches document
 * state — an admin toggling a switch must not dirty the user's book or push an
 * entry onto the undo stack.
 */

interface FlagState {
  flags: FlagTable;
  entitlement: Entitlement;
  /** false until the first load resolves; gates fail *open* meanwhile */
  ready: boolean;
  /** every gateable template / ruling / design / pack */
  content: ContentItem[];
  /** the owner's per-item overrides */
  contentOverrides: ContentOverrides;

  init: () => Promise<void>;

  /** the main question the UI asks */
  can: (id: FeatureId) => GateResult;
  /**
   * The real content gate: looks the item up in the registry so an owner
   * override wins over whatever the source file declared.
   */
  canUseContent: (kind: string, id: string, fallback: AccessLevel, name?: string) => GateResult;
  setContentOverride: (key: string, o: ContentOverride | null) => Promise<void>;
  resetContent: () => Promise<void>;

  /** record one use of a capped feature */
  recordUse: (id: FeatureId) => Promise<void>;
  /** grant an ad unlock for this session */
  grantAdUnlock: (key: string) => Promise<void>;
  /**
   * Mirror the server's entitlement when real auth is configured.
   *
   * Called by auth-store whenever the signed-in session changes. Pulls tier,
   * today's usage and the server flag table from `/api/entitlement`. The
   * server view is authoritative for tier and quotas; ad unlocks stay local
   * (there is no ad network to verify against yet). On any failure — offline,
   * server not deployed, bad token — the local view is left untouched so the
   * editor keeps working with last-known data.
   */
  syncFromServer: (accessToken: string | null) => Promise<void>;

  // ---- admin
  setFlag: (id: FeatureId, patch: Partial<FlagTable[FeatureId]>) => Promise<void>;
  setTier: (tier: Tier) => Promise<void>;
  resetAll: () => Promise<void>;
}

export const useFlagStore = create<FlagState>((set, get) => ({
  flags: DEFAULT_FLAGS,
  entitlement: ANON,
  ready: false,
  content: [],
  contentOverrides: {},

  init: async () => {
    const [flags, entitlement, content, contentOverrides] = await Promise.all([
      loadFlags(),
      loadEntitlement(),
      loadContentItems(),
      loadContentOverrides(),
    ]);
    set({ flags, entitlement, content, contentOverrides, ready: true });
  },

  can: (id) => {
    const { flags, entitlement, ready } = get();
    // Before the table has loaded, allow. Briefly showing a feature the user
    // cannot use is a far smaller sin than hiding one they paid for.
    if (!ready) return { status: 'allowed', allowed: true };
    return evaluate(id, flags, entitlement);
  },

  canUseContent: (kind, id, fallback, name) => {
    const { entitlement, contentOverrides, ready } = get();
    if (!ready) return { status: 'allowed', allowed: true };
    const key = `${kind}:${id}`;
    const rules = effectiveRules({ key, defaultLevel: fallback }, contentOverrides);
    return evaluateRoutes(rules.routes, rules.minTier, entitlement, key, {
      label: name,
      adUnlockMinutes: rules.adUnlockMinutes,
    });
  },

  setContentOverride: async (key, o) => {
    const next = { ...get().contentOverrides };
    if (o) next[key] = o;
    else delete next[key];
    set({ contentOverrides: next });
    await saveContentOverrides(next);
  },

  resetContent: async () => {
    await clearContentOverrides();
    set({ contentOverrides: {} });
  },

  recordUse: async (id) => {
    const ent = get().entitlement;
    const next: Entitlement = {
      ...ent,
      usedToday: { ...ent.usedToday, [id]: (ent.usedToday[id] ?? 0) + 1 },
    };
    set({ entitlement: next });
    await saveEntitlement(next);
  },

  grantAdUnlock: async (key) => {
    const ent = get().entitlement;
    // stamp the time so timed unlocks can expire
    const next: Entitlement = {
      ...ent,
      adUnlocked: { ...ent.adUnlocked, [key]: Date.now() },
    };
    set({ entitlement: next });
    await saveEntitlement(next);
  },

  syncFromServer: async (accessToken) => {
    // No real auth -> no server. The local mock is the whole world.
    if (!isSupabaseConfigured()) return;
    if (!accessToken) return;

    try {
      const ent = await fetchEntitlement(accessToken);
      if (!ent.signedIn) return;

      // Tier and quotas are the server's call; ad unlocks are a client-side
      // UX and stay local.
      const usedToday: Entitlement['usedToday'] = {};
      for (const [serverId, count] of Object.entries(ent.usage ?? {})) {
        const localId = serverFeatureIdToLocal(serverId);
        if (localId) usedToday[localId] = count;
      }
      const next: Entitlement = {
        tier: ent.tier ?? 'free',
        adUnlocked: get().entitlement.adUnlocked,
        usedToday,
      };

      // Merge server flag rows over the local table, row by row, so flags the
      // server does not know about keep their local (owner-administered) values.
      const flags: FlagTable = { ...get().flags };
      for (const row of ent.flags ?? []) {
        const mapped = serverFlagRowToLocal(row);
        if (!mapped) continue;
        flags[mapped.id] = { ...flags[mapped.id], ...mapped.flag };
      }

      set({ entitlement: next, flags, ready: true });
      // Keep a local mirror so a reload while offline still shows the tier.
      await saveEntitlement(next);
    } catch {
      // Offline, server not deployed, or a rejected token: keep the local
      // view. Gates stay usable and the next sync fixes the numbers.
    }
  },

  setFlag: async (id, patch) => {
    const flags = { ...get().flags, [id]: { ...get().flags[id], ...patch } };
    set({ flags });
    await saveFlags(flags);
  },

  setTier: async (tier) => {
    const next = { ...get().entitlement, tier };
    set({ entitlement: next });
    await saveEntitlement(next);
  },

  resetAll: async () => {
    const flags = await resetFlags();
    set({ flags });
  },
}));

const ALLOW: GateResult = { status: 'allowed', allowed: true };

/**
 * Convenience hook for a single feature.
 *
 *   const pdf = useGate('export.pdf');
 *   if (!pdf.allowed) return <Locked reason={pdf.reason} />;
 *
 * `evaluate` builds a new object every call, and a zustand selector that
 * returns a fresh object on every render never compares equal — React then
 * re-renders forever (error #185, which crashed the export modal). So select
 * the raw inputs, which are stable references, and derive outside the
 * selector.
 */
export function useGate(id: FeatureId): GateResult {
  const ready = useFlagStore((s) => s.ready);
  const flags = useFlagStore((s) => s.flags);
  const entitlement = useFlagStore((s) => s.entitlement);
  return useMemo(
    () => (ready ? evaluate(id, flags, entitlement) : ALLOW),
    [id, ready, flags, entitlement],
  );
}

const TEST_HOOKS =
  import.meta.env?.DEV || import.meta.env?.VITE_ENABLE_TEST_HOOKS === 'true';

// Test hook: lets the e2e suite inspect gating decisions directly.
if (typeof window !== 'undefined' && TEST_HOOKS) {
  (window as unknown as { __flags: typeof useFlagStore }).__flags = useFlagStore;
}
