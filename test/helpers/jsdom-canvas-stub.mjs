/**
 * jsdom canvas stub for Node-based unit tests that touch fabric.js.
 *
 * Ported from legacy test helper.
 *
 * jsdom does not implement HTMLCanvasElement#getContext('2d') by default.
 * Fabric.js needs a 2D context to measure text and initialize canvases.
 * This stub provides a lightweight 2D context and toDataURL implementation.
 */
export function installCanvasStub(dom) {
  const makeContext = () => {
    const ctx = {
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
        return { data: new Uint8ClampedArray([255, 255, 255, 255]), width: 1, height: 1 };
      },
      putImageData() {},
      isPointInPath() { return false; },
    };
    return ctx;
  };

  dom.window.HTMLCanvasElement.prototype.getContext = function getContextStub() {
    const ctx = makeContext();
    ctx.canvas = this;
    return ctx;
  };

  dom.window.HTMLCanvasElement.prototype.toDataURL = function toDataURLStub(format = 'image/png', _quality = 0.92) {
    const fmt = typeof format === 'string' ? format : 'image/png';
    return `data:${fmt};base64,stub-thumbnail-data`;
  };
}
