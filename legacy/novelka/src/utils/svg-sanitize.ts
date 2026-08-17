/**
 * SVG sanitiser.
 *
 * ## Why this exists
 *
 * SVG is not an image format — it is an XML document that may contain
 * `<script>`, event handlers (`onload`, `onclick`, …), external references and
 * embedded HTML via `<foreignObject>`. Handing an untrusted SVG straight to a
 * parser is the same class of risk as `innerHTML` on untrusted markup.
 *
 * Novelka imports SVGs from two places:
 *   1. its own bundled asset library (trusted)
 *   2. **files the user uploads** (not trusted)
 *
 * The second path is the problem. Someone could send a "sticker" to a friend,
 * or a puzzle-book template could be shared, and opening it would run script in
 * the victim's editor — with access to their saved projects.
 *
 * There is also a published advisory against Fabric.js's SVG parser, so we do
 * not rely on the parser to defend itself.
 *
 * ## Approach
 *
 * Allow-list, not block-list. A block-list is a guess about what attackers will
 * try; an allow-list states what a drawing legitimately needs and drops the
 * rest. Anything not explicitly permitted is removed, so a tag we have never
 * heard of fails closed.
 *
 * Parsing uses `DOMParser` with `image/svg+xml`, which builds an inert document
 * — scripts do not run and resources are not fetched during parsing. Removal
 * happens before the markup ever reaches Fabric.
 */

/** Elements a drawing actually needs. Everything else is dropped. */
const ALLOWED_TAGS = new Set([
  'svg', 'g', 'defs', 'symbol', 'use', 'title', 'desc', 'metadata',
  'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'text', 'tspan', 'textPath',
  'linearGradient', 'radialGradient', 'stop', 'pattern',
  'clipPath', 'mask',
  'marker',
  'style',
]);

/**
 * Elements that are always removed, even though some are valid SVG.
 *
 * `foreignObject` embeds arbitrary HTML. `script` is obvious. The animation
 * elements can retarget attributes on other nodes, which has been used to
 * rebuild a dangerous attribute after sanitising.
 */
const FORBIDDEN_TAGS = new Set([
  'script', 'foreignObject', 'iframe', 'embed', 'object', 'audio', 'video',
  'animate', 'animateTransform', 'animateMotion', 'set', 'handler',
  'listener', 'a',
]);

/** Presentation and geometry attributes. */
const ALLOWED_ATTRS = new Set([
  'id', 'class', 'transform', 'style',
  'd', 'points', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry',
  'width', 'height', 'viewBox', 'preserveAspectRatio',
  'fill', 'fill-opacity', 'fill-rule',
  'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap',
  'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-miterlimit',
  'opacity', 'color', 'visibility', 'display',
  'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor',
  'letter-spacing', 'word-spacing', 'dominant-baseline', 'alignment-baseline',
  'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform',
  'spreadMethod', 'patternUnits', 'patternTransform',
  'clip-path', 'clip-rule', 'mask', 'marker-start', 'marker-mid', 'marker-end',
  'markerWidth', 'markerHeight', 'refX', 'refY', 'orient',
  'maskUnits', 'maskContentUnits', 'clipPathUnits',
  'xmlns', 'xmlns:xlink', 'version', 'space',
]);

/** Attributes allowed to hold a reference, and therefore checked extra hard. */
const URL_ATTRS = new Set(['href', 'xlink:href', 'clip-path', 'mask', 'fill', 'stroke',
  'marker-start', 'marker-mid', 'marker-end']);

export interface SanitizeReport {
  /** the cleaned markup */
  svg: string;
  /** tag names that were removed */
  removedTags: string[];
  /** attribute names that were removed */
  removedAttrs: string[];
  /** true when anything at all was stripped */
  modified: boolean;
  /** set when the input could not be parsed as SVG at all */
  error?: string;
}

/**
 * Is this attribute value safe?
 *
 * Only same-document references (`#gradient-1`) and plain values are allowed.
 * `javascript:` executes. `data:` can carry a nested SVG with its own script.
 * `http(s):` leaks the reader's IP to a third party and can pull in new markup.
 */
function isSafeUrlValue(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v) return true;
  // strip CSS url(...) wrapper if present
  const inner = v.startsWith('url(')
    ? v.slice(4).replace(/\)$/, '').replace(/^["']|["']$/g, '').trim()
    : v;
  if (inner.startsWith('#')) return true;          // internal reference: fine
  if (/^[a-z-]+$/.test(inner)) return true;        // a keyword like "none"
  if (/^(rgb|rgba|hsl|hsla)\(/.test(inner)) return true;
  if (/^#[0-9a-f]{3,8}$/.test(inner)) return true; // colour literal
  // anything with a scheme, protocol-relative, or control characters: reject
  if (/^[a-z][a-z0-9+.-]*:/.test(inner)) return false;
  if (inner.startsWith('//')) return false;
  return !/[<>]/.test(inner);
}

/** Does this style value try to smuggle a URL or an expression? */
function isSafeStyle(value: string): boolean {
  const v = value.toLowerCase();
  if (v.includes('javascript:') || v.includes('expression(')) return false;
  if (v.includes('@import')) return false;
  // any url(...) must point inside the document
  for (const m of v.matchAll(/url\(([^)]*)\)/g)) {
    if (!isSafeUrlValue(`url(${m[1]})`)) return false;
  }
  return true;
}

/**
 * Strip everything dangerous from an SVG string.
 *
 * Always returns a string safe to hand to a parser. If the input cannot be
 * parsed, returns an empty `<svg/>` rather than the original.
 */
export function sanitizeSvg(input: string): SanitizeReport {
  const removedTags: string[] = [];
  const removedAttrs: string[] = [];

  if (typeof DOMParser === 'undefined') {
    return { svg: '', removedTags, removedAttrs, modified: true, error: 'No DOM available' };
  }

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(input, 'image/svg+xml');
  } catch {
    return { svg: '', removedTags, removedAttrs, modified: true, error: 'Could not parse SVG' };
  }

  if (doc.querySelector('parsererror')) {
    return { svg: '', removedTags, removedAttrs, modified: true, error: 'Malformed SVG' };
  }

  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg') {
    return { svg: '', removedTags, removedAttrs, modified: true, error: 'Not an SVG document' };
  }

  // Walk a snapshot: the live list would shift as nodes are removed.
  const walk = (el: Element) => {
    for (const child of Array.from(el.children)) {
      const tag = child.nodeName.replace(/^.*:/, ''); // drop any namespace prefix
      const lower = tag.toLowerCase();

      const forbidden = [...FORBIDDEN_TAGS].some((t) => t.toLowerCase() === lower);
      const allowed = [...ALLOWED_TAGS].some((t) => t.toLowerCase() === lower);

      if (forbidden || !allowed) {
        removedTags.push(tag);
        child.remove();
        continue;
      }

      // A <style> block can carry @import and url() — validate its text.
      if (lower === 'style' && !isSafeStyle(child.textContent ?? '')) {
        removedTags.push('style(unsafe)');
        child.remove();
        continue;
      }

      cleanAttributes(child);
      walk(child);
    }
  };

  const cleanAttributes = (el: Element) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name;
      const lower = name.toLowerCase();
      const bare = lower.replace(/^.*:/, '');

      // every event handler, in one rule
      if (lower.startsWith('on')) {
        removedAttrs.push(name);
        el.removeAttribute(name);
        continue;
      }

      // href is allowed only on <use>, and only as an internal reference
      if (bare === 'href') {
        const tag = el.nodeName.replace(/^.*:/, '').toLowerCase();
        if (tag !== 'use' || !isSafeUrlValue(attr.value)) {
          removedAttrs.push(name);
          el.removeAttribute(name);
        }
        continue;
      }

      if (!ALLOWED_ATTRS.has(name) && !ALLOWED_ATTRS.has(lower) && !ALLOWED_ATTRS.has(bare)) {
        removedAttrs.push(name);
        el.removeAttribute(name);
        continue;
      }

      if (lower === 'style' && !isSafeStyle(attr.value)) {
        removedAttrs.push('style(unsafe)');
        el.removeAttribute(name);
        continue;
      }

      if (URL_ATTRS.has(lower) && !isSafeUrlValue(attr.value)) {
        removedAttrs.push(name);
        el.removeAttribute(name);
      }
    }
  };

  cleanAttributes(root);
  walk(root);

  const svg = new XMLSerializer().serializeToString(root);
  return {
    svg,
    removedTags,
    removedAttrs,
    modified: removedTags.length > 0 || removedAttrs.length > 0,
  };
}

/** Data-URL prefix for SVG payloads, in the forms browsers accept. */
const SVG_DATA_URL = /^data:image\/svg\+xml[;,]/i;

export const isSvgDataUrl = (url: string) => SVG_DATA_URL.test(url.trim());

/** Decode an `image/svg+xml` data URL to its markup. */
export function decodeSvgDataUrl(url: string): string | null {
  const comma = url.indexOf(',');
  if (comma < 0) return null;
  const meta = url.slice(0, comma).toLowerCase();
  const payload = url.slice(comma + 1);
  try {
    return meta.includes(';base64') ? atob(payload) : decodeURIComponent(payload);
  } catch {
    try {
      return payload; // some encoders leave the body as-is
    } catch {
      return null;
    }
  }
}

/** Re-encode markup as a data URL Fabric can load. */
export const toSvgDataUrl = (svg: string) =>
  `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;

/**
 * Sanitise an SVG data URL end to end.
 *
 * Non-SVG URLs pass through untouched — a PNG data URL is just bytes and
 * carries no script.
 */
export function sanitizeSvgDataUrl(url: string): { url: string; report?: SanitizeReport } {
  if (!isSvgDataUrl(url)) return { url };
  const raw = decodeSvgDataUrl(url);
  if (raw === null) return { url: '', report: { svg: '', removedTags: [], removedAttrs: [], modified: true, error: 'Could not decode SVG' } };
  const report = sanitizeSvg(raw);
  if (report.error) return { url: '', report };
  return { url: toSvgDataUrl(report.svg), report };
}
