import * as fabric from 'fabric';
import { sanitizeSvgDataUrl } from '../utils/svg-sanitize';
import { kdpMarginsFor, safeAreaFor } from '../services/kdp';
import { nanoid } from 'nanoid';
import { groupPuzzleUnits } from '../modules/shared/puzzle-groups';

/**
 * Thin wrapper around Fabric.js. The rest of the app never imports fabric
 * directly except for typing — swap this file to change engines.
 */

export type EngineEvent =
  | 'selection'
  | 'modified'
  | 'added'
  | 'removed'
  | 'zoom'
  | 'history';

type Listener = () => void;

// Extra props we persist on every fabric object.
// Custom object properties that must survive serialization. Anything missing
// here is silently dropped every time a page is saved or reloaded — which is
// how module tags (sudokuRole/sudokuPuzzle) used to vanish after one edit.
const EXTRA_PROPS = [
  'id',
  'elementType',
  'name',
  'locked',
  'aspectRatioLocked',
  'assetSrc',
  'recolorable',
  'tintColor',
  'lastStrokeColor',
  'lastStrokeWidth',
  'novelkaGhost',
  // semantic instance tags
  'instanceId',
  'instanceRole',
  'contentId',
  'role',
  // tool-module tags
  'moduleId',
  'sudokuRole',
  'sudokuPuzzle',
  'wsRole',
  'wsPuzzle',
  'cwRole',
  'cwPuzzle',
  'hwRole',
  'hwPuzzle',
  // maze
  'mzRole',
  'mzPuzzle',
];

export interface AddOptions {
  left?: number;
  top?: number;
  centered?: boolean;
}

export class CanvasEngine {
  canvas: fabric.Canvas | null = null;
  private listeners = new Map<EngineEvent, Set<Listener>>();
  private suspended = false;

  // ---------------------------------------------------------------- lifecycle
  mount(el: HTMLCanvasElement, width: number, height: number) {
    this.pageWidth = width;
    this.pageHeight = height;
    this.canvas = new fabric.Canvas(el, {
      width,
      height,
      backgroundColor: '#ffffff',
      preserveObjectStacking: true,
      selection: true,
      controlsAboveOverlay: true,
      stopContextMenu: true,
      fireRightClick: true,
    });
    // Loose multi-selection contract (Phase 8C/8D):
    //  - `selectionKey`      — Shift+drag draws a marquee selection box.
    //  - `multiSelectionKey` — Shift+click TOGGLES an object in/out of the
    //    current selection. Fabric creates an `ActiveSelection` (a *loose*
    //    selection: members move together when dragged, but stay individual
    //    objects) and only an explicit Group action turns it into a real
    //    `fabric.Group`. Both are `'shiftKey'` by default in Fabric 6, but we
    //    pin them here so the behaviour can never silently regress.
    (this.canvas as FabricAny).selectionKey = 'shiftKey';
    (this.canvas as FabricAny).multiSelectionKey = 'shiftKey';
    this.canvas.selection = true;

    fabric.FabricObject.prototype.set({
      borderColor: '#6366f1',
      cornerColor: '#ffffff',
      cornerStrokeColor: '#6366f1',
      cornerStyle: 'circle',
      cornerSize: 9,
      transparentCorners: false,
      borderScaleFactor: 1.5,
      padding: 0,
    });
    // Clear rotation handle: offset further above the object and a larger,
    // distinctly-coloured grip. Fabric stores controls on each object instance
    // (from its defaults), so we style the mtr control on newly created objects.
    fabric.FabricObject.prototype.set({
      rotatingPointOffset: 50,
      hasRotatingPoint: true,
    });
    fabric.FabricObject.prototype.objectCaching = false;
    // Why: fabric's object caches are capped by perfLimitSizeTotal (2 MB) and
    // maxCacheSideLimit, so large objects — a full-page image, a page-wide
    // ruled line, a big text block — get rasterised into a clamped low-res
    // cache and then stretched, which is exactly the "blurry canvas" look.
    // With caching off, every object draws directly at the canvas's current
    // supersampled resolution, so the page stays crisp at every zoom.
    // Objects that REQUIRE a cache (image filters, clip paths) still get one
    // via needsItsOwnCache().

    const c = this.canvas;
    c.on('selection:created', () => this.emit('selection'));
    c.on('selection:updated', () => this.emit('selection'));
    c.on('selection:cleared', () => this.emit('selection'));
    // Visual contract for the loose selection: an `ActiveSelection` gets a
    // dashed border so it reads as "multi-selected but not grouped"; a real
    // Group (or a single object) keeps a solid border. This is the only
    // styling we touch — membership and movement stay 100% Fabric-managed.
    const styleSelectionBorder = () => {
      const active = c.getActiveObject() as FabricAny | null;
      if (active?.type === 'activeselection') {
        if (!active.borderDashArray || active.borderDashArray[0] !== 6) {
          active.borderDashArray = [6, 4];
          active.borderColor = '#6366f1';
          c.requestRenderAll();
        }
      } else if (active && active.borderDashArray?.length) {
        active.borderDashArray = [];
        c.requestRenderAll();
      }
    };
    c.on('selection:created', styleSelectionBorder);
    c.on('selection:updated', styleSelectionBorder);
    c.on('selection:cleared', styleSelectionBorder);
    c.on('object:modified', () => {
      this.emit('modified');
      this.emit('history');
    });
    c.on('object:added', (e) => {
      const o = e.target as FabricAny;
      if (o && !o.id) o.id = nanoid(8);
      this.emit('added');
    });
    c.on('object:removed', () => this.emit('removed'));
    c.on('text:changed', () => this.emit('modified'));

    // Rotation snapping: while rotating, snap to 15° steps when Shift is held,
    // and hard-snap to 0/90/180/270 when within the threshold (so it's easy to
    // land perfectly straight).
    c.on('object:rotating', (e: { target?: fabric.FabricObject }) => {
      const o = e.target as FabricAny;
      if (!o) return;
      const raw = o.angle ?? 0;
      let next = raw;
      if (c.getActiveObject() !== o) return;
      if (typeof window !== 'undefined' && (window as unknown as { __rotateShift?: boolean }).__rotateShift) {
        // hard 15° snapping
        next = Math.round(raw / 15) * 15;
      } else {
        const SNAP_ANGLES = [0, 90, 180, 270, 360];
        const norm = ((raw % 360) + 360) % 360;
        for (const s of SNAP_ANGLES) {
          if (Math.abs(norm - s) <= 4) {
            next = s % 360;
            break;
          }
        }
      }
      if (next !== raw) {
        o.angle = next;
        o.setCoords();
        o.dirty = true;
      }
    });

    this.installSmartGuides();
    this.applyViewport();
    this.watchDpr();
    // Track Shift for hard 15° rotation snapping (kept on window so the
    // object:rotating handler can read it synchronously).
    if (typeof window !== 'undefined') {
      const onKey = (down: boolean) => (e: KeyboardEvent) => {
        if (e.key === 'Shift') (window as unknown as { __rotateShift: boolean }).__rotateShift = down;
      };
      window.addEventListener('keydown', onKey(true));
      window.addEventListener('keyup', onKey(false));
    }
    return c;
  }

  dispose() {
    this.unwatchDpr();
    this.canvas?.dispose();
    this.canvas = null;
  }

  on(event: EngineEvent, fn: Listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
    return () => this.listeners.get(event)!.delete(fn);
  }

  private emit(event: EngineEvent) {
    if (this.suspended && event === 'history') return;
    this.listeners.get(event)?.forEach((fn) => fn());
  }

  /** Run a mutation without pushing history (used by undo/redo + page load). */
  async silent<T>(fn: () => Promise<T> | T): Promise<T> {
    this.suspended = true;
    try {
      return await fn();
    } finally {
      this.suspended = false;
    }
  }


  requireCanvas(): fabric.Canvas {
    if (!this.canvas) throw new Error('Canvas is not mounted yet');
    return this.canvas;
  }

  // ------------------------------------------------------------------ pages
  pageWidth = 595;
  pageHeight = 842;
  private kdpBoundaryLock = true;
  private kdpPageNumber = 1;
  private kdpPageCount = 24;

  setKdpBoundaryLock(enabled: boolean, pageNumber = this.kdpPageNumber, pageCount = this.kdpPageCount) {
    this.kdpBoundaryLock = enabled;
    this.kdpPageNumber = Math.max(1, pageNumber);
    this.kdpPageCount = Math.max(1, pageCount);
  }

  private kdpSafeBounds() {
    const m = kdpMarginsFor(Math.max(this.kdpPageCount, 24));
    return safeAreaFor(this.pageWidth, this.pageHeight, this.kdpPageNumber, m);
  }

  /**
   * KDP safe-area hard stop. `getBoundingRect()` returns the object's
   * axis-aligned bounding box in PAGE units (rotation-safe), which is exactly
   * what the safe rect is measured in — the editor's viewport zoom/pan must
   * NOT be mixed in, so we deliberately do not use an absolute/screen-space
   * rect here. Any edge crossing a margin line (gutter/outer/top/bottom) is
   * pulled back immediately: the cursor can keep moving, the object stops dead
   * at the red line.
   */
  private clampObjectToKdpSafe(target: fabric.FabricObject) {
    if (!this.kdpBoundaryLock) return;
    const safe = this.kdpSafeBounds();
    const bb = target.getBoundingRect();
    let dx = 0;
    let dy = 0;
    if (bb.width <= safe.width) {
      if (bb.left < safe.left) dx = safe.left - bb.left;
      else if (bb.left + bb.width > safe.left + safe.width) dx = safe.left + safe.width - (bb.left + bb.width);
    } else {
      // Wider than the safe area: centre it so neither edge sticks out further
      // than the other (pin-to-corner looked like a bug).
      dx = safe.left + safe.width / 2 - (bb.left + bb.width / 2);
    }
    if (bb.height <= safe.height) {
      if (bb.top < safe.top) dy = safe.top - bb.top;
      else if (bb.top + bb.height > safe.top + safe.height) dy = safe.top + safe.height - (bb.top + bb.height);
    } else {
      dy = safe.top + safe.height / 2 - (bb.top + bb.height / 2);
    }
    if (dx || dy) {
      target.set({ left: (target.left ?? 0) + dx, top: (target.top ?? 0) + dy });
      target.setCoords();
    }
  }

  private shrinkObjectToKdpSafe(target: fabric.FabricObject) {
    if (!this.kdpBoundaryLock) return;
    const safe = this.kdpSafeBounds();
    const bb = target.getBoundingRect();
    const ratio = Math.min(
      safe.width > 0 ? safe.width / Math.max(bb.width, 1) : 1,
      safe.height > 0 ? safe.height / Math.max(bb.height, 1) : 1,
      1,
    );
    if (ratio < 1) {
      target.set({
        scaleX: (target.scaleX ?? 1) * ratio,
        scaleY: (target.scaleY ?? 1) * ratio,
      });
      target.setCoords();
    }
    this.clampObjectToKdpSafe(target);
  }

  /**
   * Reconcile the canvas backing store with the on-screen size so the page is
   * always rendered at full physical resolution — the single fix for "blurry
   * canvas" on every screen and at every zoom:
   *
   *  1. CSS size is an integer, so the element and its backing store never
   *     disagree by a fraction of a pixel.
   *  2. The backing store is CSS size × devicePixelRatio (retina) — fabric
   *     does this automatically when `getRetinaScaling()` is truthful, which
   *     we enforce with the instance override below.
   *  3. An extra 2× supersample rasterises text and shapes at double the
   *     needed resolution and lets the browser downscale — this is what makes
   *     canvas text crisp at fractional zoom levels (50%, 73%…) where glyphs
   *     would otherwise be rasterised soft.
   *  4. The viewport transform (zoom) is applied as a vector transform, never
   *     by CSS-scaling the element.
   *
   * The supersample factor is capped so very large pages cannot exhaust GPU
   * memory: the long side of the backing store stays at or under 4096 px.
   */
  private applyViewport() {
    const c = this.requireCanvas();
    const cssW = Math.max(1, Math.round(this.pageWidth * this.zoom));
    const cssH = Math.max(1, Math.round(this.pageHeight * this.zoom));
    const dpr = Math.max(
      1,
      (typeof window !== 'undefined' && window.devicePixelRatio) || 1,
    );
    let ss = 2;
    const longSide = Math.max(cssW, cssH) * dpr * ss;
    if (longSide > 4096) ss = Math.max(1, 4096 / (Math.max(cssW, cssH) * dpr));
    const pixelScale = dpr * ss;

    c.enableRetinaScaling = true;
    // Instance-level override: this canvas renders at dpr×ss, everything else
    // (exports, previews, thumbnails) keeps its own explicit multiplier.
    c.getRetinaScaling = () => pixelScale;

    c.setDimensions({ width: cssW, height: cssH });
    c.setZoom(this.zoom);
    c.requestRenderAll();
  }

  setPageSize(width: number, height: number) {
    this.pageWidth = width;
    this.pageHeight = height;
    this.applyViewport();
  }

  setBackground(color: string | null) {
    const c = this.requireCanvas();
    c.backgroundColor = color ?? 'transparent';
    c.requestRenderAll();
  }

  /**
   * Serialize the canvas for storage.
   *
   * `includeDefaultValues: false` omits every property that equals its
   * default — fabric re-applies defaults on load, so round-trips are exact
   * while the saved JSON shrinks dramatically. A 5.7 MB crossword book saves
   * as ~2 MB, autosave writes less, and the 200-step undo history holds far
   * more in memory. Old books saved with full defaults still load fine.
   */
  toJSON() {
    const c = this.requireCanvas();
    const prev = c.includeDefaultValues;
    c.includeDefaultValues = false;
    try {
      const json = c.toObject(EXTRA_PROPS) as { objects?: Record<string, unknown>[] };
      if (Array.isArray(json.objects)) {
        json.objects = json.objects.filter((o) => o.novelkaGhost !== true);
      }
      return json;
    } finally {
      c.includeDefaultValues = prev;
    }
  }

  async loadJSON(json: unknown) {
    const c = this.requireCanvas();
    await this.silent(async () => {
      if (!json) {
        c.clear();
        c.backgroundColor = '#ffffff';
      } else {
        await c.loadFromJSON(json);
      }
      // Generated puzzles are real groups: wrap each puzzle's tagged objects
      // into one fabric.Group so it moves/scales as a single unit.
      groupPuzzleUnits(c);
      // loadFromJSON can resize the canvas (a restored project may carry a
      // different page size); always reconcile the viewport afterwards.
      this.applyViewport();
    });
    this.emit('selection');
  }

  // --------------------------------------------------------------- factories
  /** Make the rotation handle (mtr) larger and more visible on an object. */
  private styleRotateHandle(obj: fabric.FabricObject) {
    const mtr = (obj as FabricAny)?.controls?.mtr as
      | { sizeX?: number; sizeY?: number; cornerSize?: number; touchCornerSize?: number }
      | undefined;
    if (mtr) {
      mtr.sizeX = 16;
      mtr.sizeY = 16;
    }
    const any = obj as FabricAny;
    any.cornerSize = 10;
    any.touchCornerSize = 20;
    any.transparentCorners = false;
    any.cornerColor = '#ffffff';
    any.cornerStrokeColor = '#6366f1';
  }

  private place(obj: fabric.FabricObject, opts: AddOptions = {}) {
    const c = this.requireCanvas();
    (obj as FabricAny).id = nanoid(8);
    this.styleRotateHandle(obj);
    if (opts.centered !== false) {
      obj.set({
        left: opts.left ?? this.pageWidth / 2,
        top: opts.top ?? this.pageHeight / 2,
        originX: 'center',
        originY: 'center',
      });
    } else {
      obj.set({ left: opts.left ?? 40, top: opts.top ?? 40 });
    }
    c.add(obj);
    c.setActiveObject(obj);
    c.requestRenderAll();
    this.emit('history');
    return obj;
  }

  addText(text: string, options: Partial<fabric.ITextProps> = {}, opts?: AddOptions) {
    const t = new fabric.Textbox(text, {
      width: 300,
      fontSize: 32,
      fontFamily: 'Inter',
      fill: '#111827',
      textAlign: 'left',
      ...options,
    });
    (t as FabricAny).elementType = 'text';
    return this.place(t, opts);
  }

  addShape(kind: ShapeKind, options: Record<string, unknown> = {}, opts?: AddOptions) {
    let obj: fabric.FabricObject;
    const base = { fill: '#6366f1', stroke: null, strokeWidth: 0, ...options } as FabricAny;
    if (base.stroke && String(base.stroke) !== 'transparent') base.lastStrokeColor = String(base.stroke);
    if (Number(base.strokeWidth) > 0) base.lastStrokeWidth = Number(base.strokeWidth);
    switch (kind) {
      case 'rect':
        obj = new fabric.Rect({ width: 200, height: 140, ...base });
        break;
      case 'rounded-rect':
        obj = new fabric.Rect({ width: 200, height: 140, rx: 18, ry: 18, ...base });
        break;
      case 'circle':
        obj = new fabric.Circle({ radius: 80, ...base });
        break;
      case 'ellipse':
        obj = new fabric.Ellipse({ rx: 110, ry: 70, ...base });
        break;
      case 'triangle':
        obj = new fabric.Triangle({ width: 170, height: 150, ...base });
        break;
      case 'star':
        obj = new fabric.Polygon(starPoints(5, 90, 40), base);
        break;
      case 'polygon':
        obj = new fabric.Polygon(polygonPoints(Number(options.sides ?? 6), 85), base);
        break;
      case 'line':
        obj = new fabric.Line([0, 0, 240, 0], {
          ...base,
          fill: undefined,
          stroke: (options.stroke as string) ?? '#111827',
          strokeWidth: (options.strokeWidth as number) ?? 3,
        });
        break;
      case 'arrow':
        obj = new fabric.Path('M 0 10 L 200 10 M 175 -8 L 200 10 L 175 28', {
          ...base,
          fill: undefined,
          stroke: (options.stroke as string) ?? '#111827',
          strokeWidth: (options.strokeWidth as number) ?? 4,
        });
        break;
      default:
        obj = new fabric.Rect({ width: 160, height: 160, ...base });
    }
    (obj as FabricAny).elementType = 'shape';
    (obj as FabricAny).name = kind;
    return this.place(obj, opts);
  }

  async addImageFromURL(
    url: string,
    opts: AddOptions & { elementType?: string; maxSize?: number; name?: string } = {},
  ) {
    this.requireCanvas();
    const img = await fabric.FabricImage.fromURL(url, { crossOrigin: 'anonymous' });
    const max = opts.maxSize ?? Math.min(this.pageWidth, this.pageHeight) * 0.6;
    const scale = Math.min(max / (img.width || max), max / (img.height || max), 1);
    img.scale(scale);
    (img as FabricAny).elementType = opts.elementType ?? 'image';
    (img as FabricAny).assetSrc = url;
    if (opts.name) (img as FabricAny).name = opts.name;
    return this.place(img, opts);
  }

  /**
   * Load an SVG asset. Traced artwork uses fill="currentColor", so passing a
   * `fill` recolors every path — this is what makes the sticker library
   * tintable instead of stuck on black.
   */
  async addSVGFromURL(
    url: string,
    opts: AddOptions & { name?: string; fill?: string; targetSize?: number } = {},
  ) {
    // Untrusted SVG (a user upload) can carry <script> and event handlers, and
    // Fabric's parser has a published advisory. Strip anything dangerous before
    // it reaches the parser. Bundled assets pass through unchanged.
    const safeUrl = sanitizeSvgDataUrl(url).url;
    if (!safeUrl) throw new Error('That SVG could not be read safely.');
    const { objects } = await fabric.loadSVGFromURL(safeUrl);
    const clean = objects.filter(Boolean) as fabric.FabricObject[];
    const group = fabric.util.groupSVGElements(clean, {});
    (group as FabricAny).elementType = 'sticker';
    (group as FabricAny).assetSrc = url;
    (group as FabricAny).recolorable = true;
    if (opts.name) (group as FabricAny).name = opts.name;

    applyTint(group, opts.fill ?? '#111827');

    const target = opts.targetSize ?? Math.min(this.pageWidth, this.pageHeight) * 0.35;
    const s = Math.min(
      target / (group.width || target),
      target / (group.height || target),
    );
    group.scale(s);
    return this.place(group, opts);
  }

  /** Recolor every path of the current selection (traced SVG art). */

  /** Insert an already-built list of fabric objects (module output). */
  addObjects(objects: fabric.FabricObject[], moduleId?: string) {
    const c = this.requireCanvas();
    objects.forEach((o) => {
      (o as FabricAny).id = nanoid(8);
      if (moduleId) (o as FabricAny).moduleId = moduleId;
      c.add(o);
    });
    c.requestRenderAll();
    this.emit('history');
  }

  // -------------------------------------------------------------- selection
  getActive(): fabric.FabricObject[] {
    return this.canvas?.getActiveObjects() ?? [];
  }

  /** Notify React (useSelection) that selection state changed, so toolbars and
   *  swatch chips re-read the current object's properties. */
  notifySelection() {
    this.emit('modified');
    this.emit('selection');
  }

  deleteSelection() {
    const c = this.requireCanvas();
    const objs = c.getActiveObjects();
    if (!objs.length) return;
    objs.forEach((o) => c.remove(o));
    c.discardActiveObject();
    c.requestRenderAll();
    this.emit('history');
  }

  /** Flip the selection horizontally. */
  flipHorizontal() {
    const c = this.requireCanvas();
    const objs = c.getActiveObjects();
    if (!objs.length) return;
    objs.forEach((o) => {
      (o as FabricAny).flipX = !(o as FabricAny).flipX;
      o.setCoords();
      o.dirty = true;
    });
    c.requestRenderAll();
    this.emit('history');
    this.notifySelection();
  }

  /** Flip the selection vertically. */
  flipVertical() {
    const c = this.requireCanvas();
    const objs = c.getActiveObjects();
    if (!objs.length) return;
    objs.forEach((o) => {
      (o as FabricAny).flipY = !(o as FabricAny).flipY;
      o.setCoords();
      o.dirty = true;
    });
    c.requestRenderAll();
    this.emit('history');
    this.notifySelection();
  }

  /** Rotate the selection by a fixed amount (e.g. 90, -90, 180) and snap. */
  rotateSelection(delta: number) {
    const c = this.requireCanvas();
    const objs = c.getActiveObjects();
    if (!objs.length) return;
    objs.forEach((o) => {
      const a = ((Number((o as FabricAny).angle) + delta) % 360 + 360) % 360;
      (o as FabricAny).angle = a;
      o.setCoords();
      o.dirty = true;
    });
    c.requestRenderAll();
    this.emit('history');
    this.notifySelection();
  }

  selectAll() {
    const c = this.requireCanvas();
    const objs = c.getObjects().filter((o) => o.selectable !== false);
    if (!objs.length) return;
    c.discardActiveObject();
    const sel = new fabric.ActiveSelection(objs, { canvas: c });
    c.setActiveObject(sel);
    c.requestRenderAll();
  }

  selectById(id: string) {
    const c = this.requireCanvas();
    const obj = c.getObjects().find((o) => (o as FabricAny).id === id);
    if (!obj) return;
    c.setActiveObject(obj);
    c.requestRenderAll();
  }

  /**
   * Select several objects as one active selection (same mechanics as
   * `selectAll`, scoped to the given ids). Used by the Layers panel so a
   * tag-clustered generated puzzle behaves as one selectable/movable unit —
   * identical to the semantic-instance selection the app already performs.
   */
  selectByIds(ids: string[]) {
    const c = this.requireCanvas();
    const wanted = new Set(ids);
    const objs = c
      .getObjects()
      .filter((o) => wanted.has((o as FabricAny).id) && o.selectable !== false);
    if (!objs.length) return;
    if (objs.length === 1) {
      c.setActiveObject(objs[0]);
      c.requestRenderAll();
      return;
    }
    c.discardActiveObject();
    const sel = new fabric.ActiveSelection(objs, { canvas: c });
    (sel as FabricAny).borderDashArray = [6, 4];
    (sel as FabricAny).borderColor = '#6366f1';
    c.setActiveObject(sel);
    c.requestRenderAll();
  }

  group() {
    const c = this.requireCanvas();
    const active = c.getActiveObject();
    if (!active || active.type !== 'activeselection') return;
    const sel = active as fabric.ActiveSelection;
    const members = sel.removeAll();
    c.discardActiveObject();
    c.remove(...members);
    const group = new fabric.Group(members, {});
    (group as FabricAny).elementType = 'group';
    c.add(group);
    c.setActiveObject(group);
    c.requestRenderAll();
    this.emit('history');
  }

  ungroup() {
    const c = this.requireCanvas();
    const active = c.getActiveObject();
    if (!active || active.type !== 'group') return;
    const group = active as fabric.Group;
    const items = group.removeAll();
    c.remove(group);
    items.forEach((o) => c.add(o));
    c.discardActiveObject();
    const sel = new fabric.ActiveSelection(items, { canvas: c });
    c.setActiveObject(sel);
    c.requestRenderAll();
    this.emit('history');
  }

  // -------------------------------------------------------------- clipboard
  private clipboard: unknown = null;

  private freshenIds(obj: Record<string, unknown>) {
    obj.id = nanoid(8);
    const children = obj.objects;
    if (Array.isArray(children)) {
      children.forEach((child) => {
        if (child && typeof child === 'object') this.freshenIds(child as Record<string, unknown>);
      });
    }
    return obj;
  }

  async activeSelectionPageObjects(): Promise<Record<string, unknown>[]> {
    const c = this.requireCanvas();
    const active = c.getActiveObject();
    if (!active) return [];
    const clone = await active.clone(EXTRA_PROPS as never) as fabric.FabricObject;
    const el = document.createElement('canvas');
    const tmp = new fabric.StaticCanvas(el, { width: this.pageWidth, height: this.pageHeight });
    if (clone.type === 'activeselection') {
      const sel = clone as fabric.ActiveSelection;
      sel.canvas = tmp as unknown as fabric.Canvas;
      sel.forEachObject((o) => tmp.add(o));
    } else {
      tmp.add(clone);
    }
    const json = tmp.toObject(EXTRA_PROPS) as { objects?: Record<string, unknown>[] };
    tmp.dispose();
    return (json.objects ?? []).map((o) => this.freshenIds(o));
  }

  async copy() {
    const c = this.requireCanvas();
    const active = c.getActiveObject();
    if (!active) return;
    this.clipboard = await active.clone(EXTRA_PROPS as never);
  }

  async cut() {
    await this.copy();
    this.deleteSelection();
  }

  async paste(offset = 16) {
    if (!this.clipboard) return;
    const c = this.requireCanvas();
    const src = this.clipboard as fabric.FabricObject;
    const clone = await src.clone(EXTRA_PROPS as never);
    clone.set({
      left: (clone.left ?? 0) + offset,
      top: (clone.top ?? 0) + offset,
    });
    (clone as FabricAny).id = nanoid(8);
    if (clone.type === 'activeselection') {
      (clone as fabric.ActiveSelection).canvas = c;
      (clone as fabric.ActiveSelection).forEachObject((o) => {
        (o as FabricAny).id = nanoid(8);
        c.add(o);
      });
      (clone as fabric.ActiveSelection).setCoords();
    } else {
      c.add(clone);
    }
    c.setActiveObject(clone);
    c.requestRenderAll();
    this.emit('history');
  }

  async duplicate() {
    await this.copy();
    await this.paste(20);
  }

  /**
   * Duplicate one object by id WITHOUT touching the current selection — used
   * by the layer-row hover actions, which must never steal the selection.
   */
  async duplicateById(id: string) {
    const c = this.requireCanvas();
    const src = c.getObjects().find((o) => (o as FabricAny).id === id);
    if (!src) return;
    const clone = (await src.clone(EXTRA_PROPS as never)) as fabric.FabricObject;
    clone.set({ left: (clone.left ?? 0) + 16, top: (clone.top ?? 0) + 16 });
    const freshen = (o: FabricAny) => {
      o.id = nanoid(8);
      (o._objects ?? []).forEach(freshen);
    };
    freshen(clone as FabricAny);
    c.add(clone);
    c.requestRenderAll();
    this.emit('history');
  }

  /** Remove one object by id without going through the selection. */
  removeById(id: string) {
    const c = this.requireCanvas();
    const obj = c.getObjects().find((o) => (o as FabricAny).id === id);
    if (!obj) return;
    const wasActive = c.getActiveObjects().includes(obj);
    if (wasActive) c.discardActiveObject();
    c.remove(obj);
    c.requestRenderAll();
    this.emit('history');
  }




  /** True when an object has been copied/cut and is ready to paste. */
  hasClipboard() {
    return this.clipboard !== null;
  }

  // ----------------------------------------------------------------- layers
  bringForward() {
    const c = this.requireCanvas();
    c.getActiveObjects().forEach((o) => c.bringObjectForward(o));
    c.requestRenderAll();
    this.emit('history');
  }
  sendBackwards() {
    const c = this.requireCanvas();
    c.getActiveObjects().forEach((o) => c.sendObjectBackwards(o));
    c.requestRenderAll();
    this.emit('history');
  }
  bringToFront() {
    const c = this.requireCanvas();
    c.getActiveObjects().forEach((o) => c.bringObjectToFront(o));
    c.requestRenderAll();
    this.emit('history');
  }
  sendToBack() {
    const c = this.requireCanvas();
    c.getActiveObjects().forEach((o) => c.sendObjectToBack(o));
    c.requestRenderAll();
    this.emit('history');
  }
  moveTo(id: string, index: number) {
    const c = this.requireCanvas();
    const obj = c.getObjects().find((o) => (o as FabricAny).id === id);
    if (!obj) return;
    c.moveObjectTo(obj, index);
    c.requestRenderAll();
    this.emit('history');
  }

  // -------------------------------------------------------------- alignment
  private absoluteBounds(o: fabric.FabricObject) {
    type Rect = { left: number; top: number; width: number; height: number };
    const fn = (o as unknown as {
      getBoundingRect: (absolute?: boolean, calculate?: boolean) => Rect;
    }).getBoundingRect;
    return fn.call(o, true, true);
  }

  private unionBounds(rects: { left: number; top: number; width: number; height: number }[]) {
    const left = Math.min(...rects.map((r) => r.left));
    const top = Math.min(...rects.map((r) => r.top));
    const right = Math.max(...rects.map((r) => r.left + r.width));
    const bottom = Math.max(...rects.map((r) => r.top + r.height));
    return { left, top, width: right - left, height: bottom - top };
  }

  private moveBoundsTo(
    o: fabric.FabricObject,
    bb: { left: number; top: number; width: number; height: number },
    target: { left?: number; top?: number; centerX?: number; centerY?: number },
  ) {
    const dx =
      target.left !== undefined
        ? target.left - bb.left
        : target.centerX !== undefined
          ? target.centerX - (bb.left + bb.width / 2)
          : 0;
    const dy =
      target.top !== undefined
        ? target.top - bb.top
        : target.centerY !== undefined
          ? target.centerY - (bb.top + bb.height / 2)
          : 0;
    o.set({ left: (o.left ?? 0) + dx, top: (o.top ?? 0) + dy });
    o.setCoords();
  }

  private finishGeometryChange() {
    const c = this.requireCanvas();
    const active = c.getActiveObject() as FabricAny | null;
    active?.setCoords?.();
    c.requestRenderAll();
    this.notifySelection();
    this.emit('history');
  }

  align(mode: AlignMode) {
    const c = this.requireCanvas();
    const objs = c.getActiveObjects();
    if (!objs.length) return;

    const rects = objs.map((o) => ({ o, bb: this.absoluteBounds(o) }));
    const target = objs.length > 1
      ? this.unionBounds(rects.map((r) => r.bb))
      : { left: 0, top: 0, width: this.pageWidth, height: this.pageHeight };

    rects.forEach(({ o, bb }) => {
      switch (mode) {
        case 'left':
          this.moveBoundsTo(o, bb, { left: target.left });
          break;
        case 'right':
          this.moveBoundsTo(o, bb, { left: target.left + target.width - bb.width });
          break;
        case 'center':
          this.moveBoundsTo(o, bb, { centerX: target.left + target.width / 2 });
          break;
        case 'top':
          this.moveBoundsTo(o, bb, { top: target.top });
          break;
        case 'bottom':
          this.moveBoundsTo(o, bb, { top: target.top + target.height - bb.height });
          break;
        case 'middle':
          this.moveBoundsTo(o, bb, { centerY: target.top + target.height / 2 });
          break;
      }
    });

    this.finishGeometryChange();
  }

  distribute(axis: 'h' | 'v') {
    const c = this.requireCanvas();
    const objs = c.getActiveObjects();
    if (objs.length < 3) return;

    const rects = objs.map((o) => ({ o, bb: this.absoluteBounds(o) }));
    rects.sort((a, b) => (axis === 'h' ? a.bb.left - b.bb.left : a.bb.top - b.bb.top));

    const first = rects[0].bb;
    const last = rects[rects.length - 1].bb;
    const span = axis === 'h'
      ? (last.left + last.width) - first.left
      : (last.top + last.height) - first.top;
    const sizeSum = rects.reduce(
      (sum, r) => sum + (axis === 'h' ? r.bb.width : r.bb.height),
      0,
    );
    const gap = (span - sizeSum) / (rects.length - 1);

    let cursor = axis === 'h' ? first.left : first.top;
    rects.forEach(({ o, bb }) => {
      if (axis === 'h') {
        this.moveBoundsTo(o, bb, { left: cursor });
        cursor += bb.width + gap;
      } else {
        this.moveBoundsTo(o, bb, { top: cursor });
        cursor += bb.height + gap;
      }
    });

    this.finishGeometryChange();
  }

  /**
   * "Tidy up": arrange the selected objects into an even grid within the
   * selection's absolute bounds. The math uses transformed bounding boxes so
   * rotated/scaled objects do not drift or overlap unexpectedly.
   */
  tidySelection() {
    const c = this.requireCanvas();
    const objs = c.getActiveObjects();
    if (objs.length < 2) return;

    const rects = objs.map((o) => ({ o, bb: this.absoluteBounds(o) }));
    const bounds = this.unionBounds(rects.map((r) => r.bb));

    const n = rects.length;
    const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
    const rows = Math.ceil(n / cols);

    // Sort top-to-bottom, then left-to-right, so the grid reads naturally.
    const sorted = [...rects].sort(
      (a, b) => (a.bb.top - b.bb.top) || (a.bb.left - b.bb.left),
    );

    const colWidths = Array.from({ length: cols }, (_, col) =>
      Math.max(
        0,
        ...sorted
          .filter((_, i) => i % cols === col)
          .map((r) => r.bb.width),
      ),
    );
    const rowHeights = Array.from({ length: rows }, (_, row) =>
      Math.max(
        0,
        ...sorted
          .filter((_, i) => Math.floor(i / cols) === row)
          .map((r) => r.bb.height),
      ),
    );
    const totalW = colWidths.reduce((a, b) => a + b, 0);
    const totalH = rowHeights.reduce((a, b) => a + b, 0);
    const gapX = cols > 1 ? (bounds.width - totalW) / (cols - 1) : 0;
    const gapY = rows > 1 ? (bounds.height - totalH) / (rows - 1) : 0;

    const colLefts: number[] = [];
    let x = bounds.left;
    for (let col = 0; col < cols; col++) {
      colLefts[col] = x;
      x += colWidths[col] + gapX;
    }

    const rowTops: number[] = [];
    let y = bounds.top;
    for (let row = 0; row < rows; row++) {
      rowTops[row] = y;
      y += rowHeights[row] + gapY;
    }

    sorted.forEach(({ o, bb }, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      this.moveBoundsTo(o, bb, {
        centerX: colLefts[col] + colWidths[col] / 2,
        centerY: rowTops[row] + rowHeights[row] / 2,
      });
    });

    this.finishGeometryChange();
  }



  // ----------------------------------------------------------- smart guides
  snapEnabled = true;
  gridSize = 20;
  snapToGrid = false;
  guides: { v: number[]; h: number[] } = { v: [], h: [] };
  private onGuides?: (g: { v: number[]; h: number[] }) => void;

  /**
   * Magnetic snapping targets (absolute page-point positions) fed in by the
   * caller — used on the cover so elements snap to the guideline lines (bleed
   * perimeter, trim boundary, safe-area borders, spine folds, barcode box).
   * Separate from object-to-object smart guides; these are static lines.
   */
  snapLinesX: number[] = [];
  snapLinesY: number[] = [];
  /** Distance (page points) within which an edge snaps to a guideline. */
  snapThreshold = 6;

  setGuideRenderer(fn: (g: { v: number[]; h: number[] }) => void) {
    this.onGuides = fn;
  }

  /**
   * Snap the moving object so its NEAREST bounding-box edge/center lands on a
   * grid line (both axes independently, so corners land on grid
   * intersections). Works for any object — single, Group or ActiveSelection —
   * because it always operates on the transformed bounding rect and applies
   * the correction to the object's origin. Continuous (no threshold): when
   * snap-to-grid is on, the object glides in grid steps, the way Figma/Canva
   * do it.
   */
  private snapObjectToGrid(target: fabric.FabricObject) {
    const grid = Math.max(1, this.gridSize);
    const bb = target.getBoundingRect();
    const snapAxis = (
      edges: number[],
      apply: (delta: number) => void,
    ) => {
      let bestDelta = Infinity;
      for (const edge of edges) {
        const delta = Math.round(edge / grid) * grid - edge;
        if (Math.abs(delta) < Math.abs(bestDelta)) bestDelta = delta;
      }
      if (bestDelta !== Infinity && bestDelta !== 0) apply(bestDelta);
    };
    snapAxis([bb.left, bb.left + bb.width / 2, bb.left + bb.width], (d) => {
      target.set({ left: (target.left ?? 0) + d });
    });
    snapAxis([bb.top, bb.top + bb.height / 2, bb.top + bb.height], (d) => {
      target.set({ top: (target.top ?? 0) + d });
    });
  }

  /**
   * Magnetic snapping to static guideline lines (used on the cover). When a
   * moving/resizing element's edge (left/right/top/bottom or centre) comes
   * within `snapThreshold` of a guideline, snap it and record the snapped line
   * so the overlay can highlight it. Handles both translation (during move)
   * and scale-adjustment (during resize, keeping the opposite edge anchored).
   */
  private snapObjectToStaticLines(
    target: fabric.FabricObject,
    e?: { pointer?: { x: number; y: number } },
  ) {
    const xs = this.snapLinesX;
    const ys = this.snapLinesY;
    if (!xs.length && !ys.length) return;
    const threshold = Math.max(1, this.snapThreshold || 6);
    const bb = target.getBoundingRect();

    // The pointer (mouse) position tells us which corner/edge the user is
    // dragging during a resize, so we can anchor the opposite edge.
    const canvas = this.canvas;
    const pointer = e?.pointer ?? (canvas ? canvas.getPointer(e as never) : null);

    let activeV = this.guides.v;
    let activeH = this.guides.h;

    // ----- horizontal (x) snap -----
    const candidatesV: Array<{ pos: number; kind: 'left' | 'center' | 'right' }> = [
      { pos: bb.left, kind: 'left' },
      { pos: bb.left + bb.width / 2, kind: 'center' },
      { pos: bb.left + bb.width, kind: 'right' },
    ];
    let bestV: { line: number; delta: number; kind: 'left' | 'center' | 'right' } | null = null;
    for (const c of candidatesV) {
      for (const line of xs) {
        const d = line - c.pos;
        if (Math.abs(d) < threshold && (!bestV || Math.abs(d) < Math.abs(bestV.delta))) {
          bestV = { line, delta: d, kind: c.kind };
        }
      }
    }
    if (bestV) {
      // When resizing, adjust the scale instead of the position (keep the far
      // edge anchored). When moving, translate.
      if (pointer && this.isScaling) {
        // The opposite edge (the one not being dragged) stays put.
        const dragRight = pointer.x > bb.left + bb.width / 2;
        if (bestV.kind === 'left') {
          if (dragRight) {
            const newW = (bb.left + bb.width - bestV.line) ;
            const scale = Math.max(0.01, newW / Math.max(target.width, 0.01));
            target.set({ scaleX: scale });
          } else {
            target.set({ left: bestV.line });
          }
        } else if (bestV.kind === 'right') {
          if (dragRight) {
            target.set({ left: (target.left ?? 0) + bestV.delta });
          } else {
            const newW = bestV.line - bb.left;
            const scale = Math.max(0.01, newW / Math.max(target.width, 0.01));
            target.set({ scaleX: scale });
          }
        }
      } else {
        target.set({ left: (target.left ?? 0) + bestV.delta });
      }
      if (!activeV.includes(bestV.line)) activeV = [...activeV, bestV.line];
    }

    // ----- vertical (y) snap -----
    const candidatesH: Array<{ pos: number; kind: 'top' | 'center' | 'bottom' }> = [
      { pos: bb.top, kind: 'top' },
      { pos: bb.top + bb.height / 2, kind: 'center' },
      { pos: bb.top + bb.height, kind: 'bottom' },
    ];
    let bestH: { line: number; delta: number; kind: 'top' | 'center' | 'bottom' } | null = null;
    for (const c of candidatesH) {
      for (const line of ys) {
        const d = line - c.pos;
        if (Math.abs(d) < threshold && (!bestH || Math.abs(d) < Math.abs(bestH.delta))) {
          bestH = { line, delta: d, kind: c.kind };
        }
      }
    }
    if (bestH) {
      if (pointer && this.isScaling) {
        const dragBottom = pointer.y > bb.top + bb.height / 2;
        if (bestH.kind === 'top') {
          if (dragBottom) {
            const newH = (bb.top + bb.height - bestH.line);
            const scale = Math.max(0.01, newH / Math.max(target.height, 0.01));
            target.set({ scaleY: scale });
          } else {
            target.set({ top: bestH.line });
          }
        } else if (bestH.kind === 'bottom') {
          if (dragBottom) {
            target.set({ top: (target.top ?? 0) + bestH.delta });
          } else {
            const newH = bestH.line - bb.top;
            const scale = Math.max(0.01, newH / Math.max(target.height, 0.01));
            target.set({ scaleY: scale });
          }
        }
      } else {
        target.set({ top: (target.top ?? 0) + bestH.delta });
      }
      if (!activeH.includes(bestH.line)) activeH = [...activeH, bestH.line];
    }

    if (bestV || bestH) {
      target.setCoords();
      target.dirty = true;
      this.guides = { v: activeV, h: activeH };
      this.onGuides?.(this.guides);
      this.canvas?.requestRenderAll();
    }
  }

  /** True while a resize (object:scaling) is in progress. */
  private isScaling = false;

  private installSmartGuides() {
    const c = this.requireCanvas();

    c.on('object:moving', (e) => {
      const target = e.target;
      if (!target) return;

      // 1. Grid snap — nearest edge/center to a grid intersection.
      if (this.snapToGrid) this.snapObjectToGrid(target);

      // 2. KDP safe-area hard stop — never bleed past the red margin lines.
      this.clampObjectToKdpSafe(target);

      if (!this.snapEnabled) return;

      // 3. Smart guides. CRITICAL: alignment targets are ONLY the objects that
      // are NOT part of the current selection. The previous implementation
      // used "everything except the moving target", so when an ActiveSelection
      // was dragged its own members were alignment targets — the selection
      // snapped to itself, produced meaningless guides every frame and felt
      // "locked" like a rigid group. Selected members move with the target, so
      // aligning to them can never be useful.
      const bb = target.getBoundingRect();
      const activeObjects = new Set(c.getActiveObjects());
      const others = c.getObjects().filter(
        (o) =>
          o !== target &&
          o.visible &&
          !(o as FabricAny).novelkaGhost &&
          !activeObjects.has(o),
      );
      const vTargets = [0, this.pageWidth / 2, this.pageWidth, ...this.snapLinesX];
      const hTargets = [0, this.pageHeight / 2, this.pageHeight, ...this.snapLinesY];
      others.forEach((o) => {
        const b = o.getBoundingRect();
        vTargets.push(b.left, b.left + b.width / 2, b.left + b.width);
        hTargets.push(b.top, b.top + b.height / 2, b.top + b.height);
      });

      const threshold = Math.max(1, this.snapThreshold || 6);

      const activeV = new Set<number>();
      const activeH = new Set<number>();
      const myV = [bb.left, bb.left + bb.width / 2, bb.left + bb.width];
      const myH = [bb.top, bb.top + bb.height / 2, bb.top + bb.height];

      myV.forEach((mv) => {
        for (const tv of vTargets) {
          if (Math.abs(mv - tv) < threshold) {
            const delta = tv - mv;
            if (delta !== 0) target.set({ left: target.left! + delta });
            activeV.add(tv);
            break;
          }
        }
      });
      myH.forEach((mh) => {
        for (const th of hTargets) {
          if (Math.abs(mh - th) < threshold) {
            const delta = th - mh;
            if (delta !== 0) target.set({ top: target.top! + delta });
            activeH.add(th);
            break;
          }
        }
      });

      // Re-assert the hard stop after guide snapping pulled the object.
      this.clampObjectToKdpSafe(target);
      this.guides = { v: [...activeV], h: [...activeH] };
      this.onGuides?.(this.guides);
    });

    c.on('object:scaling', (e) => {
      const target = e.target;
      if (!target) return;
      this.isScaling = true;
      this.shrinkObjectToKdpSafe(target);
      // Magnetic snap on the scaling edges to static guideline lines (cover).
      if (this.snapEnabled && (this.snapLinesX.length || this.snapLinesY.length)) {
        this.snapObjectToStaticLines(target, e as unknown as { pointer?: { x: number; y: number } });
      }
    });

    // Rotating changes the bounding box — a long object turned 45° can poke out
    // of the safe area even though its centre never moved. Clamp on every tick
    // and re-assert when the gesture ends (covers jump/undo-modified paths).
    c.on('object:rotating', (e) => {
      const target = e.target;
      if (!target) return;
      this.clampObjectToKdpSafe(target);
    });
    c.on('object:modified', (e) => {
      const target = e.target;
      this.isScaling = false;
      if (!target) return;
      this.clampObjectToKdpSafe(target);
    });

    const clear = () => {
      this.isScaling = false;
      if (this.guides.v.length || this.guides.h.length) {
        this.guides = { v: [], h: [] };
        this.onGuides?.(this.guides);
      }
    };
    c.on('mouse:up', clear);
    c.on('object:modified', clear);
  }

  // ------------------------------------------------------------------- zoom
  zoom = 1;

  /** MediaQueryList watching the screen resolution; null when unmounted. */
  private dprWatch: { mql: MediaQueryList; fn: () => void } | null = null;

  setZoom(z: number) {
    this.zoom = Math.min(5, Math.max(0.1, z));
    this.applyViewport();
    this.emit('zoom');
  }

  /**
   * Re-apply the viewport when the display resolution changes (monitor swap,
   * browser zoom). Without this, a canvas opened on one screen stays blurry
   * after moving the window to another.
   */
  private watchDpr() {
    this.unwatchDpr();
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const dpr = window.devicePixelRatio || 1;
    const mql = window.matchMedia(`(resolution: ${dpr}dppx)`);
    const fn = () => {
      if (this.canvas) this.applyViewport();
    };
    if (typeof mql.addEventListener === 'function') mql.addEventListener('change', fn);
    else (mql as unknown as { addListener(f: () => void): void }).addListener(fn);
    this.dprWatch = { mql, fn };
  }

  private unwatchDpr() {
    if (!this.dprWatch) return;
    const { mql, fn } = this.dprWatch;
    if (typeof mql.removeEventListener === 'function') mql.removeEventListener('change', fn);
    else (mql as unknown as { removeListener(f: () => void): void }).removeListener(fn);
    this.dprWatch = null;
  }
}

export type ShapeKind =
  | 'rect'
  | 'rounded-rect'
  | 'circle'
  | 'ellipse'
  | 'triangle'
  | 'star'
  | 'polygon'
  | 'line'
  | 'arrow';

export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FabricAny = any;

function starPoints(spikes: number, outer: number, inner: number) {
  const pts: { x: number; y: number }[] = [];
  const step = Math.PI / spikes;
  let rot = (Math.PI / 2) * 3;
  for (let i = 0; i < spikes; i++) {
    pts.push({ x: Math.cos(rot) * outer, y: Math.sin(rot) * outer });
    rot += step;
    pts.push({ x: Math.cos(rot) * inner, y: Math.sin(rot) * inner });
    rot += step;
  }
  return pts;
}

function polygonPoints(sides: number, radius: number) {
  const n = Math.max(3, Math.min(20, sides));
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { x: Math.cos(a) * radius, y: Math.sin(a) * radius };
  });
}

/**
 * Walk a fabric object tree and recolor it. Fill-based artwork (stickers,
 * borders, dividers, flourishes) gets its fill recolored; stroke-based artwork
 * (the UI icons, which have no fill and only a stroke) gets its stroke
 * recolored — so outline icons stay outlines instead of turning into filled
 * shapes. The chosen color is recorded in `tintColor` for toolbar swatches.
 */
export function applyTint(obj: fabric.FabricObject, color: string) {
  const any = obj as FabricAny;
  const kids: fabric.FabricObject[] | undefined = any._objects;
  if (kids?.length) {
    kids.forEach((k) => applyTint(k, color));
    any.tintColor = color;
    any.dirty = true;
    return;
  }
  // Only set fill when this leaf actually has a fill (stickers); icons have
  // fill = none/null, so their stroke is recolored instead.
  if (any.fill !== undefined && any.fill !== null && String(any.fill) !== '' && String(any.fill) !== 'none') {
    any.set('fill', color);
  }
  if (any.stroke && String(any.stroke) !== 'none' && String(any.stroke) !== 'transparent') {
    any.set('stroke', color);
  }
  any.tintColor = color;
  any.dirty = true;
}

export const engine = new CanvasEngine();

const TEST_HOOKS =
  import.meta.env?.DEV || import.meta.env?.VITE_ENABLE_TEST_HOOKS === 'true';

// Test hook: lets the e2e suite inspect canvas geometry directly.
if (typeof window !== 'undefined' && TEST_HOOKS) {
  (window as unknown as { __eng: CanvasEngine }).__eng = engine;
}
