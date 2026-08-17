/**
 * jsdom canvas stub for Node-based unit tests that touch fabric.js.
 *
 * jsdom does not implement HTMLCanvasElement#getContext('2d') — it returns
 * null unless the native `canvas` (node-canvas) package happens to be
 * installed. Fabric.js needs a 2D context to measure text: it calls
 * `getMeasuringContext()` during Text/Textbox construction and crashes with
 * "Cannot set properties of null (setting 'textBaseline')" when it gets null.
 *
 * node-canvas is a native dependency (node-gyp + cairo/pango), which is a
 * heavy and fragile requirement for a test environment. These unit tests only
 * inspect the JSON geometry the templates return — they never rasterise — so
 * a minimal stub is enough: settable style properties (any assignment works
 * on a plain object) plus a measureText() whose width is proportional to the
 * glyph count. Kerning-exact widths would change the numbers, not the checks.
 *
 * Usage:
 *   const { JSDOM } = await import('jsdom');
 *   const dom = new JSDOM('<!doctype html><html><body></body></html>');
 *   installCanvasStub(dom);
 *   globalThis.document = dom.window.document;
 *   // ... import fabric-dependent code
 */
export function installCanvasStub(dom) {
  const makeContext = () => {
    const ctx = {
      // ~8px per glyph keeps line wrapping roughly proportional so template
      // JSON layouts stay realistic without a real font engine.
      measureText: (text) => ({ width: String(text).length * 8 }),
      save() {},
      restore() {},
      translate() {},
      rotate() {},
      scale() {},
      transform() {},
      setTransform() {},
      resetTransform() {},
      clearRect() {},
      fillRect() {},
      strokeRect() {},
      rect() {},
      fill() {},
      stroke() {},
      beginPath() {},
      closePath() {},
      moveTo() {},
      lineTo() {},
      arc() {},
      arcTo() {},
      ellipse() {},
      bezierCurveTo() {},
      quadraticCurveTo() {},
      clip() {},
      fillText() {},
      strokeText() {},
      drawImage() {},
      setLineDash() {},
      getLineDash() { return []; },
      createLinearGradient() { return { addColorStop() {} }; },
      createRadialGradient() { return { addColorStop() {} }; },
      createPattern() { return {}; },
      getImageData() {
        return { data: new Uint8ClampedArray([0, 0, 0, 255]), width: 1, height: 1 };
      },
      putImageData() {},
      isPointInPath() { return false; },
    };
    // ctx.canvas back-reference, mirroring the real spec.
    return ctx;
  };

  dom.window.HTMLCanvasElement.prototype.getContext = function getContextStub() {
    const ctx = makeContext();
    // The real spec exposes the owning element as ctx.canvas; fabric's text
    // renderer uses it (ctx.canvas.setAttribute('dir', …)).
    ctx.canvas = this;
    return ctx;
  };
}
