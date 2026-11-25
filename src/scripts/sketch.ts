/**
 * Shared runtime for interactive canvas figures.
 *
 * Every widget on the blog goes through this so the four things that are easy
 * to get wrong are only solved once:
 *
 *   1. devicePixelRatio      — otherwise lines are blurry on a retina screen.
 *   2. IntersectionObserver  — offscreen figures don't burn the reader's battery.
 *   3. prefers-reduced-motion — render one static frame, but stay interactive.
 *   4. ResizeObserver        — redraw on resize/rotate instead of stretching.
 *
 * It also re-reads colours from CSS custom properties on every draw, so figures
 * follow light/dark without a duplicate palette in JavaScript.
 */

export interface SketchFrame {
  ctx: CanvasRenderingContext2D;
  /** Logical drawing width in CSS pixels. */
  width: number;
  /** Logical drawing height in CSS pixels. */
  height: number;
  /** Seconds of play time elapsed. Pinned at 0 under reduced motion. */
  t: number;
  /** Resolve a CSS custom property declared on the figure (e.g. `--sk-ink`). */
  color: (name: string, fallback?: string) => string;
}

export interface SketchOptions {
  /** width / height. The canvas box is driven by CSS `aspect-ratio`. */
  aspect?: number;
  /** Run a requestAnimationFrame loop rather than drawing on demand. */
  animate?: boolean;
  /** Start playing immediately. Ignored when `animate` is false. */
  autoplay?: boolean;
  draw: (frame: SketchFrame) => void;
  /**
   * Called once the figure is live. This is how a widget gets hold of its own
   * handle so its sliders and buttons can trigger `redraw`/`play`/`pause`.
   */
  onReady?: (handle: SketchHandle) => void;
}

export interface SketchHandle {
  /** Draw one frame now. Call this after changing widget state. */
  redraw: () => void;
  play: () => void;
  pause: () => void;
  isPlaying: () => boolean;
  /** True when the reader has asked for reduced motion. */
  isReducedMotion: () => boolean;
  destroy: () => void;
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

export function createSketch(
  root: HTMLElement,
  options: SketchOptions,
): SketchHandle | null {
  const foundCanvas = root.querySelector('canvas');
  if (!(foundCanvas instanceof HTMLCanvasElement)) return null;

  const foundCtx = foundCanvas.getContext('2d');
  if (!foundCtx) return null;

  // Re-bound after the guards because the helpers below are function
  // declarations, which are hoisted — TypeScript won't carry the narrowing
  // from an early return into them, but it does into these consts.
  const canvas = foundCanvas;
  const ctx = foundCtx;

  const aspect = options.aspect ?? 2;
  const wantsAnimation = options.animate ?? false;

  canvas.style.aspectRatio = String(aspect);

  const reducedMotionQuery = window.matchMedia(REDUCED_MOTION);
  const schemeQuery = window.matchMedia('(prefers-color-scheme: dark)');

  let width = 0;
  let height = 0;
  let elapsed = 0;
  let lastFrameAt = 0;
  let rafId = 0;
  let onScreen = false;
  let playRequested = wantsAnimation && (options.autoplay ?? true);

  // Colour lookups are cached for the duration of a single draw: a widget may
  // ask for the same token dozens of times while stroking a path, and
  // getComputedStyle is not cheap.
  let colorCache = new Map<string, string>();

  const color = (name: string, fallback = '#888') => {
    const cached = colorCache.get(name);
    if (cached !== undefined) return cached;
    const resolved =
      getComputedStyle(root).getPropertyValue(name).trim() || fallback;
    colorCache.set(name, resolved);
    return resolved;
  };

  const reducedMotion = () => reducedMotionQuery.matches;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return false;

    const dpr = window.devicePixelRatio || 1;
    width = rect.width;
    height = rect.height;

    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }

    // Reset rather than compound: resize() runs on every observer callback.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }

  function redraw() {
    if (width === 0 && !resize()) return;

    colorCache = new Map();
    ctx.clearRect(0, 0, width, height);
    options.draw({
      ctx,
      width,
      height,
      t: reducedMotion() ? 0 : elapsed,
      color,
    });
  }

  function tick(now: number) {
    if (lastFrameAt !== 0) {
      elapsed += (now - lastFrameAt) / 1000;
    }
    lastFrameAt = now;
    redraw();
    rafId = requestAnimationFrame(tick);
  }

  function startLoop() {
    if (rafId !== 0 || !playRequested || !onScreen || reducedMotion()) return;
    lastFrameAt = 0;
    rafId = requestAnimationFrame(tick);
  }

  function stopLoop() {
    if (rafId === 0) return;
    cancelAnimationFrame(rafId);
    rafId = 0;
    lastFrameAt = 0;
  }

  const resizeObserver = new ResizeObserver(() => {
    if (resize()) redraw();
  });
  resizeObserver.observe(canvas);

  const intersectionObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        onScreen = entry.isIntersecting;
      }
      if (onScreen) {
        startLoop();
        // A figure scrolled past before it was ever measured still needs its
        // first frame.
        if (rafId === 0) redraw();
      } else {
        stopLoop();
      }
    },
    { rootMargin: '150px' },
  );
  intersectionObserver.observe(canvas);

  const onSchemeChange = () => redraw();
  const onReducedMotionChange = () => {
    if (reducedMotion()) {
      stopLoop();
      redraw();
    } else {
      startLoop();
    }
  };

  schemeQuery.addEventListener('change', onSchemeChange);
  reducedMotionQuery.addEventListener('change', onReducedMotionChange);

  resize();
  redraw();

  const handle: SketchHandle = {
    redraw,
    play() {
      playRequested = true;
      startLoop();
    },
    pause() {
      playRequested = false;
      stopLoop();
    },
    isPlaying: () => playRequested && rafId !== 0,
    isReducedMotion: reducedMotion,
    destroy() {
      stopLoop();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      schemeQuery.removeEventListener('change', onSchemeChange);
      reducedMotionQuery.removeEventListener('change', onReducedMotionChange);
    },
  };

  options.onReady?.(handle);

  return handle;
}

/**
 * Mount one sketch per matching figure on the page.
 *
 * `factory` is called once per element, so each instance gets its own closure
 * for its own state — two copies of the same widget in one post stay
 * independent.
 */
export function mountSketches(
  name: string,
  factory: (root: HTMLElement) => SketchOptions | null,
) {
  const roots = document.querySelectorAll<HTMLElement>(
    `[data-sketch="${name}"]`,
  );

  for (const root of roots) {
    if (root.dataset.sketchMounted === 'true') continue;
    const options = factory(root);
    if (!options) continue;
    if (createSketch(root, options)) {
      root.dataset.sketchMounted = 'true';
    }
  }
}
