/**
 * How the owner reaches the control panel.
 *
 * ## The rule
 *
 * The admin panel must be **invisible**. Not disabled, not greyed out, not
 * behind a button that says "Admin" — a visible control tells every user the
 * panel exists and invites them to poke at it. There is no UI affordance at
 * all; the owner opens it deliberately and nobody else knows it is there.
 *
 * ## Three layers, strongest first
 *
 * 1. **Build flag.** `VITE_ENABLE_ADMIN=false` drops the panel out of the
 *    bundle entirely. Ship a public build with it off and the code the user
 *    downloads contains no admin at all — nothing to find, nothing to unlock.
 * 2. **Lazy chunk.** When it is built in, the panel is a separate chunk that is
 *    only fetched after the owner has already authenticated. Reading the main
 *    bundle reveals a filename, not the panel's contents.
 * 3. **Hidden entry + passphrase.** No button. A key sequence, a URL hash, or
 *    a console call — each still requires the owner passphrase.
 *
 * ## What this is not
 *
 * Obscurity is not access control. Layers 2 and 3 raise the cost of finding it;
 * layer 1 is the only one that actually removes it. Anything that must be
 * unforgeable — who may change prices — has to be enforced by a server the user
 * cannot edit. This keeps honest users out of a panel that is not theirs.
 */

/** Compiled out of public builds when the flag is false. */
export const ADMIN_BUILT_IN = import.meta.env.VITE_ENABLE_ADMIN !== 'false';

/**
 * The key sequence that reveals the panel.
 * Typed anywhere outside a text field. Chosen to be something nobody hits by
 * accident and that means nothing if seen in the source.
 */
export const UNLOCK_SEQUENCE = 'gpadmin';

/** Also reachable at `#gp-control` for the owner's own bookmark. */
export const UNLOCK_HASH = '#gp-control';

/** How long the panel stays reachable after unlocking, in minutes. */
export const ADMIN_SESSION_MINUTES = 30;

const UNLOCK_KEY = 'novelka.admin-unlocked.v1';
/** Pre-rename key — honoured for the rest of an already-open session. */
const UNLOCK_KEY_LEGACY = 'gridpress.admin-unlocked.v1';

/**
 * Mark admin as unlocked for a short window.
 * Deliberately time-boxed: an owner who walks away from a shared machine
 * should not leave the control panel reachable indefinitely.
 */
export function markUnlocked(): void {
  try {
    sessionStorage.setItem(UNLOCK_KEY, String(Date.now()));
    sessionStorage.removeItem(UNLOCK_KEY_LEGACY);
  } catch {
    /* private mode — the unlock simply will not persist across a reload */
  }
}

export function isUnlocked(): boolean {
  try {
    const at = Number(
      sessionStorage.getItem(UNLOCK_KEY) ?? sessionStorage.getItem(UNLOCK_KEY_LEGACY) ?? 0,
    );
    if (!at) return false;
    if (Date.now() - at > ADMIN_SESSION_MINUTES * 60_000) {
      sessionStorage.removeItem(UNLOCK_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function lock(): void {
  try {
    sessionStorage.removeItem(UNLOCK_KEY);
  } catch {
    /* nothing to clear */
  }
}

/**
 * Watch for the unlock sequence.
 *
 * Ignores typing inside inputs, textareas and contenteditable so an author
 * writing a word list can never trip it. Returns a disposer.
 */
export function watchForUnlock(onUnlock: () => void): () => void {
  // Written as a literal `if (false)` after substitution, so the whole body is
  // dropped by dead-code elimination in a public build. Guarding only the call
  // site left the listener, the hash route and the console hook sitting in the
  // shipped bundle for anyone to read.
  if (!ADMIN_BUILT_IN) return () => undefined;

  let buffer = '';
  let lastAt = 0;

  const onKey = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    const tag = el?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || el?.isContentEditable) {
      return;
    }
    if (e.key.length !== 1) return;

    // reset the buffer if the owner pauses — stops random keys accumulating
    const now = Date.now();
    if (now - lastAt > 2000) buffer = '';
    lastAt = now;

    buffer = (buffer + e.key.toLowerCase()).slice(-UNLOCK_SEQUENCE.length);
    if (buffer === UNLOCK_SEQUENCE) {
      buffer = '';
      onUnlock();
    }
  };

  const onHash = () => {
    if (window.location.hash === UNLOCK_HASH) {
      // drop the hash so it does not sit in the address bar or history
      history.replaceState(null, '', window.location.pathname + window.location.search);
      onUnlock();
    }
  };

  window.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', onHash);
  onHash(); // handle a direct load of the bookmark

  // A console entry point for the owner, described nowhere in the UI.
  (window as unknown as Record<string, unknown>).__gpControl = () => {
    onUnlock();
    return 'Novelka control panel unlocking…';
  };

  return () => {
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('hashchange', onHash);
    delete (window as unknown as Record<string, unknown>).__gpControl;
  };
}
