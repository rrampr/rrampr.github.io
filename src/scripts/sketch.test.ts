import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createSketch, type SketchFrame } from './sketch.ts';

/**
 * The sketch runtime is the one piece every future widget depends on, so it's
 * worth testing the parts that are easy to break and invisible when they do:
 * devicePixelRatio scaling, reduced-motion handling, and theme lookups.
 *
 * Run with `npm test` (Node strips the types itself — no build step).
 */

type Listeners = Record<string, Array<() => void>>;

function setupDom({
  dpr = 2,
  reducedMotion = false,
  width = 400,
  height = 200,
  tokens = { '--sk-ink': '#111111' } as Record<string, string>,
} = {}) {
  const ctxCalls: string[] = [];

  const ctx = {
    setTransform: (...args: number[]) =>
      ctxCalls.push(`setTransform(${args.join(',')})`),
    clearRect: (...args: number[]) =>
      ctxCalls.push(`clearRect(${args.join(',')})`),
  };

  class FakeCanvas {
    width = 0;
    height = 0;
    style: Record<string, string> = {};
    getBoundingClientRect() {
      return { width, height, top: 0, left: 0 };
    }
    getContext() {
      return ctx;
    }
    addEventListener() {}
  }

  const canvas = new FakeCanvas();
  const root = { querySelector: () => canvas, dataset: {} };

  const mediaListeners: Listeners = {};
  let intersectionCallback: ((entries: unknown[]) => void) | undefined;
  let resizeCallback: (() => void) | undefined;
  const rafQueue: Array<(t: number) => void> = [];

  Object.assign(globalThis, {
    HTMLCanvasElement: FakeCanvas,
    devicePixelRatio: dpr,
    window: {
      devicePixelRatio: dpr,
      matchMedia: (query: string) => ({
        matches: query.includes('reduced-motion') ? reducedMotion : false,
        addEventListener: (_: string, fn: () => void) => {
          (mediaListeners[query] ??= []).push(fn);
        },
        removeEventListener: () => {},
      }),
    },
    getComputedStyle: () => ({
      getPropertyValue: (name: string) => tokens[name] ?? '',
    }),
    ResizeObserver: class {
      constructor(fn: () => void) {
        resizeCallback = fn;
      }
      observe() {}
      disconnect() {}
    },
    IntersectionObserver: class {
      constructor(fn: (entries: unknown[]) => void) {
        intersectionCallback = fn;
      }
      observe() {}
      disconnect() {}
    },
    requestAnimationFrame: (fn: (t: number) => void) => {
      rafQueue.push(fn);
      return rafQueue.length;
    },
    cancelAnimationFrame: () => {},
  });

  return {
    root: root as unknown as HTMLElement,
    canvas,
    ctxCalls,
    rafQueue,
    goOnScreen: () => intersectionCallback?.([{ isIntersecting: true }]),
    goOffScreen: () => intersectionCallback?.([{ isIntersecting: false }]),
    triggerResize: () => resizeCallback?.(),
  };
}

test('scales the backing store by devicePixelRatio', () => {
  const dom = setupDom({ dpr: 3, width: 400, height: 200 });
  const frames: SketchFrame[] = [];

  createSketch(dom.root, { draw: (f) => frames.push({ ...f }) });

  // The CSS box is 400x200, so a 3x display needs a 1200x600 buffer.
  assert.equal(dom.canvas.width, 1200);
  assert.equal(dom.canvas.height, 600);
  assert.ok(dom.ctxCalls.includes('setTransform(3,0,0,3,0,0)'));

  // Draw still receives logical CSS pixels, not device pixels.
  assert.equal(frames[0].width, 400);
  assert.equal(frames[0].height, 200);
});

test('draws once on creation and again on redraw', () => {
  const dom = setupDom();
  let drawCount = 0;

  const handle = createSketch(dom.root, { draw: () => drawCount++ });
  assert.equal(drawCount, 1, 'should paint a first frame immediately');

  handle?.redraw();
  assert.equal(drawCount, 2);
});

test('resolves colours from CSS custom properties', () => {
  const dom = setupDom({ tokens: { '--sk-ink': '#abcdef' } });
  let resolved = '';

  createSketch(dom.root, {
    draw: ({ color }) => {
      resolved = color('--sk-ink', '#000000');
    },
  });

  assert.equal(resolved, '#abcdef');
});

test('falls back when a custom property is undeclared', () => {
  const dom = setupDom({ tokens: {} });
  let resolved = '';

  createSketch(dom.root, {
    draw: ({ color }) => {
      resolved = color('--sk-missing', '#fallback');
    },
  });

  assert.equal(resolved, '#fallback');
});

test('does not start an animation loop until on screen', () => {
  const dom = setupDom();

  createSketch(dom.root, { draw: () => {}, animate: true, autoplay: true });
  assert.equal(dom.rafQueue.length, 0, 'offscreen figures must stay idle');

  dom.goOnScreen();
  assert.equal(dom.rafQueue.length, 1, 'should start once visible');
});

test('honours prefers-reduced-motion', () => {
  const dom = setupDom({ reducedMotion: true });
  const times: number[] = [];

  const handle = createSketch(dom.root, {
    draw: ({ t }) => times.push(t),
    animate: true,
    autoplay: true,
  });

  dom.goOnScreen();

  assert.equal(dom.rafQueue.length, 0, 'no loop under reduced motion');
  assert.ok(handle?.isReducedMotion());
  // Still drawn, and still redrawable by hand, just frozen at t=0.
  assert.ok(times.length >= 1);
  assert.ok(times.every((t) => t === 0));
});

test('stops the loop when scrolled out of view', () => {
  const dom = setupDom();

  const handle = createSketch(dom.root, {
    draw: () => {},
    animate: true,
    autoplay: true,
  });

  dom.goOnScreen();
  assert.equal(handle?.isPlaying(), true);

  dom.goOffScreen();
  assert.equal(handle?.isPlaying(), false);
});

test('pause stops the loop and play resumes it', () => {
  const dom = setupDom();

  const handle = createSketch(dom.root, {
    draw: () => {},
    animate: true,
    autoplay: true,
  });
  dom.goOnScreen();

  handle?.pause();
  assert.equal(handle?.isPlaying(), false);

  handle?.play();
  assert.equal(handle?.isPlaying(), true);
});

test('returns null when the figure has no canvas', () => {
  setupDom();
  const root = { querySelector: () => null } as unknown as HTMLElement;

  assert.equal(createSketch(root, { draw: () => {} }), null);
});
