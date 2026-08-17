import type { Page, ProjectFile } from '../types/canvas.types';
import { sanitizeSvgDataUrl } from '../utils/svg-sanitize';

const MAX_PAGES = 1000;
const MAX_OBJECTS_PER_PAGE = 8000;
const MAX_DIMENSION_PT = 14400; // 200 inches at 72 points/inch.
const MAX_STRING = 1_000_000;
const MAX_ARRAY_ITEMS = 20_000;
const MAX_OBJECT_DEPTH = 8;

const SAFE_OBJECT_TYPES = new Set([
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'path',
  'textbox',
  'text',
  'i-text',
  'image',
  'group',
]);

function fallbackId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

function cleanString(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  return value.slice(0, MAX_STRING);
}

function cleanNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function cleanDimension(value: unknown, fallback: number): number {
  return Math.min(MAX_DIMENSION_PT, Math.max(1, cleanNumber(value, fallback)));
}

function safeImageSrc(src: unknown): string | undefined {
  if (typeof src !== 'string') return undefined;

  if (src.startsWith('/assets/')) return src;

  if (/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(src)) {
    return src.length <= MAX_STRING * 2 ? src : undefined;
  }

  if (/^data:image\/svg\+xml/i.test(src)) {
    const sanitized = sanitizeSvgDataUrl(src).url;
    return sanitized || undefined;
  }

  // Do not allow arbitrary http(s) images in imported project JSON. They leak
  // user IPs, can track opens, and can make hydration depend on a third party.
  return undefined;
}

function cleanValue(value: unknown, depth: number): unknown {
  if (depth > MAX_OBJECT_DEPTH) return null;
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') return cleanString(value);
  if (Array.isArray(value)) return value.slice(0, MAX_ARRAY_ITEMS).map((v) => cleanValue(v, depth + 1));
  if (typeof value !== 'object') return undefined;

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key.startsWith('on')) continue;
    const cleaned = cleanValue(child, depth + 1);
    if (cleaned !== undefined) out[key] = cleaned;
  }
  return out;
}

function cleanFabricObject(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== 'object') return null;

  const raw = input as Record<string, unknown>;
  const type = cleanString(raw.type).toLowerCase();
  if (!SAFE_OBJECT_TYPES.has(type)) return null;

  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith('on')) continue;

    if (key === 'type') {
      out.type = type;
      continue;
    }

    if (key === 'src') {
      const safe = safeImageSrc(value);
      if (!safe && type === 'image') return null;
      if (safe) out.src = safe;
      continue;
    }

    if (key === 'objects' && Array.isArray(value)) {
      out.objects = value
        .slice(0, MAX_OBJECTS_PER_PAGE)
        .map(cleanFabricObject)
        .filter(Boolean);
      continue;
    }

    const cleaned = cleanValue(value, 0);
    if (cleaned !== undefined) out[key] = cleaned;
  }

  out.type = type;
  return out;
}

function cleanPage(input: unknown, index: number): Page | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Partial<Page>;

  const data = raw.data && typeof raw.data === 'object'
    ? raw.data as { version?: unknown; objects?: unknown[]; background?: unknown }
    : null;

  const objects = Array.isArray(data?.objects)
    ? data.objects
        .slice(0, MAX_OBJECTS_PER_PAGE)
        .map(cleanFabricObject)
        .filter(Boolean)
    : [];

  const background = typeof raw.background === 'string'
    ? cleanString(raw.background, '#ffffff')
    : '#ffffff';

  const GENERATOR_KINDS = ['sudoku', 'wordsearch', 'crossword', 'maze', 'handwriting', 'template'];

  return {
    id: cleanString(raw.id, fallbackId()),
    name: cleanString(raw.name, `Page ${index + 1}`),
    width: cleanDimension(raw.width, 6 * 72),
    height: cleanDimension(raw.height, 9 * 72),
    background,
    role: raw.role === 'cover' ? 'cover' : 'interior',
    // Preserve the machine-readable generator kind (item 1) so "apply to all"
    // keeps working after save/reload/undo/reorder/resize.
    kind: GENERATOR_KINDS.includes(raw.kind as string) ? (raw.kind as Page['kind']) : undefined,
    data: {
      version: '6.0.0',
      background: typeof data?.background === 'string' ? cleanString(data.background, background) : background,
      objects,
    },
  };
}

export function sanitizeProjectFile(input: unknown): ProjectFile {
  if (!input || typeof input !== 'object') throw new Error('Invalid project file');

  const raw = input as Partial<ProjectFile>;
  const pages = Array.isArray(raw.pages)
    ? raw.pages.slice(0, MAX_PAGES).map(cleanPage).filter(Boolean) as Page[]
    : [];

  if (!pages.length) throw new Error('Invalid project file');

  // Book settings: validated, else dropped (loadProject infers a fallback).
  const PAPERS = ['white', 'cream', 'groundwood', 'color-standard', 'color-premium'];
  const rawBook = raw.book;
  const book =
    rawBook &&
    typeof rawBook === 'object' &&
    typeof rawBook.trimWidth === 'number' &&
    Number.isFinite(rawBook.trimWidth) &&
    typeof rawBook.trimHeight === 'number' &&
    Number.isFinite(rawBook.trimHeight) &&
    PAPERS.includes(String(rawBook.paper)) &&
    (rawBook.binding === 'paperback' || rawBook.binding === 'hardcover')
      ? {
          trimWidth: cleanDimension(rawBook.trimWidth, 6 * 72),
          trimHeight: cleanDimension(rawBook.trimHeight, 9 * 72),
          paper: rawBook.paper,
          binding: rawBook.binding,
        }
      : undefined;

  return {
    version: 1,
    name: cleanString(raw.name, 'Imported project'),
    pages,
    ...(book ? { book } : {}),
    createdAt: cleanString(raw.createdAt, new Date().toISOString()),
    updatedAt: new Date().toISOString(),
  };
}
