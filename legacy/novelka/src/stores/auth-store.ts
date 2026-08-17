import { create } from 'zustand';
import {
  auth,
  checkRecoveryCode,
  claimOwnership,
  isSupabaseConfigured,
  loadOwnerConfig,
  onAuthChange,
  type OwnerConfig,
  type Session,
  type User,
} from '../services/auth';
import type { Tier } from '../services/feature-flags';
import { useFlagStore } from './flag-store';

/**
 * Who is signed in, and what they are allowed to be.
 *
 * Kept apart from the flag store so a sign-in cannot accidentally mutate the
 * gating table — but the two are linked in one direction: the signed-in user's
 * tier is pushed into the entitlement, so plans and gates never disagree.
 *
 * With Supabase configured, `accessToken` is the token the server verifies;
 * every entitlement call from the client carries it.
 */

interface AuthState {
  session: Session | null;
  owner: OwnerConfig | null;
  ready: boolean;
  /** admin unlocked this session via the recovery code, without an owner login */
  recoveryUnlock: boolean;

  init: () => Promise<void>;
  signUp: (email: string, password: string, name?: string) => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  setTier: (tier: Tier) => Promise<void>;

  claim: (email: string, code: string) => Promise<string | null>;
  tryRecovery: (code: string) => Promise<boolean>;
  lockAdmin: () => void;

  /** true when this session may open the admin panel */
  isOwner: () => boolean;
  user: () => User | null;
}

/** Keep the gate entitlement in step with the account's plan. */
async function syncTier(session: Session | null) {
  const tier: Tier = session?.user.tier ?? 'free';
  const flags = useFlagStore.getState();
  if (flags.entitlement.tier !== tier) await flags.setTier(tier);
}

/** Push the session's token into the flag store so it can mirror the server. */
async function syncEntitlement(session: Session | null) {
  const token = session?.token ?? null;
  await useFlagStore.getState().syncFromServer(token);
}

// With real auth, session changes can arrive from outside (token refresh,
// expiry, sign-in in another tab). Subscribe once and keep the store in step.
let unsubscribeAuth: (() => void) | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  owner: null,
  ready: false,
  recoveryUnlock: false,

  init: async () => {
    const [session, owner] = await Promise.all([auth.getSession(), loadOwnerConfig()]);
    set({ session, owner, ready: true });
    await syncTier(session);
    await syncEntitlement(session);

    // Supabase keeps its own session in storage and refreshes tokens on its
    // own schedule; make sure the store follows when that happens.
    if (isSupabaseConfigured() && !unsubscribeAuth) {
      unsubscribeAuth = await onAuthChange(async (s) => {
        set({ session: s });
        await syncTier(s);
        await syncEntitlement(s);
      });
    }
  },

  signUp: async (email, password, name) => {
    const r = await auth.signUp(email, password, name);
    if (!r.ok) return r.error ?? 'Could not create the account.';
    set({ session: r.session ?? null });
    await syncTier(r.session ?? null);
    await syncEntitlement(r.session ?? null);
    return null;
  },

  signIn: async (email, password) => {
    const r = await auth.signIn(email, password);
    if (!r.ok) return r.error ?? 'Could not sign in.';
    set({ session: r.session ?? null });
    await syncTier(r.session ?? null);
    await syncEntitlement(r.session ?? null);
    return null;
  },

  signOut: async () => {
    await auth.signOut();
    set({ session: null, recoveryUnlock: false });
    // Signing out must drop back to free, or a shared computer would leave the
    // next person on the previous user's plan.
    await syncTier(null);
    await syncEntitlement(null);
  },

  setTier: async (tier) => {
    const s = get().session;
    if (!s) {
      // Not signed in: the tier lives only in the local entitlement.
      await useFlagStore.getState().setTier(tier);
      return;
    }
    await auth.setTier(s.user.id, tier);
    const fresh = await auth.getSession();
    set({ session: fresh });
    await syncTier(fresh);
    await syncEntitlement(fresh);
  },

  claim: async (email, code) => {
    const r = await claimOwnership(email, code);
    if (!r.ok) return r.error ?? 'Could not set the owner.';
    set({ owner: await loadOwnerConfig() });
    return null;
  },

  tryRecovery: async (code) => {
    const okCode = await checkRecoveryCode(code);
    if (okCode) set({ recoveryUnlock: true });
    return okCode;
  },

  lockAdmin: () => set({ recoveryUnlock: false }),

  isOwner: () => {
    const { session, owner, recoveryUnlock } = get();
    if (recoveryUnlock) return true;
    // An unclaimed install is NOT automatically owned. Callers send the user
    // to setup instead; treating "no owner yet" as "everyone is owner" would
    // hand the panel to whoever stumbled on the unlock first.
    if (!owner?.configured && !isSupabaseConfigured()) return false;
    return session?.user.role === 'owner';
  },

  user: () => get().session?.user ?? null,
}));

export const useAccessToken = () =>
  useAuthStore((s) => s.session?.token ?? null);

const TEST_HOOKS =
  import.meta.env?.DEV || import.meta.env?.VITE_ENABLE_TEST_HOOKS === 'true';

// Test hook, matching __store / __eng / __flags.
if (typeof window !== 'undefined' && TEST_HOOKS) {
  (window as unknown as { __auth: typeof useAuthStore }).__auth = useAuthStore;
}
