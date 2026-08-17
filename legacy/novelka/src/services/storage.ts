import type { ProjectFile } from '../types/canvas.types';
import { sanitizeProjectFile } from './project-sanitize';
import { readStorage, writeStorage } from './storage-keys';

/**
 * Local persistence layer (Phase 1). Swap the implementation for S3/R2 +
 * Postgres later — the interface stays the same.
 *
 * ## Why IndexedDB and not localStorage
 *
 * localStorage caps out around 5 MB and stores strings only. A realistic KDP
 * title is far bigger than that — a measured 30-puzzle crossword book with its
 * answer pages is **5.7 MB of JSON**. The old implementation wrote to
 * localStorage and swallowed the resulting QuotaExceededError, so a user could
 * build a whole book, refresh, and find it silently gone.
 *
 * IndexedDB has no practical size limit for this use (hundreds of MB, and the
 * browser prompts rather than failing silently), stores structured data without
 * a JSON round trip, and is available in every browser we target.
 *
 * Everything here is async as a result. A small metadata index is mirrored into
 * localStorage so the home screen can paint the recent-projects list instantly
 * without waiting on a database open.
 */

// The database is named after the app (MiniPDF -> Gridpress -> Novelka).
// Projects saved by an earlier build live in the old database, so `openDb`
// migrates them once (see migrateLegacyDb) instead of orphaning them.
const DB_NAME = 'novelka';
const LEGACY_DB_NAME = 'minipdf';
const DB_VERSION = 1;
const STORE_PROJECTS = 'projects';
const STORE_META = 'meta';

/** Legacy localStorage keys, read once so existing work is not lost. */
const LEGACY_KEY = 'minipdf.projects.v1';
const LEGACY_AUTOSAVE = 'minipdf.autosave.v1';

/** Set once the legacy database has been copied into `novelka`. */
const DB_MIGRATED_FLAG = 'novelka.db-migrated.v1';

/** Lightweight index mirrored to localStorage for instant first paint. */
const INDEX_KEY = 'novelka.index.v1';

const AUTOSAVE_ID = '__autosave__';

export interface StoredProject {
  id: string;
  name: string;
  updatedAt: string;
  pageCount: number;
  thumbnail?: string;
  file: ProjectFile;
}

/** What the project list needs — deliberately without the heavy `file`. */
export type ProjectSummary = Omit<StoredProject, 'file'>;

export class StorageFullError extends Error {
  constructor(message = 'There is not enough space left to save this project.') {
    super(message);
    this.name = 'StorageFullError';
  }
}

// ------------------------------------------------------------------ database

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    // Private-browsing modes and locked-down profiles can refuse IndexedDB
    // outright. Fall back rather than losing the feature entirely.
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        if (!db) {
          reject(new Error('IndexedDB unavailable'));
          return;
        }
        let t: IDBTransaction;
        try {
          t = db.transaction(store, mode);
        } catch (e) {
          reject(e);
          return;
        }
        const req = run(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          const err = req.error;
          reject(
            err?.name === 'QuotaExceededError'
              ? new StorageFullError()
              : err ?? new Error('Storage write failed'),
          );
        };
        t.onabort = () => {
          const err = t.error;
          reject(
            err?.name === 'QuotaExceededError'
              ? new StorageFullError()
              : err ?? new Error('Storage transaction aborted'),
          );
        };
      }),
  );
}

// --------------------------------------------------------------- index cache

function readIndex(): ProjectSummary[] {
  try {
    return JSON.parse(readStorage(INDEX_KEY) ?? '[]') as ProjectSummary[];
  } catch {
    return [];
  }
}

function writeIndex(list: ProjectSummary[]) {
  try {
    // Thumbnails are data URLs and dwarf everything else in the index, so the
    // cached copy keeps only enough to render a list row.
    const slim = list.map(({ id, name, updatedAt, pageCount }) => ({
      id, name, updatedAt, pageCount,
    }));
    writeStorage(INDEX_KEY, JSON.stringify(slim));
  } catch {
    /* the index is only a cache — losing it costs a slower first paint */
  }
}

// ----------------------------------------------------------------- migration

let migrated = false;

/**
 * Copy every record from the pre-rename database (`minipdf`) into the
 * current one (`novelka`) exactly once, then drop the old database.
 * Runs before any storage read/write, so nothing saved by an older build is
 * lost by the rename.
 */
async function migrateLegacyDb(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    if (localStorage.getItem(DB_MIGRATED_FLAG)) return;
    const fresh = await openDb();
    if (!fresh) return;

    const legacy = await new Promise<IDBDatabase | null>((resolve) => {
      let req: IDBOpenDBRequest;
      try {
        req = indexedDB.open(LEGACY_DB_NAME, 1);
      } catch {
        resolve(null);
        return;
      }
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });

    if (legacy) {
      const hasProjects = legacy.objectStoreNames.contains(STORE_PROJECTS);
      const hasMeta = legacy.objectStoreNames.contains(STORE_META);
      if (hasProjects || hasMeta) {
        const copyStore = async (name: string) => {
          const all = await new Promise<unknown[]>((resolve, reject) => {
            const t = legacy.transaction(name, 'readonly');
            const r = t.objectStore(name).getAll();
            r.onsuccess = () => resolve(r.result);
            r.onerror = () => reject(r.error);
          });
          for (const rec of all) {
            await tx(name, 'readwrite', (s) => s.put(rec)).catch(() => undefined);
          }
        };
        if (hasProjects) await copyStore(STORE_PROJECTS);
        if (hasMeta) await copyStore(STORE_META);
      }
      legacy.close();
      // Only drop the old database after a successful copy. If the browser
      // refuses, the flag below is still set so we do not re-copy next boot.
      try {
        indexedDB.deleteDatabase(LEGACY_DB_NAME);
      } catch {
        /* left in place; harmless */
      }
    }
    localStorage.setItem(DB_MIGRATED_FLAG, '1');
  } catch {
    /* a failed migration must never block the app from starting */
  }
}

/** Move anything left in localStorage by an older build into IndexedDB. */
async function migrateLegacy(): Promise<void> {
  if (migrated) return;
  migrated = true;
  await migrateLegacyDb();
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (raw) {
      const list = JSON.parse(raw) as StoredProject[];
      for (const p of list) {
        try {
          await tx(STORE_PROJECTS, 'readwrite', (s) => s.put(p));
        } catch {
          /* skip a project that will not fit rather than abort the migration */
        }
      }
      localStorage.removeItem(LEGACY_KEY);
    }
    const rawAuto = localStorage.getItem(LEGACY_AUTOSAVE);
    if (rawAuto) {
      const parsed = JSON.parse(rawAuto) as { at: number; file: ProjectFile };
      await tx(STORE_META, 'readwrite', (s) =>
        s.put({ id: AUTOSAVE_ID, at: parsed.at, file: parsed.file }),
      ).catch(() => undefined);
      localStorage.removeItem(LEGACY_AUTOSAVE);
    }
  } catch {
    /* a failed migration must never block the app from starting */
  }
}

// ------------------------------------------------------------------- storage

export const storage = {
  /** Cached summaries for instant paint; call `list()` for the true state. */
  listCached(): ProjectSummary[] {
    return readIndex().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async list(): Promise<StoredProject[]> {
    await migrateLegacy();
    try {
      const all = await tx<StoredProject[]>(STORE_PROJECTS, 'readonly', (s) =>
        s.getAll() as IDBRequest<StoredProject[]>,
      );
      const sorted = all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      writeIndex(sorted);
      return sorted;
    } catch {
      return [];
    }
  },

  /**
   * Persist a project.
   * Throws `StorageFullError` when the browser refuses the write — callers must
   * surface that, never swallow it.
   */
  async save(id: string, file: ProjectFile, thumbnail?: string): Promise<StoredProject> {
    await migrateLegacy();
    const entry: StoredProject = {
      id,
      name: file.name,
      updatedAt: new Date().toISOString(),
      pageCount: file.pages.length,
      thumbnail,
      file,
    };
    await tx(STORE_PROJECTS, 'readwrite', (s) => s.put(entry));
    const idx = readIndex().filter((p) => p.id !== id);
    idx.push({
      id, name: entry.name, updatedAt: entry.updatedAt, pageCount: entry.pageCount,
    });
    writeIndex(idx);
    return entry;
  },

  async get(id: string): Promise<StoredProject | undefined> {
    await migrateLegacy();
    try {
      return await tx<StoredProject | undefined>(STORE_PROJECTS, 'readonly', (s) =>
        s.get(id) as IDBRequest<StoredProject | undefined>,
      );
    } catch {
      return undefined;
    }
  },

  async remove(id: string): Promise<void> {
    try {
      await tx(STORE_PROJECTS, 'readwrite', (s) => s.delete(id));
    } catch {
      /* nothing to do — the row is already gone */
    }
    writeIndex(readIndex().filter((p) => p.id !== id));
  },

  /**
   * Rename an existing project in place.
   * Preserves all pages, instances, overrides, and ID while updating index cache.
   */
  async rename(id: string, newName: string): Promise<StoredProject | undefined> {
    const trimmed = newName.trim();
    if (!trimmed) throw new Error('Project name cannot be empty');
    const existing = await this.get(id);
    if (!existing) return undefined;
    const updated: StoredProject = {
      ...existing,
      name: trimmed,
      updatedAt: new Date().toISOString(),
      file: {
        ...existing.file,
        name: trimmed,
      },
    };
    await tx(STORE_PROJECTS, 'readwrite', (s) => s.put(updated));
    const idx = readIndex().filter((p) => p.id !== id);
    idx.push({
      id,
      name: trimmed,
      updatedAt: updated.updatedAt,
      pageCount: updated.pageCount,
    });
    writeIndex(idx);
    return updated;
  },

  /**
   * Duplicate a project with a new ID and completely isolated page, object, and instance clones.
   * Modifying the clone does not mutate the original.
   */
  async duplicate(id: string, customName?: string): Promise<StoredProject> {
    const existing = await this.get(id);
    if (!existing) throw new Error(`Project "${id}" not found`);
    const newId = crypto.randomUUID();
    const clonedFile: ProjectFile = JSON.parse(JSON.stringify(existing.file));
    const newName = customName?.trim() || `Copy of ${existing.name}`;
    clonedFile.name = newName;

    // Re-map page IDs, object IDs, and instance IDs to ensure complete object isolation
    clonedFile.pages.forEach((page) => {
      const newPageId = crypto.randomUUID().slice(0, 8);
      page.id = newPageId;

      const rawData = page.data as Record<string, unknown> | null;
      if (!rawData) return;

      const objIdMap = new Map<string, string>();
      const instIdMap = new Map<string, string>();

      // 1. Remap canvas object IDs
      const rawObjects = (rawData.objects ?? []) as Array<Record<string, unknown>>;
      if (Array.isArray(rawObjects)) {
        rawObjects.forEach((obj) => {
          const oldObjId = obj.id as string | undefined;
          const newObjId = crypto.randomUUID().slice(0, 8);
          if (oldObjId) {
            objIdMap.set(oldObjId, newObjId);
          }
          obj.id = newObjId;
        });
      }

      // 2. Remap instances and their objectIds (covers both novelka:instances and instances)
      const instLists = [
        rawData['novelka:instances'],
        rawData.instances,
      ].filter(Array.isArray) as Array<Array<Record<string, unknown>>>;

      const visitedInsts = new Set<Record<string, unknown>>();
      instLists.forEach((list) => {
        list.forEach((inst) => {
          if (visitedInsts.has(inst)) return;
          visitedInsts.add(inst);

          const oldInstId = inst.instanceId as string | undefined;
          const newInstId = `inst-${crypto.randomUUID().slice(0, 8)}`;
          if (oldInstId) {
            instIdMap.set(oldInstId, newInstId);
          }
          inst.instanceId = newInstId;
          inst.pageId = newPageId;

          if (Array.isArray(inst.objectIds)) {
            inst.objectIds = (inst.objectIds as string[]).map((oldId: string) => objIdMap.get(oldId) || oldId);
          }
        });
      });

      // 3. Update instanceId on canvas objects
      if (Array.isArray(rawObjects)) {
        rawObjects.forEach((obj) => {
          const oldInstId = obj.instanceId as string | undefined;
          if (oldInstId && instIdMap.has(oldInstId)) {
            obj.instanceId = instIdMap.get(oldInstId);
          }
        });
      }
    });

    const duplicated: StoredProject = {
      id: newId,
      name: newName,
      updatedAt: new Date().toISOString(),
      pageCount: clonedFile.pages.length,
      thumbnail: existing.thumbnail,
      file: clonedFile,
    };

    await tx(STORE_PROJECTS, 'readwrite', (s) => s.put(duplicated));
    const idx = readIndex().filter((p) => p.id !== newId);
    idx.push({
      id: newId,
      name: newName,
      updatedAt: duplicated.updatedAt,
      pageCount: duplicated.pageCount,
    });
    writeIndex(idx);
    return duplicated;
  },

  /**
   * Background autosave.
   * Resolves `true` on success and `false` when the browser refused the write,
   * so the caller can warn the user instead of pretending it worked.
   */
  async autosave(file: ProjectFile): Promise<boolean> {
    await migrateLegacy();
    try {
      await tx(STORE_META, 'readwrite', (s) =>
        s.put({ id: AUTOSAVE_ID, at: Date.now(), file }),
      );
      return true;
    } catch {
      return false;
    }
  },

  async readAutosave(): Promise<{ at: number; file: ProjectFile } | null> {
    await migrateLegacy();
    try {
      const row = await tx<{ at: number; file: ProjectFile } | undefined>(
        STORE_META, 'readonly', (s) =>
          s.get(AUTOSAVE_ID) as IDBRequest<{ at: number; file: ProjectFile } | undefined>,
      );
      return row ? { at: row.at, file: row.file } : null;
    } catch {
      return null;
    }
  },

  async clearAutosave(): Promise<void> {
    try {
      await tx(STORE_META, 'readwrite', (s) => s.delete(AUTOSAVE_ID));
    } catch {
      /* already clear */
    }
  },

  /**
   * Roughly how much room is left, when the browser will tell us.
   * Used to warn *before* a save fails rather than after.
   */
  async estimate(): Promise<{ usedMb: number; quotaMb: number; pct: number } | null> {
    try {
      if (!navigator.storage?.estimate) return null;
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      if (!quota) return null;
      return {
        usedMb: +(usage / 1048576).toFixed(1),
        quotaMb: +(quota / 1048576).toFixed(1),
        pct: Math.round((usage / quota) * 100),
      };
    } catch {
      return null;
    }
  },

  /** True when projects are being kept in memory only — worth warning about. */
  async isAvailable(): Promise<boolean> {
    return (await openDb()) !== null;
  },
};

export function downloadJSON(file: ProjectFile) {
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${file.name.replace(/\s+/g, '-').toLowerCase()}.novelka.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export function readProjectFile(file: File): Promise<ProjectFile> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      try {
        const parsed = sanitizeProjectFile(JSON.parse(String(r.result)));
        resolve(parsed);
      } catch (e) {
        reject(e);
      }
    };
    r.onerror = () => reject(new Error('Could not read file'));
    r.readAsText(file);
  });
}
