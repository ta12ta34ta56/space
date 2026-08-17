import { create } from 'zustand';
import { readStorage, writeStorage } from '../services/storage-keys';

/**
 * Theme.
 *
 * Two choices only: light and dark. Light is the default — the calm redesign
 * is light-first, so a first-time visitor lands on light regardless of what
 * their OS prefers, and the only way to change it is an explicit click.
 *
 * The `data-theme` attribute goes on <html>, and index.html sets it *before*
 * React mounts. If we waited for React, the app would paint light for one frame
 * and then flash to dark — the classic "flash of wrong theme".
 */

export type ThemeChoice = 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const KEY = 'novelka.theme.v1';

/** Light unless the user has explicitly pinned dark. */
export const DEFAULT_THEME: ThemeChoice = 'light';

export function loadChoice(): ThemeChoice {
  try {
    const raw = readStorage(KEY);
    if (raw === 'light' || raw === 'dark') return raw;
  } catch {
    /* storage can be blocked in private mode; fall through to the default */
  }
  return DEFAULT_THEME;
}

/** Kept for call sites that still resolve a choice; with no `system` it is identity. */
export const resolve = (c: ThemeChoice): ResolvedTheme => c;

/**
 * Write the theme to the DOM.
 *
 * The attribute is always present — there is no "unset" state that hands the
 * decision to the OS, so the stylesheet has exactly one source of truth.
 */
export function applyTheme(choice: ThemeChoice) {
  document.documentElement.setAttribute('data-theme', choice);

  // Colour the browser chrome (mobile address bar) to match.
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', choice === 'light' ? '#f4f5f8' : '#0f1115');
}

interface ThemeState {
  choice: ThemeChoice;
  resolved: ResolvedTheme;
  setTheme: (c: ThemeChoice) => void;
  /** Toolbar button: dark ⇄ light. */
  toggle: () => void;
  init: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  choice: DEFAULT_THEME,
  resolved: DEFAULT_THEME,

  setTheme: (choice) => {
    try {
      writeStorage(KEY, choice);
    } catch {
      /* not fatal — the theme still applies for this session */
    }
    applyTheme(choice);
    set({ choice, resolved: choice });
  },

  toggle: () => {
    get().setTheme(get().choice === 'dark' ? 'light' : 'dark');
  },

  init: () => {
    const choice = loadChoice();
    applyTheme(choice);
    set({ choice, resolved: choice });
  },
}));
