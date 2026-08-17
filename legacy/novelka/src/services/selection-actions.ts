import * as fabric from 'fabric';
import { engine, applyTint, type FabricAny } from '../engine/canvas-engine';
import { useCanvasStore } from '../stores/canvas-store';
import { useTextStyleStore } from '../stores/text-style-store';
import { loadFont, loadFontVariant } from '../engine/font-manager';

export type TextEffectId =
  | 'none'
  | 'drop'
  | 'glow'
  | 'echo'
  | 'outline'
  | 'splice'
  | 'hollow'
  | 'neon'
  | 'glitch';

const isTextObject = (o: FabricAny | null | undefined) =>
  !!o && (o.type === 'textbox' || o.type === 'i-text' || o.type === 'text');

const activeObjects = () => engine.canvas?.getActiveObjects() ?? [];

function commit(label: string) {
  useCanvasStore.getState().commit(label);
}

function repaint() {
  engine.canvas?.requestRenderAll();
}

export function applyToSelection(
  patch: Record<string, unknown>,
  label = 'Change property',
  predicate?: (obj: FabricAny) => boolean,
) {
  const c = engine.canvas;
  if (!c) return;
  c.getActiveObjects().forEach((obj) => {
    const any = obj as FabricAny;
    if (predicate && !predicate(any)) return;
    obj.set(patch as never);
    obj.setCoords();
    obj.dirty = true;
  });
  repaint();
  commit(label);
  engine.notifySelection();
}

export function currentPrimary(): FabricAny | null {
  return (activeObjects()[0] as FabricAny) ?? null;
}

export async function setSelectionFontFamily(family: string) {
  await loadFont(family);
  useTextStyleStore.getState().setFontFamily(family);
  applyToSelection({ fontFamily: family }, 'Font', isTextObject);
}

export function setSelectionFontSize(size: number) {
  const next = Math.max(6, Math.min(400, Math.round(size)));
  useTextStyleStore.getState().setFontSize(next);
  applyToSelection({ fontSize: next }, 'Font size', isTextObject);
}

export function nudgeSelectionFontSize(delta: number) {
  const primary = currentPrimary();
  const base = Number(primary?.fontSize ?? useTextStyleStore.getState().fontSize ?? 24);
  setSelectionFontSize(base + delta);
}

export function setSelectionTextColor(color: string) {
  useTextStyleStore.getState().setFill(color);
  // Base colour: always render the element's own fill. If an effect (e.g.
  // outline/hollow) had set `paintFirst: 'stroke'` with a transparent fill,
  // editing the text colour would otherwise do nothing visible — the fill must
  // take over so the picker changes the element's real colour, not an effect.
  applyToSelection({ fill: color, paintFirst: 'fill' }, 'Text color', isTextObject);
  engine.notifySelection();
}

export function setSelectionFillColor(color: string) {
  const c = engine.canvas;
  if (!c) return;
  const objs = c.getActiveObjects();
  objs.forEach((o) => {
    const any = o as FabricAny;
    // Recolorable SVG assets (stickers, icons, borders, corners, dividers,
    // flourishes) carry a group of paths — tint every child path via currentColor.
    if (any.recolorable) {
      applyTint(o, color);
    } else {
      o.set({ fill: color });
      // Text keeps rendering its own fill as the base colour (see above).
      if (isTextObject(o)) o.set('paintFirst', 'fill');
    }
    o.dirty = true;
  });
  c.requestRenderAll();
  commit('Color');
  engine.notifySelection();
}

const DEFAULT_STROKE_COLOR = '#111827';
const DEFAULT_STROKE_WIDTH = 1.5;

function usableStrokeColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v || v === 'none' || v === 'transparent') return null;
  return v;
}

export function setSelectionStrokeColor(color: string) {
  const c = engine.canvas;
  if (!c) return;
  c.getActiveObjects().forEach((obj) => {
    const any = obj as FabricAny;
    const nextWidth = Number(any.strokeWidth ?? 0) > 0
      ? Number(any.strokeWidth)
      : Number(any.lastStrokeWidth ?? DEFAULT_STROKE_WIDTH);
    any.lastStrokeColor = color;
    any.lastStrokeWidth = nextWidth;
    obj.set({ stroke: color, strokeWidth: nextWidth });
    obj.setCoords();
    obj.dirty = true;
  });
  repaint();
  commit('Stroke color');
  engine.notifySelection();
}

export function setSelectionStrokeWidth(width: number) {
  const c = engine.canvas;
  if (!c) return;
  const nextWidth = Math.max(0, Number.isFinite(width) ? width : 0);
  c.getActiveObjects().forEach((obj) => {
    const any = obj as FabricAny;
    const currentColor = usableStrokeColor(any.stroke) ?? usableStrokeColor(any.lastStrokeColor) ?? DEFAULT_STROKE_COLOR;
    if (nextWidth > 0) {
      any.lastStrokeColor = currentColor;
      any.lastStrokeWidth = nextWidth;
      obj.set({ stroke: currentColor, strokeWidth: nextWidth });
    } else {
      const currentWidth = Number(any.strokeWidth ?? 0);
      if (currentWidth > 0) any.lastStrokeWidth = currentWidth;
      any.lastStrokeColor = currentColor;
      obj.set({ stroke: 'transparent', strokeWidth: 0 });
    }
    obj.setCoords();
    obj.dirty = true;
  });
  repaint();
  commit('Stroke width');
  engine.notifySelection();
}

export function clearSelectionFill() {
  applyToSelection({ fill: null }, 'Clear fill');
}

export function clearSelectionStroke() {
  setSelectionStrokeWidth(0);
}

export function toggleSelectionLock() {
  const c = engine.canvas;
  if (!c) return;
  const objs = c.getActiveObjects();
  if (!objs.length) return;
  const nextLocked = !objs.every((o) => !!(o as FabricAny).locked);
  objs.forEach((obj) => {
    const any = obj as FabricAny;
    any.locked = nextLocked;
    obj.selectable = !nextLocked;
    obj.evented = !nextLocked;
  });
  if (nextLocked) c.discardActiveObject();
  repaint();
  commit(nextLocked ? 'Lock selection' : 'Unlock selection');
}

export function setSelectionTextAlign(align: 'left' | 'center' | 'right' | 'justify') {
  applyToSelection({ textAlign: align }, 'Text align', isTextObject);
}

export async function toggleSelectionTextProp(
  prop: 'fontWeight' | 'fontStyle' | 'underline' | 'linethrough',
) {
  const primary = currentPrimary();
  if (!isTextObject(primary)) return;

  // Real font faces only: bold uses the 700 file, italic the italic file, and
  // the browser never synthesizes (font-synthesis: none). Force a re-layout so
  // the change is actually visible on the canvas.
  const reflow = (o: FabricAny) => {
    o.setCoords();
    o.dirty = true;
    o.initDimensions?.();
    o.setCoords();
  };

  if (prop === 'fontWeight') {
    const next = primary.fontWeight === 'bold' || Number(primary.fontWeight) >= 600 ? 'normal' : 'bold';
    await loadFontVariant(primary.fontFamily, next, primary.fontStyle);
    applyToSelection({ fontWeight: next }, 'Bold', isTextObject);
    repaint();
    engine.canvas?.getActiveObjects().forEach((o) => reflow(o as FabricAny));
    engine.notifySelection();
    return;
  }
  if (prop === 'fontStyle') {
    const next = primary.fontStyle === 'italic' ? 'normal' : 'italic';
    await loadFontVariant(primary.fontFamily, primary.fontWeight, next);
    applyToSelection({ fontStyle: next }, 'Italic', isTextObject);
    repaint();
    engine.canvas?.getActiveObjects().forEach((o) => reflow(o as FabricAny));
    engine.notifySelection();
    return;
  }
  if (prop === 'underline') {
    applyToSelection({ underline: !primary.underline }, 'Underline', isTextObject);
    return;
  }
  applyToSelection({ linethrough: !primary.linethrough }, 'Strikethrough', isTextObject);
}

export function toggleSelectionUppercase() {
  const c = engine.canvas;
  if (!c) return;
  const texts = c.getActiveObjects().filter((o) => isTextObject(o as FabricAny)) as FabricAny[];
  if (!texts.length) return;
  const shouldUpper = texts.some((o) => String(o.text ?? '') !== String(o.text ?? '').toUpperCase());
  texts.forEach((o) => {
    o.set('text', shouldUpper ? String(o.text ?? '').toUpperCase() : String(o.text ?? '').toLowerCase());
    o.dirty = true;
    o.setCoords();
  });
  repaint();
  commit(shouldUpper ? 'Uppercase text' : 'Lowercase text');
}

export type TextListMode = 'none' | 'bullets' | 'numbers';

function detectListMode(text: string): TextListMode {
  const lines = text.split(/\n/).filter((line) => line.trim().length > 0);
  if (!lines.length) return 'none';
  if (lines.every((line) => /^•\s/.test(line))) return 'bullets';
  if (lines.every((line) => /^\d+\.\s/.test(line))) return 'numbers';
  return 'none';
}

export function currentTextListMode(): TextListMode {
  const primary = currentPrimary();
  return isTextObject(primary) ? detectListMode(String(primary.text ?? '')) : 'none';
}

function stripListPrefix(line: string) {
  return line.replace(/^•\s/, '').replace(/^\d+\.\s/, '');
}

export function cycleSelectionListMode() {
  const c = engine.canvas;
  if (!c) return;
  const texts = c.getActiveObjects().filter((o) => isTextObject(o as FabricAny)) as FabricAny[];
  if (!texts.length) return;
  const current = currentTextListMode();
  const next: TextListMode = current === 'none' ? 'bullets' : current === 'bullets' ? 'numbers' : 'none';
  texts.forEach((o) => {
    const lines = String(o.text ?? '').split(/\n/);
    const rebuilt = lines.map((line, index) => {
      const base = stripListPrefix(line);
      if (!base.trim()) return line;
      if (next === 'bullets') return `• ${base}`;
      if (next === 'numbers') return `${index + 1}. ${base}`;
      return base;
    });
    o.set('text', rebuilt.join('\n'));
    o.dirty = true;
    o.setCoords();
  });
  repaint();
  commit(next === 'none' ? 'Remove list' : next === 'bullets' ? 'Bullet list' : 'Numbered list');
}

export function setSelectionAnchor(origin: 'left' | 'center' | 'right') {
  const c = engine.canvas;
  if (!c) return;
  const primary = currentPrimary();
  if (!isTextObject(primary)) return;
  c.getActiveObjects().forEach((obj) => {
    const any = obj as FabricAny;
    if (!isTextObject(any)) return;
    const center = obj.getCenterPoint();
    obj.set({ originX: origin });
    if (typeof (obj as fabric.FabricObject).setPositionByOrigin === 'function') {
      (obj as fabric.FabricObject).setPositionByOrigin(center, 'center', 'center');
    }
    obj.setCoords();
    obj.dirty = true;
  });
  repaint();
  commit('Text anchor');
}

export function setSelectionLineHeight(value: number) {
  applyToSelection({ lineHeight: value }, 'Line height', isTextObject);
}

export function setSelectionLetterSpacing(value: number) {
  applyToSelection({ charSpacing: value }, 'Letter spacing', isTextObject);
}

export function setSelectionOutlineWidth(value: number) {
  const primary = currentPrimary();
  const stroke = typeof primary?.stroke === 'string' ? primary.stroke : '#000000';
  applyToSelection(
    { strokeWidth: value, stroke, paintFirst: 'stroke' },
    'Text outline',
    isTextObject,
  );
}

/** 
 * "Curvy" is intentionally NOT offered as an effect. It would have to replace
 * the text with a group of per-character objects, which locks the text and
 * makes it un-editable — violating the rule that effects are non-destructive
 * and text stays text.
 */

export function applyTextEffect(effect: TextEffectId) {
  const primary = currentPrimary();
  if (!isTextObject(primary)) return;
  const fill = typeof primary.fill === 'string' ? primary.fill : '#7c3aed';
  const shared: Record<string, unknown> = {
    shadow: null,
    stroke: null,
    strokeWidth: 0,
    fill,
    textBackgroundColor: '',
    paintFirst: 'fill',
  };

  switch (effect) {
    case 'none':
      applyToSelection(shared, 'Clear text effect', isTextObject);
      return;
    case 'drop':
      applyToSelection(
        {
          ...shared,
          shadow: new fabric.Shadow({ color: 'rgba(124,58,237,0.38)', blur: 10, offsetX: 5, offsetY: 6 }),
        },
        'Drop effect',
        isTextObject,
      );
      return;
    case 'glow':
      applyToSelection(
        {
          ...shared,
          shadow: new fabric.Shadow({ color: 'rgba(168,85,247,0.45)', blur: 18, offsetX: 0, offsetY: 0 }),
        },
        'Glow effect',
        isTextObject,
      );
      return;
    case 'echo':
      applyToSelection(
        {
          ...shared,
          stroke: fill,
          strokeWidth: 1,
          shadow: new fabric.Shadow({ color: 'rgba(124,58,237,0.25)', blur: 0, offsetX: 6, offsetY: 6 }),
        },
        'Echo effect',
        isTextObject,
      );
      return;
    case 'outline':
      applyToSelection(
        {
          ...shared,
          stroke: fill,
          strokeWidth: 1.6,
          fill: 'rgba(255,255,255,0)',
          paintFirst: 'stroke',
        },
        'Outline effect',
        isTextObject,
      );
      return;
    case 'splice':
      applyToSelection(
        {
          ...shared,
          fill: '#ffffff',
          stroke: fill,
          strokeWidth: 1.8,
          textBackgroundColor: 'rgba(196,168,255,0.28)',
          paintFirst: 'stroke',
        },
        'Splice effect',
        isTextObject,
      );
      return;
    case 'hollow':
      applyToSelection(
        {
          ...shared,
          fill: 'rgba(255,255,255,0)',
          stroke: fill,
          strokeWidth: 1.4,
          paintFirst: 'stroke',
        },
        'Hollow effect',
        isTextObject,
      );
      return;
    case 'neon':
      applyToSelection(
        {
          ...shared,
          fill: '#f5ebff',
          stroke: '#d946ef',
          strokeWidth: 0.8,
          shadow: new fabric.Shadow({ color: 'rgba(217,70,239,0.48)', blur: 22, offsetX: 0, offsetY: 0 }),
        },
        'Neon effect',
        isTextObject,
      );
      return;
    case 'glitch':
      applyToSelection(
        {
          ...shared,
          fill: '#7c3aed',
          shadow: new fabric.Shadow({ color: 'rgba(236,72,153,0.55)', blur: 0, offsetX: 4, offsetY: 1 }),
          stroke: '#22d3ee',
          strokeWidth: 0.4,
        },
        'Glitch effect',
        isTextObject,
      );
      return;
  }
}

/** A detected non-destructive text effect whose colour the user can edit. */
export type DetectedEffect =
  | { kind: 'shadow'; color: string; label: string }
  | null;

const EFFECT_LABEL_BY_SHADOW: Array<[string, string]> = [
  ['124,58,237', 'Drop shadow'],
  ['168,85,247', 'Glow'],
  ['217,70,239', 'Neon'],
  ['236,72,153', 'Glitch'],
];

/**
 * Identify the *effect* colour on a text object, so the colour panel can show a
 * base-vs-effect distinction. Shadow-based effects (drop/glow/neon/glitch) are
 * the unambiguous case: their colour lives on `shadow`, entirely separate from
 * the element's own fill/stroke.
 */
export function detectTextEffect(o: FabricAny | null | undefined): DetectedEffect {
  if (!isTextObject(o)) return null;
  const sh = o.shadow;
  if (!sh || typeof sh.color !== 'string') return null;
  const c = sh.color as string;
  const base = c.replace(/\s/g, '');
  const match = EFFECT_LABEL_BY_SHADOW.find(([rgb]) => base.includes(rgb));
  const label = match?.[1] ?? 'Shadow';
  return { kind: 'shadow', color: c, label };
}

/** Recolour the active shadow effect, preserving its original opacity. */
export function setSelectionEffectColor(color: string) {
  const c = engine.canvas;
  if (!c) return;
  const alphaMatch = (shadowColor: string) => {
    const m = String(shadowColor).match(/rgba?\([^)]*,\s*([\d.]+)\s*\)/);
    return m ? Number(m[1]) : 1;
  };
  c.getActiveObjects().forEach((obj) => {
    const any = obj as FabricAny;
    if (!isTextObject(any) || !any.shadow) return;
    const alpha = alphaMatch(any.shadow.color);
    any.shadow.color = alpha < 1
      ? `rgba(${hexToRgb(color).join(',')},${alpha})`
      : color;
    any.dirty = true;
    any.setCoords();
  });
  repaint();
  commit('Effect colour');
  engine.notifySelection();
}

function hexToRgb(hex: string): [number, number, number] {
  const canResolve = typeof document !== 'undefined' && typeof Option !== 'undefined';
  const resolved = canResolve
    ? (() => {
        const probe = new Option().style;
        probe.color = '';
        probe.color = hex.trim();
        return probe.color || hex;
      })()
    : hex;
  const m = resolved.match(/#?([\da-f]{2})([\da-f]{2})([\da-f]{2})/i);
  if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
  const rgba = resolved.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (rgba) return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])];
  return [124, 58, 237];
}
