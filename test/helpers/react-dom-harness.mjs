/**
 * A jsdom + React DOM harness for panel tests.
 *
 * `renderToStaticMarkup` is enough to audit markup, but the dock panels are
 * about behaviour: clicking a row, pressing a key, dispatching one command.
 * Those need a real DOM with real event handlers, so these tests mount into
 * jsdom with `createRoot` and drive it through `act`.
 *
 * The globals are installed once per test process, before React is imported.
 */

import { JSDOM } from 'jsdom';
import { installCanvasStub } from './jsdom-canvas-stub.mjs';

/**
 * Installs jsdom globals and returns a mount/unmount harness.
 *
 * `IntersectionObserver` is deliberately NOT provided: jsdom has none, and the
 * panels fall back to "every row is visible", which is the path a test wants.
 */
export async function createHarness() {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    pretendToBeVisual: true,
    url: 'http://localhost/',
  });
  installCanvasStub(dom);

  // jsdom implements no layout, so it has no scrollIntoView. Every browser
  // does; a no-op keeps the scroll-into-view effect on its real code path.
  dom.window.Element.prototype.scrollIntoView = function scrollIntoViewStub() {};

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.HTMLCanvasElement = dom.window.HTMLCanvasElement;
  globalThis.Element = dom.window.Element;
  globalThis.Node = dom.window.Node;
  globalThis.Image = dom.window.Image;
  globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  globalThis.devicePixelRatio = 1;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const { createElement, act } = await import('react');
  const { createRoot } = await import('react-dom/client');

  const container = dom.window.document.getElementById('root');
  const root = createRoot(container);

  /** Renders an element and flushes effects. */
  const mount = async (element) => {
    await act(async () => {
      root.render(element);
    });
    await settle();
  };

  /**
   * Lets queued rAF callbacks, microtasks and async effects run to quiet.
   *
   * The Pages tab renders thumbnails one page at a time in an async loop, so
   * a fixed two or three turns is not enough for a 30-page book. This keeps
   * turning until React stops scheduling work, which is also what makes the
   * `act(...)` warning go away.
   */
  const settle = async (turns = 40) => {
    for (let i = 0; i < turns; i += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
  };

  /** Runs a synchronous store update inside act, so the re-render is flushed. */
  const run = async (fn) => {
    await act(async () => {
      fn();
    });
    await settle();
  };

  /** Fires a real bubbling event and flushes the resulting render. */
  const fire = async (element, type, init = {}) => {
    await act(async () => {
      const Ctor =
        type.startsWith('key') ? dom.window.KeyboardEvent
        : type.startsWith('pointer') ? dom.window.Event
        : dom.window.MouseEvent;
      const event = new Ctor(type, { bubbles: true, cancelable: true, ...init });
      element.dispatchEvent(event);
    });
    await settle();
  };

  const unmount = async () => {
    await act(async () => {
      root.unmount();
    });
  };

  return { dom, document: dom.window.document, container, createElement, act, mount, fire, run, settle, unmount };
}
