/**
 * IndexedDB persistence — projects, the autosave slot, and the localStorage
 * index cache (architecture.md §8, spec 04 §1).
 *
 * Ported from `legacy/novelka/src/services/storage.ts`, which already solved
 * this correctly. The plumbing is kept and the changes are exactly the ones
 * the spec lists, and no others:
 *
 *  1. The stored payload is a `Document`, not the legacy `ProjectFile`.
 *  2. The legacy migration is dropped: no `migrateLegacy`, no `LEGACY_DB_NAME`,
 *     no legacy localStorage keys, no `DB_MIGRATED_FLAG`. This is a fresh
 *     product with a fresh database; there are no old books to rescue.
 *  3. Errors are never swallowed. `list` / `get` / `remove` / `save` reject on
 *     failure, so an empty list and a broken database cannot look identical.
 *     (The one fallback that survives is the localStorage *index cache*, which
 *     is advisory by design and documented as such.)
 *  4. `Date.now()` is injected, as everywhere else.
 *
 * The QuotaExceededError -> StorageFullError mapping on both `onerror` and
 * `onabort` is kept exactly. It is the fix for the swallowed write that lost a
 * 5.7 MB book in the legacy build.
 */

import { assertValidDocument } from '../model/document';
import { migrate } from '../model/migrate';
import { DocumentParseError, MAX_TITLE_LENGTH } from '../model/parse';
import type { Document } from '../model/types';

const DB_NAME = 'novelka';
const DB_VERSION = 1;
const STORE_PROJECTS = 'projects';
const STORE_META = 'meta';

/** Lightweight index mirrored to localStorage for instant first paint. */
const INDEX_KEY = 'novelka.index.v1';

/** The autosave slot lives in the `meta` store under this fixed key. */
const AUTOSAVE_KEY = '__autosave__';

/** Thrown when the browser refuses a write for lack of space. Never swallowed. */
export class StorageFullError extends Error {
  constructor(message = 'There is not enough space left to save this project.') {
    super(message);
    this.name = 'StorageFullError';
  }
}

/** A saved project. `document` is the Document, one shape from Unit 01. */
export type StoredProject = {
  readonly id: string;
  readonly schemaVersion: number;
  readonly document: Document;
  readonly updatedAt: number;
  readonly thumbnail?: string | null;
};

/** What the project list needs, deliberately without the heavy `document`. */
export type ProjectSummary = {
  readonly id: string;
  readonly name: string;
  readonly updatedAt: number;
  readonly pageCount: number;
};

/** The autosave record's contents; the `meta` store adds the `id` key. */
export type AutosaveRecord = {
  readonly at: number;
  readonly document: Document;
};

/** The on-disk shape of an exported project file. */
export type ProjectFile = {
  readonly app: 'novelka';
  readonly version: number;
  readonly document: Document;
};

/* -------------------------------------------------------------- database -- */

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise !== null) return dbPromise;
  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    // Private-browsing modes and locked-down profiles can refuse IndexedDB
    // outright. The caller decides what "unavailable" means; reads and writes
    // reject loudly rather than pretending a save happened.
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return dbPromise;
}

/**
 * Runs one request inside one transaction and resolves with its result.
 * A QuotaExceededError on either the request or the transaction surfaces as
 * `StorageFullError` — the swallowed-write fix, kept verbatim from the legacy
 * port.
 */
function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (objectStore: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        if (db === null) {
          reject(new Error('IndexedDB is unavailable, so nothing can be saved or loaded.'));
          return;
        }
        let transaction: IDBTransaction;
        try {
          transaction = db.transaction(store, mode);
        } catch (error) {
          reject(error);
          return;
        }
        const request = run(transaction.objectStore(store));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
          const error = request.error;
          reject(
            error !== null && error.name === 'QuotaExceededError'
              ? new StorageFullError()
              : error ?? new Error('The storage request failed.'),
          );
        };
        transaction.onabort = () => {
          const error = transaction.error;
          reject(
            error !== null && error.name === 'QuotaExceededError'
              ? new StorageFullError()
              : error ?? new Error('The storage transaction was aborted.'),
          );
        };
      }),
  );
}

/* ----------------------------------------------------------- index cache -- */

function isProjectSummary(value: unknown): value is ProjectSummary {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record['id'] === 'string' &&
    typeof record['name'] === 'string' &&
    typeof record['updatedAt'] === 'number' &&
    typeof record['pageCount'] === 'number'
  );
}

function readIndex(): readonly ProjectSummary[] {
  if (typeof localStorage === 'undefined') return [];
  const raw = localStorage.getItem(INDEX_KEY);
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // The index is only a cache. A corrupt entry costs a slower first paint,
    // never a lost book, so it is dropped.
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isProjectSummary);
}

function writeIndex(summaries: readonly ProjectSummary[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(summaries));
  } catch {
    // The index is a cache. If localStorage refuses the write, the database
    // still holds the truth; the home screen simply waits for `list()`.
  }
}

/* -------------------------------------------------------------- name utils -- */

function cleanName(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error('A project name cannot be empty.');
  }
  if (trimmed.length > MAX_TITLE_LENGTH) {
    throw new Error(
      `A project name must be ${MAX_TITLE_LENGTH} characters or fewer, received ${trimmed.length}.`,
    );
  }
  return trimmed;
}

/**
 * A duplicate's default name. If the original title is already at the length
 * cap, the "Copy of " prefix is trimmed so the result still fits the bound.
 */
function duplicateName(original: string, customName: string | undefined): string {
  if (customName !== undefined) return cleanName(customName);
  const name = `Copy of ${original}`;
  return name.length <= MAX_TITLE_LENGTH ? name : name.slice(0, MAX_TITLE_LENGTH);
}

/**
 * A fresh, fully isolated copy of a Document. Every id — document, pages,
 * cover, elements — is replaced from the injected id source, so the copy can
 * be edited without ever touching the original. All other fields pass through
 * untouched.
 */
function duplicateDocument(source: Document, id: () => string, title: string): Document {
  const pages = source.pages.map((page) => ({
    ...page,
    id: id(),
    elements: page.elements.map((element) => ({ ...element, id: id() })),
  }));
  const cover =
    source.cover === null
      ? null
      : {
          ...source.cover,
          id: id(),
          elements: source.cover.elements.map((element) => ({ ...element, id: id() })),
        };
  return {
    ...source,
    id: id(),
    pages,
    cover,
    meta: { ...source.meta, title },
  };
}

/* ----------------------------------------------------------------- storage -- */

export type StorageOptions = {
  /** Injected clock. `Date.now` is never called inside this module. */
  readonly now: () => number;
  /** Injected id source, used by `duplicate` to mint fresh ids. */
  readonly id: () => string;
};

export type StorageApi = {
  readonly list: () => Promise<StoredProject[]>;
  readonly get: (id: string) => Promise<StoredProject | null>;
  readonly save: (document: Document, thumbnail?: string | null) => Promise<StoredProject>;
  readonly remove: (id: string) => Promise<void>;
  readonly rename: (id: string, name: string) => Promise<StoredProject>;
  readonly duplicate: (id: string, customName?: string) => Promise<StoredProject>;
  readonly writeAutosave: (record: AutosaveRecord) => Promise<void>;
  readonly readAutosave: () => Promise<AutosaveRecord | null>;
  readonly clearAutosave: () => Promise<void>;
};

export function createStorage(options: StorageOptions): StorageApi {
  const { now, id } = options;

  const summarize = (record: StoredProject): ProjectSummary => ({
    id: record.id,
    name: record.document.meta.title,
    updatedAt: record.updatedAt,
    pageCount: record.document.pages.length,
  });

  const getOne = async (projectId: string): Promise<StoredProject | null> => {
    const record = await tx<StoredProject | undefined>(STORE_PROJECTS, 'readonly', (s) =>
      s.get(projectId) as IDBRequest<StoredProject | undefined>,
    );
    return record ?? null;
  };

  return {
    /** The true state of the project store, newest first. Rejects on failure. */
    async list(): Promise<StoredProject[]> {
      const all = await tx<StoredProject[]>(STORE_PROJECTS, 'readonly', (s) =>
        s.getAll() as IDBRequest<StoredProject[]>,
      );
      const sorted = [...all].sort((a, b) => b.updatedAt - a.updatedAt);
      writeIndex(sorted.map(summarize));
      return sorted;
    },

    /** Reads one project. `null` means "not there"; a failure rejects. */
    get: getOne,

    /** Persists a project. Throws `StorageFullError` when the browser refuses. */
    async save(document: Document, thumbnail?: string | null): Promise<StoredProject> {
      assertValidDocument(document);
      const record: StoredProject = {
        id: document.id,
        schemaVersion: document.schemaVersion,
        document,
        updatedAt: now(),
        ...(thumbnail !== undefined ? { thumbnail } : {}),
      };
      await tx<IDBValidKey>(STORE_PROJECTS, 'readwrite', (s) => s.put(record));
      const cached = readIndex().filter((summary) => summary.id !== record.id);
      cached.push(summarize(record));
      writeIndex(cached);
      return record;
    },

    /** Deletes a project. A missing row is a no-op; a real failure rejects. */
    async remove(projectId: string): Promise<void> {
      await tx<undefined>(STORE_PROJECTS, 'readwrite', (s) => s.delete(projectId));
      writeIndex(readIndex().filter((summary) => summary.id !== projectId));
    },

    /** Renames in place, preserving the id and every element. */
    async rename(projectId: string, name: string): Promise<StoredProject> {
      const title = cleanName(name);
      const existing = await getOne(projectId);
      if (existing === null) {
        throw new Error(`Cannot rename: no project with id ${JSON.stringify(projectId)}.`);
      }
      const record: StoredProject = {
        id: existing.id,
        schemaVersion: existing.schemaVersion,
        document: { ...existing.document, meta: { ...existing.document.meta, title } },
        updatedAt: now(),
      };
      await tx<IDBValidKey>(STORE_PROJECTS, 'readwrite', (s) => s.put(record));
      const cached = readIndex().filter((summary) => summary.id !== record.id);
      cached.push(summarize(record));
      writeIndex(cached);
      return record;
    },

    /** Duplicates with a new id and fully isolated ids throughout. */
    async duplicate(projectId: string, customName?: string): Promise<StoredProject> {
      const existing = await getOne(projectId);
      if (existing === null) {
        throw new Error(`Cannot duplicate: no project with id ${JSON.stringify(projectId)}.`);
      }
      const title = duplicateName(existing.document.meta.title, customName);
      const document = duplicateDocument(existing.document, id, title);
      const record: StoredProject = {
        // The project IS the document, so the record is keyed by the new
        // document id rather than a separately minted one.
        id: document.id,
        schemaVersion: existing.schemaVersion,
        document,
        updatedAt: now(),
      };
      await tx<IDBValidKey>(STORE_PROJECTS, 'readwrite', (s) => s.put(record));
      const cached = readIndex().filter((summary) => summary.id !== record.id);
      cached.push(summarize(record));
      writeIndex(cached);
      return record;
    },

    /** Writes the autosave slot. Never overwrites a deliberately saved project. */
    async writeAutosave(record: AutosaveRecord): Promise<void> {
      assertValidDocument(record.document);
      await tx<IDBValidKey>(STORE_META, 'readwrite', (s) =>
        s.put({ id: AUTOSAVE_KEY, at: record.at, document: record.document }),
      );
    },

    /** Reads the autosave slot, or `null` when there is none. Rejects on failure. */
    async readAutosave(): Promise<AutosaveRecord | null> {
      const record = await tx<{ at: number; document: Document } | undefined>(
        STORE_META,
        'readonly',
        (s) => s.get(AUTOSAVE_KEY) as IDBRequest<{ at: number; document: Document } | undefined>,
      );
      return record === undefined ? null : { at: record.at, document: record.document };
    },

    /** Clears the autosave slot after an explicit save or an accepted recovery. */
    async clearAutosave(): Promise<void> {
      await tx<undefined>(STORE_META, 'readwrite', (s) => s.delete(AUTOSAVE_KEY));
    },
  };
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** The app-wide storage, wired to the real clock and id source. */
export const storage: StorageApi = createStorage({ now: Date.now, id: randomId });

/* ------------------------------------------------------- crash recovery -- */

/**
 * The recovery candidate fact, returned for the UI to act on (spec 04 §5).
 * When the autosave slot is newer than the newest named project, the slot
 * holds work the user has not deliberately saved — return it. Otherwise the
 * named projects already contain everything, so there is nothing to recover.
 */
export function recoveryCandidate(
  autosave: AutosaveRecord | null,
  projects: readonly StoredProject[],
): AutosaveRecord | null {
  if (autosave === null) return null;
  let newest = Number.NEGATIVE_INFINITY;
  for (const project of projects) {
    if (project.updatedAt > newest) newest = project.updatedAt;
  }
  return autosave.at > newest ? autosave : null;
}

/* -------------------------------------------------------------- import / export -- */

/** Serialises a Document into the exported project file format. */
export function serializeProjectFile(document: Document): string {
  const payload: ProjectFile = { app: 'novelka', version: document.schemaVersion, document };
  return JSON.stringify(payload, null, 2);
}

function fileSlug(doc: Document): string {
  const slug = doc.meta.title
    .trim()
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, '-')
    .toLowerCase();
  return `${slug.length > 0 ? slug : 'novelka-book'}.novelka.json`;
}

/** Downloads the Document as a JSON file — the "download my work" escape hatch. */
export function downloadJSON(doc: Document): void {
  const blob = new Blob([serializeProjectFile(doc)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = globalThis.document.createElement('a');
  anchor.href = url;
  anchor.download = fileSlug(doc);
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

/** Unwraps either a `ProjectFile` envelope or a bare Document. */
function extractDocument(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new DocumentParseError('This file does not contain a Novelka book.');
  }
  const record = value as Record<string, unknown>;
  const wrapped = record['document'];
  if (wrapped !== undefined && typeof wrapped === 'object' && wrapped !== null && !Array.isArray(wrapped)) {
    return wrapped;
  }
  return value;
}

/** Reads an exported project file back into a migrated, validated Document. */
export async function readProjectFile(file: File): Promise<Document> {
  let text: string;
  try {
    text = await file.text();
  } catch {
    throw new Error('The file could not be read.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new DocumentParseError('This file is not valid JSON, so it is not a Novelka book.');
  }
  return migrate(extractDocument(parsed));
}
