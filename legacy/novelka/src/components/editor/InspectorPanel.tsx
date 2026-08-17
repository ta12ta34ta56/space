import { useEffect, useState } from 'react';
import { engine, type FabricAny } from '../../engine/canvas-engine';
import { FontLibrary } from './FontLibrary';
import { useSelection } from '../../hooks/useSelection';
import { useCanvasStore } from '../../stores/canvas-store';
import { useLayers } from '../../hooks/useLayers';
import { Icon } from '../Icon';
import {
  applyTextEffect,
  applyToSelection,
  clearSelectionFill,
  clearSelectionStroke,
  detectTextEffect,
  setSelectionAnchor,
  setSelectionEffectColor,
  setSelectionFillColor,
  setSelectionFontFamily,
  setSelectionLetterSpacing,
  setSelectionLineHeight,
  setSelectionOutlineWidth,
  setSelectionStrokeColor,
  setSelectionStrokeWidth,
  setSelectionTextColor,
  type TextEffectId,
} from '../../services/selection-actions';
import type { Unit } from '../../types/canvas.types';
import { fromPx, round, toPx } from '../../utils/units';
import {
  resolveInstanceForObject,
  selectSemanticInstance,
  applyStyleToScope,
  resetScope,
  reflowPageInstances,
  type SemanticScope,
} from '../../domain';
import { useToastStore } from '../../stores/toast-store';

export type InspectorView =
  | { kind: 'font' }
  | { kind: 'color'; target: 'pageBackground' | 'textFill' | 'objectFill' | 'objectStroke' }
  | { kind: 'effects' }
  | { kind: 'advanced' }
  | { kind: 'position' }
  | { kind: 'semanticInstance' };

const SOLID_SWATCHES = [
  '#000000', '#4b4b4b', '#7b7b7b', '#adadad', '#d5d5d5', '#f5f5f5', '#ffffff',
  '#ff3131', '#ff5757', '#ea58b1', '#d39cef', '#bc6be3', '#8b4de8', '#6228dc',
  '#1494ad', '#21b0cf', '#59cad8', '#3aa3e9', '#4f68e3', '#1251b0', '#2a10b7',
  '#0cb95b', '#7cd850', '#b7fa61', '#ffdd63', '#ffc15c', '#ff9447', '#ff7724',
];

/** Flat effect options — shown as small visual previews only, no captions. */
const EFFECT_OPTIONS: Array<{ id: TextEffectId; preview: string; label: string }> = [
  { id: 'none', preview: 'clear', label: 'No effect' },
  { id: 'drop', preview: 'drop', label: 'Drop shadow' },
  { id: 'glow', preview: 'glow', label: 'Glow' },
  { id: 'echo', preview: 'echo', label: 'Echo' },
  { id: 'outline', preview: 'outline', label: 'Outline' },
  { id: 'hollow', preview: 'hollow', label: 'Hollow' },
  { id: 'splice', preview: 'splice', label: 'Split line' },
  { id: 'neon', preview: 'neon', label: 'Neon' },
  { id: 'glitch', preview: 'glitch', label: 'Glitch' },
];

export function InspectorPanel({
  view,
  onClose,
}: {
  view: InspectorView;
  onClose: () => void;
}) {
  const title =
    view.kind === 'font' ? 'Font styles'
    : view.kind === 'color' ? 'Color'
    : view.kind === 'effects' ? 'Effects'
    : view.kind === 'advanced' ? 'Advanced text'
    : view.kind === 'semanticInstance' ? 'Word Search Instance'
    : 'Position';

  return (
    <div className="panel inspector-panel">
      <div className="panel-head inspector-head">
        <span>{title}</span>
        <button className="btn icon ghost" onClick={onClose} aria-label="Close panel" title="Close panel">
          <Icon name="close" size={15} />
        </button>
      </div>

      {view.kind === 'font' && <FontInspector />}
      {view.kind === 'color' && <ColorInspector target={view.target} />}
      {view.kind === 'effects' && <EffectsInspector />}
      {view.kind === 'advanced' && <AdvancedTextInspector />}
      {view.kind === 'position' && <PositionInspector />}
      {view.kind === 'semanticInstance' && <SemanticInstanceInspector />}
    </div>
  );
}

function FontInspector() {
  const selection = useSelection();
  const currentFont = String(selection.primary?.fontFamily ?? 'Inter');
  return (
    <div className="panel-body inspector-body">
      <FontLibrary activeFamily={currentFont} onChoose={setSelectionFontFamily} badge="selection" />
    </div>
  );
}

function ColorInspector({
  target,
}: {
  target: 'pageBackground' | 'textFill' | 'objectFill' | 'objectStroke';
}) {
  const selection = useSelection();
  const { pages, activePageId, setPageBackground } = useCanvasStore();
  const page = pages.find((p) => p.id === activePageId) ?? pages[0];
  const primary = selection.primary as FabricAny | null;
  const isText = selection.isText;

  // The panel edits the ELEMENT's own colour. The two element surfaces are the
  // Fill and the Line (stroke); page background is a separate page-level mode.
  const [mode, setMode] = useState<'fill' | 'stroke' | 'page'>(
    target === 'objectStroke' ? 'stroke' : target === 'pageBackground' ? 'page' : 'fill',
  );
  useEffect(() => {
    setMode(target === 'objectStroke' ? 'stroke' : target === 'pageBackground' ? 'page' : 'fill');
  }, [target]);

  const fillColor =
    typeof primary?.fill === 'string' ? String(primary.fill) : '#111827';
  const strokeColor =
    typeof primary?.stroke === 'string' && primary.stroke !== 'transparent' && primary.stroke !== 'none'
      ? primary.stroke
      : typeof primary?.lastStrokeColor === 'string'
        ? primary.lastStrokeColor
        : '#111827';
  const pageBg = page.background ?? '#ffffff';
  const strokeWidth = Number(primary?.strokeWidth ?? 0);
  const current = mode === 'page' ? pageBg : mode === 'stroke' ? strokeColor : fillColor;

  const [query, setQuery] = useState(current);
  useEffect(() => {
    setQuery(current);
  }, [current, mode]);

  const designColors = (() => {
    const out = new Set<string>();
    const c = engine.canvas;
    if (mode === 'page' && page.background) out.add(page.background);
    c?.getObjects().forEach((obj) => {
      const any = obj as FabricAny;
      if (typeof any.fill === 'string') out.add(any.fill);
      if (typeof any.stroke === 'string' && any.stroke && any.stroke !== 'transparent' && any.stroke !== 'none') out.add(any.stroke);
      if (typeof any.lastStrokeColor === 'string') out.add(any.lastStrokeColor);
    });
    return [...out].slice(0, 12);
  })();

  // Element's own colour — wired to the real fill/stroke property, never an effect.
  const apply = (color: string) => {
    if (mode === 'page') {
      setPageBackground(color);
      return;
    }
    if (mode === 'stroke') {
      setSelectionStrokeColor(color);
      return;
    }
    // Element's own fill — text keeps its real colour (and the shared text-style
    // store in sync); shapes tint their fill.
    if (isText) setSelectionTextColor(color);
    else setSelectionFillColor(color);
  };

  const clear = () => {
    if (mode === 'page') {
      setPageBackground(null);
      return;
    }
    if (mode === 'stroke') {
      clearSelectionStroke();
      return;
    }
    clearSelectionFill();
  };

  const label =
    mode === 'page' ? 'Page background'
      : mode === 'stroke' ? 'Line colour'
        : isText ? 'Text colour'
          : 'Fill colour';

  // The effect's own colour (shadow-based drop/glow/neon/glitch) — kept separate
  // so the user always knows whether they are editing the element or its effect.
  const effect = isText ? detectTextEffect(primary) : null;

  return (
    <div className="panel-body inspector-body">
      <div className="section">
        <div className="section-title">Element colour</div>
        <div className="seg colour-mode">
          <button
            className={mode === 'fill' ? 'active' : ''}
            onClick={() => setMode('fill')}
            title="The element's fill / text colour"
          >
            {isText ? 'Text' : 'Fill'}
          </button>
          <button
            className={mode === 'stroke' ? 'active' : ''}
            onClick={() => setMode('stroke')}
            title="The element's line / stroke colour"
          >
            Line
          </button>
        </div>
      </div>

      {mode === 'page' ? (
        <>
          <div className="colour-current">
            <button
              className="colour-current-swatch"
              style={{ background: current }}
              onClick={() => apply(current)}
              title={`Apply ${current}`}
              aria-label={`Apply ${current}`}
            />
            <div className="colour-current-fields">
              <input
                className="colour-hex"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  const resolved = resolveCssColor(query);
                  if (resolved) apply(resolved);
                }}
                placeholder="# / name"
                aria-label="Type a colour or hex"
                spellCheck={false}
              />
              <div className="colour-current-row">
                <input
                  type="color"
                  value={normalizeColorForInput(current)}
                  onChange={(e) => apply(e.target.value)}
                  aria-label="Pick a colour"
                  style={{ width: 46, flex: 'none' }}
                />
                <button className="btn sm ghost" onClick={clear}>Transparent</button>
              </div>
            </div>
          </div>
          <p className="colour-target">{label}</p>
        </>
      ) : (
        <>
          <div className="colour-current">
            <button
              className="colour-current-swatch"
              style={{ background: current }}
              onClick={() => apply(current)}
              title={`Apply ${current}`}
              aria-label={`Apply ${current}`}
            />
            <div className="colour-current-fields">
              <input
                className="colour-hex"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  const resolved = resolveCssColor(query);
                  if (resolved) apply(resolved);
                }}
                placeholder="# / name"
                aria-label="Type a colour or hex"
                spellCheck={false}
              />
              <div className="colour-current-row">
                <input
                  type="color"
                  value={normalizeColorForInput(current)}
                  onChange={(e) => apply(e.target.value)}
                  aria-label="Pick a colour"
                  style={{ width: 46, flex: 'none' }}
                />
                <button className="btn sm ghost" onClick={clear}>Clear</button>
              </div>
            </div>
          </div>
          <p className="colour-target">{label}</p>

          <div className="section">
            <div className="section-title">Recently used in this design</div>
            <div className="swatches large">
              {designColors.length ? designColors.map((color) => (
                <button
                  key={color}
                  className={`swatch large ${sameColor(color, current) ? 'on' : ''}`}
                  style={{ background: color }}
                  title={color}
                  onClick={() => apply(color)}
                />
              )) : (
                <button className="swatch large empty" title="No design colours yet" />
              )}
            </div>
          </div>

          <div className="section">
            <div className="section-title">Palette</div>
            <div className="colour-palette">
              {SOLID_SWATCHES.map((color) => (
                <button
                  key={color}
                  className={`swatch xl ${sameColor(color, current) ? 'on' : ''}`}
                  style={{ background: color }}
                  title={color}
                  onClick={() => apply(color)}
                />
              ))}
            </div>
          </div>

          {mode === 'stroke' && (
            <div className="section">
              <div className="section-title">Line width</div>
              <span className="label">Stroke width — {strokeWidth.toFixed(1)}pt</span>
              <input
                type="range"
                min={0}
                max={24}
                step={0.5}
                value={strokeWidth}
                onChange={(e) => setSelectionStrokeWidth(Number(e.target.value))}
              />
              <NumField
                label="Width"
                value={strokeWidth}
                onChange={(v) => setSelectionStrokeWidth(v)}
                suffix="pt"
              />
            </div>
          )}
        </>
      )}

      {effect && (
        <div className="section effect-colour">
          <div className="section-title">Effect colour</div>
          <div className="row between" style={{ marginBottom: 8 }}>
            <span className="label" style={{ margin: 0 }}>{effect.label}</span>
            <input
              type="color"
              value={normalizeColorForInput(effect.color)}
              onChange={(e) => setSelectionEffectColor(e.target.value)}
              aria-label={`${effect.label} colour`}
              style={{ width: 50 }}
            />
          </div>
          <p className="hint" style={{ margin: 0 }}>
            The glow/shadow colour of the applied effect — separate from the text's
            own fill and line colour above.
          </p>
        </div>
      )}
    </div>
  );
}

function EffectsInspector() {
  const selection = useSelection();
  if (!selection.isText) {
    return <div className="empty">Select a text object to apply a treatment.</div>;
  }

  return (
    <div className="panel-body inspector-body">
      <p className="hint" style={{ marginBottom: 10 }}>
        A light touch for the selected lettering. Hover a sample to see its name.
      </p>
      <div className="efx-grid">
        {EFFECT_OPTIONS.map((effect) => (
          <button
            key={effect.id}
            className="efx-chip"
            onClick={() => applyTextEffect(effect.id)}
            title={effect.label}
            aria-label={effect.label}
          >
            <span className={`efx-sample efx-sample-${effect.preview}`}>Ag</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function AdvancedTextInspector() {
  const selection = useSelection();
  const primary = selection.primary;
  if (!selection.isText || !primary) {
    return <div className="empty">Select a text object to edit line spacing, letter spacing and anchor.</div>;
  }

  return (
    <div className="panel-body inspector-body">
      <div className="section">
        <div className="section-title">Spacing</div>
        <div style={{ marginBottom: 14 }}>
          <span className="label">Line spacing — {(primary.lineHeight ?? 1.16).toFixed(2)}</span>
          <input
            type="range"
            min={0.7}
            max={3}
            step={0.02}
            value={primary.lineHeight ?? 1.16}
            onChange={(e) => setSelectionLineHeight(Number(e.target.value))}
          />
        </div>
        <div>
          <span className="label">Letter spacing — {Math.round(primary.charSpacing ?? 0)}</span>
          <input
            type="range"
            min={-100}
            max={800}
            step={10}
            value={primary.charSpacing ?? 0}
            onChange={(e) => setSelectionLetterSpacing(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="section">
        <div className="section-title">Anchor</div>
        <div className="seg">
          <button
            className={primary.originX === 'left' ? 'active' : ''}
            onClick={() => setSelectionAnchor('left')}
          >
            Start
          </button>
          <button
            className={primary.originX === 'center' ? 'active' : ''}
            onClick={() => setSelectionAnchor('center')}
          >
            Middle
          </button>
          <button
            className={primary.originX === 'right' ? 'active' : ''}
            onClick={() => setSelectionAnchor('right')}
          >
            End
          </button>
        </div>
        <p className="hint" style={{ marginTop: 8 }}>
          Anchor controls which side the text box grows from when you resize or type more text.
        </p>
      </div>

      <div className="section">
        <div className="section-title">Outline</div>
        <span className="label">Text outline — {Number(primary.strokeWidth ?? 0).toFixed(1)}px</span>
        <input
          type="range"
          min={0}
          max={6}
          step={0.5}
          value={primary.strokeWidth ?? 0}
          onChange={(e) => setSelectionOutlineWidth(Number(e.target.value))}
        />
      </div>
    </div>
  );
}

function PositionInspector() {
  const selection = useSelection();
  const primary = selection.primary as FabricAny | null;
  const [tab, setTab] = useState<'arrange' | 'layers'>('arrange');
  const [unit, setUnit] = useState<Unit>('px');
  const [, force] = useState(0);
  const commit = useCanvasStore((s) => s.commit);
  const layers = useLayers();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  useEffect(() => {
    setTab('arrange');
  }, [selection.version]);

  const apply = (patch: Record<string, unknown>, label = 'Change property') => {
    applyToSelection(patch, label);
    force((n) => n + 1);
  };

  const setSize = (nextW?: number, nextH?: number) => {
    const c = engine.canvas;
    const o = primary;
    if (!c || !o) return;
    if (nextW && o.width) o.scaleX = nextW / o.width;
    if (nextH && o.height) o.scaleY = nextH / o.height;
    if (o.aspectRatioLocked) {
      if (nextW && o.width) o.scaleY = o.scaleX;
      if (nextH && o.height) o.scaleX = o.scaleY;
    }
    o.setCoords();
    c.requestRenderAll();
    force((n) => n + 1);
    commit('Resize');
  };

  const setLayerProp = (id: string, prop: 'locked' | 'visible', value: boolean) => {
    const c = engine.canvas;
    if (!c) return;
    const obj = c.getObjects().find((o) => (o as FabricAny).id === id) as FabricAny;
    if (!obj) return;
    if (prop === 'locked') {
      obj.locked = value;
      obj.selectable = !value;
      obj.evented = !value;
      if (value) c.discardActiveObject();
    } else {
      obj.visible = value;
    }
    c.requestRenderAll();
    commit(prop === 'locked' ? (value ? 'Lock layer' : 'Unlock layer') : 'Toggle visibility');
    force((n) => n + 1);
  };

  const onDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const target = layers.find((l) => l.id === targetId);
    if (!target) return;
    engine.moveTo(dragId, target.index);
    setDragId(null);
    setOverId(null);
  };

  const w = primary ? (primary.width ?? 0) * (primary.scaleX ?? 1) : 0;
  const h = primary ? (primary.height ?? 0) * (primary.scaleY ?? 1) : 0;

  // Shared properties across an ActiveSelection: when every selected object
  // has the same value we show it (and editing applies to all); when they
  // differ we show "Mixed" so the inspector never lies about the selection.
  const activeObjs = engine.getActive();
  const sharedValue = (prop: 'opacity'): number | null => {
    if (!activeObjs.length) return null;
    const first = Number((activeObjs[0] as FabricAny)[prop] ?? 1);
    const allSame = activeObjs.every(
      (o) => Math.abs(Number((o as FabricAny)[prop] ?? 1) - first) < 0.005,
    );
    return allSame ? first : null;
  };
  const sharedOpacity = sharedValue('opacity');
  const opacityPct = sharedOpacity === null ? null : Math.round(sharedOpacity * 100);

  return (
    <div className="panel-body inspector-body">
      <div className="inspector-tabs">
        <button className={`inspector-tab ${tab === 'arrange' ? 'active' : ''}`} onClick={() => setTab('arrange')}>
          Arrange
        </button>
        <button className={`inspector-tab ${tab === 'layers' ? 'active' : ''}`} onClick={() => setTab('layers')}>
          Layers
        </button>
      </div>

      {tab === 'arrange' ? (
        !primary ? (
          <div className="empty">Select an object to arrange it.</div>
        ) : (
          <>
            <div className="section">
              <div className="section-title">Arrange</div>
              <div className="grid-2">
                <button className="btn" onClick={() => engine.bringForward()}>
                  <Icon name="chevronUp" size={14} /> Forward
                </button>
                <button className="btn" onClick={() => engine.sendBackwards()}>
                  <Icon name="chevronDown" size={14} /> Backward
                </button>
                <button className="btn" onClick={() => engine.bringToFront()}>
                  <Icon name="front" size={14} /> To front
                </button>
                <button className="btn" onClick={() => engine.sendToBack()}>
                  <Icon name="back" size={14} /> To back
                </button>
              </div>
            </div>

            <div className="section">
              <div className="section-title">Align to page</div>
              <div className="grid-2">
                <button className="btn" onClick={() => engine.align('top')}><Icon name="alignTop" size={14} /> Top</button>
                <button className="btn" onClick={() => engine.align('left')}><Icon name="alignLeft" size={14} /> Left</button>
                <button className="btn" onClick={() => engine.align('middle')}><Icon name="alignMiddle" size={14} /> Middle</button>
                <button className="btn" onClick={() => engine.align('center')}><Icon name="alignCenterH" size={14} /> Center</button>
                <button className="btn" onClick={() => engine.align('bottom')}><Icon name="alignBottom" size={14} /> Bottom</button>
                <button className="btn" onClick={() => engine.align('right')}><Icon name="alignRight" size={14} /> Right</button>
              </div>
            </div>

            {selection.isMultiple && (
              <div className="section">
                <div className="section-title">Evenly</div>
                <div className="grid-2">
                  <button className="btn" onClick={() => engine.distribute('h')}>
                    <Icon name="distH" size={14} /> Space H
                  </button>
                  <button className="btn" onClick={() => engine.distribute('v')}>
                    <Icon name="distV" size={14} /> Space V
                  </button>
                  <button
                    className="btn"
                    onClick={() => {
                      engine.tidySelection();
                      force((n) => n + 1);
                    }}
                  >
                    <Icon name="fit" size={14} /> Tidy up
                  </button>
                </div>
                <p className="hint" style={{ marginTop: 8 }}>
                  Group / ungroup live in the quick-action box beside your selection.
                </p>
              </div>
            )}

            <div className="section">
              <div className="row between" style={{ marginBottom: 10 }}>
                <div className="section-title" style={{ margin: 0 }}>Advanced</div>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as Unit)}
                  style={{ width: 68, padding: '3px 5px', fontSize: 11 }}
                >
                  <option value="px">pt</option>
                  <option value="mm">mm</option>
                  <option value="in">in</option>
                </select>
              </div>
              <div className="grid-3 advanced-grid">
                <NumField label="Width" value={round(fromPx(w, unit), 1)} onChange={(v) => setSize(toPx(v, unit))} />
                <NumField label="Height" value={round(fromPx(h, unit), 1)} onChange={(v) => setSize(undefined, toPx(v, unit))} />
                <button
                  className={`btn lock-cell ${primary.aspectRatioLocked ? 'active' : ''}`}
                  onClick={() => {
                    primary.aspectRatioLocked = !primary.aspectRatioLocked;
                    force((n) => n + 1);
                  }}
                >
                  <Icon name={primary.aspectRatioLocked ? 'lock' : 'unlock'} size={15} />
                </button>
                <NumField label="X" value={round(fromPx(primary.left ?? 0, unit), 1)} onChange={(v) => apply({ left: toPx(v, unit) }, 'Move')} />
                <NumField label="Y" value={round(fromPx(primary.top ?? 0, unit), 1)} onChange={(v) => apply({ top: toPx(v, unit) }, 'Move')} />
                <NumField label="Rotate" value={round(primary.angle ?? 0, 1)} onChange={(v) => apply({ angle: v }, 'Rotate')} suffix="°" />
              </div>
              <div style={{ marginTop: 12 }}>
                <span className="label">
                  Opacity — {opacityPct === null ? 'Mixed' : `${opacityPct}%`}
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={opacityPct ?? 100}
                  onChange={(e) => apply({ opacity: Number(e.target.value) / 100 }, 'Opacity')}
                  aria-label="Opacity"
                />
              </div>
              {selection.isMultiple && (
                <p className="hint" style={{ marginTop: 8 }}>
                  {selection.count} objects selected — shared properties apply to all of
                  them. Group them in the quick-action box to treat them as one object.
                </p>
              )}
            </div>
          </>
        )
      ) : (
        <div className="stack" style={{ gap: 2 }}>
          {layers.length === 0 ? (
            <div className="empty">This page is empty.</div>
          ) : (
            layers.map((layer) => (
              <div
                key={layer.id}
                className={`layer-item ${layer.isActive ? 'active' : ''} ${overId === layer.id ? 'dragover' : ''}`}
                draggable
                onDragStart={() => setDragId(layer.id)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverId(layer.id);
                }}
                onDragLeave={() => setOverId(null)}
                onDrop={() => onDrop(layer.id)}
                onClick={() => !layer.locked && engine.selectById(layer.id)}
              >
                <button
                  className={`mini-btn ${layer.visible ? '' : 'on'}`}
                  title={layer.visible ? 'Hide' : 'Show'}
                  onClick={(e) => {
                    e.stopPropagation();
                    setLayerProp(layer.id, 'visible', !layer.visible);
                  }}
                >
                  <Icon name={layer.visible ? 'eye' : 'eyeoff'} size={13} />
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="layer-name">{layer.name}</div>
                  <div className="layer-type">{layer.type}</div>
                </div>
                <button
                  className={`mini-btn ${layer.locked ? 'on' : ''}`}
                  title={layer.locked ? 'Unlock' : 'Lock'}
                  onClick={(e) => {
                    e.stopPropagation();
                    setLayerProp(layer.id, 'locked', !layer.locked);
                  }}
                >
                  <Icon name={layer.locked ? 'lock' : 'unlock'} size={13} />
                </button>
              </div>
            ))
          )}
          <p className="hint" style={{ marginTop: 10 }}>
            Drag a layer to reorder it. Top of the list = front of the page.
          </p>
        </div>
      )}
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <label className="num-field">
      <span className="label">{label}</span>
      <div className="num-shell">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const n = parseFloat(draft);
            if (!Number.isNaN(n)) onChange(n);
            else setDraft(String(value));
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        {suffix && <span className="num-suffix">{suffix}</span>}
      </div>
    </label>
  );
}

function SemanticInstanceInspector() {
  const selection = useSelection();
  const activePage = useCanvasStore((s) => s.activePage());
  const pages = useCanvasStore((s) => s.pages);
  const commit = useCanvasStore((s) => s.commit);
  const setStatus = useToastStore((s) => s.setStatus);

  const [scope, setScope] = useState<SemanticScope>('this_instance');

  const instance = resolveInstanceForObject(selection.primary, activePage);

  if (!instance) {
    return (
      <div className="panel-body inspector-body">
        <p className="hint">Select an object belonging to a word search puzzle or solution to edit its semantic instance.</p>
      </div>
    );
  }

  const effectiveStyle = { ...instance.style, ...instance.overrides?.style };
  const isOverridden = !!instance.overrides?.isOverridden;
  const isSolution = instance.role === 'solution';
  const roleLabel = isSolution ? 'Answer Key Solution' : 'Word Search Puzzle';
  const title = instance.source.theme ? `${roleLabel}: ${instance.source.theme}` : `${roleLabel} ${instance.source.puzzleIndex || 1}`;

  const applyStyle = (patch: Partial<typeof instance.style>, label = 'Change instance style') => {
    const res = applyStyleToScope(pages, activePage.id, instance, patch, scope, engine.canvas);
    if (res.changedInstances > 0) {
      useCanvasStore.setState({ pages: res.pages });
      commit(label);
      setStatus('success', `Applied style to ${res.changedInstances} instance${res.changedInstances === 1 ? '' : 's'}`);
    }
  };

  const handleSelectWhole = () => {
    if (!engine.canvas) return;
    selectSemanticInstance(engine.canvas, instance);
    setStatus('idle', `Selected all elements of ${title}`);
  };

  const handleReflow = () => {
    const pageIndex = pages.findIndex((p) => p.id === activePage.id);
    const reflowed = reflowPageInstances(activePage, pageIndex + 1, pages.length, true, engine.canvas);
    const nextPages = pages.map((p) => (p.id === activePage.id ? reflowed.page : p));
    useCanvasStore.setState({ pages: nextPages });
    commit('Reflow puzzle');
    if (reflowed.layoutResult.ok) {
      setStatus('success', 'Layout reflowed successfully');
    } else {
      setStatus('error', 'Reflow produced layout constraint warnings');
    }
  };

  const handleReset = () => {
    const res = resetScope(pages, activePage.id, instance, scope, engine.canvas);
    if (res.resetCount > 0) {
      useCanvasStore.setState({ pages: res.pages });
      commit('Reset instance overrides');
      setStatus('success', `Reset ${res.resetCount} instance${res.resetCount === 1 ? '' : 's'} to default style`);
    }
  };

  return (
    <div className="panel-body inspector-body" style={{ gap: 14 }}>
      {/* Header Info */}
      <div style={{ background: 'var(--bg-3)', padding: 10, borderRadius: 6, border: '1px solid var(--line)' }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{title}</div>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
          <span className="hint" style={{ fontSize: 11 }}>ID: {instance.instanceId}</span>
          <span className="badge" style={{ background: isOverridden ? 'var(--warn-soft, #fef3c7)' : 'var(--bg-2)', color: isOverridden ? 'var(--warn, #d97706)' : 'var(--text-2)' }}>
            {isOverridden ? '⚡ Overridden' : '✓ Default'}
          </span>
        </div>
      </div>

      {/* Scope Selector */}
      <div>
        <span className="label" style={{ fontWeight: 600, marginBottom: 4 }}>Apply Changes To:</span>
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as SemanticScope)}
          style={{ width: '100%', marginTop: 2 }}
        >
          <option value="this_instance">This puzzle only</option>
          <option value="all_puzzles_on_page">All puzzles on this page</option>
          <option value="all_puzzles_in_book">All word-search puzzles in book</option>
          <option value="all_solutions_in_book">All solutions in book</option>
          <option value="matching_template">All instances using this design</option>
        </select>
      </div>

      {/* Style Controls */}
      <div className="stack" style={{ gap: 10 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="label">Letter Color</span>
          <input
            type="color"
            value={normalizeColorForInput(effectiveStyle.letterColor || '#111827')}
            onChange={(e) => applyStyle({ letterColor: e.target.value }, 'Letter color')}
          />
        </div>

        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="label">Grid Line Color</span>
          <input
            type="color"
            value={normalizeColorForInput(effectiveStyle.gridLineColor || '#c7ced8')}
            onChange={(e) => applyStyle({ gridLineColor: e.target.value }, 'Grid line color')}
          />
        </div>

        {!isSolution && (
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="label">Word List Color</span>
            <input
              type="color"
              value={normalizeColorForInput(effectiveStyle.bankColor || '#111827')}
              onChange={(e) => applyStyle({ bankColor: e.target.value }, 'Word list color')}
            />
          </div>
        )}

        <div>
          <span className="label">Frame Width: {effectiveStyle.frameWidth.toFixed(1)}pt</span>
          <input
            type="range"
            min={0}
            max={4}
            step={0.2}
            value={effectiveStyle.frameWidth}
            onChange={(e) => applyStyle({ frameWidth: Number(e.target.value) }, 'Frame width')}
          />
        </div>

        {!isSolution && (
          <div>
            <span className="label">Word List Font Size: {effectiveStyle.bankFontSize}pt</span>
            <input
              type="range"
              min={7}
              max={16}
              step={0.5}
              value={effectiveStyle.bankFontSize}
              onChange={(e) => applyStyle({ bankFontSize: Number(e.target.value) }, 'Bank font size')}
            />
          </div>
        )}
      </div>

      {/* Semantic Actions */}
      <div className="stack" style={{ gap: 8, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
        <button className="btn sm" onClick={handleSelectWhole} style={{ justifyContent: 'center' }}>
          <Icon name="shapes" size={14} /> Select Entire Instance
        </button>
        <button className="btn sm" onClick={handleReflow} style={{ justifyContent: 'center' }}>
          <Icon name="undo" size={14} /> Reflow Layout
        </button>
        {isOverridden && (
          <button className="btn sm danger" onClick={handleReset} style={{ justifyContent: 'center' }}>
            Reset Overrides ({scope.replace(/_/g, ' ')})
          </button>
        )}
      </div>
    </div>
  );
}

function resolveCssColor(value: string): string | null {
  if (typeof document === 'undefined') return null;
  const probe = new Option().style;
  probe.color = '';
  probe.color = value.trim();
  return probe.color || null;
}

function sameColor(a: string, b: string) {
  const ra = resolveCssColor(a);
  const rb = resolveCssColor(b);
  return !ra && !rb && ra === rb;
}

function normalizeColorForInput(value: string) {
  const resolved = resolveCssColor(value);
  if (!resolved) return '#111827';
  if (resolved.startsWith('#')) {
    return resolved.length === 4
      ? `#${resolved[1]}${resolved[1]}${resolved[2]}${resolved[2]}${resolved[3]}${resolved[3]}`
      : resolved;
  }
  const m = resolved.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!m) return '#111827';
  const [r, g, b] = m.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0'));
  return `#${r}${g}${b}`;
}

