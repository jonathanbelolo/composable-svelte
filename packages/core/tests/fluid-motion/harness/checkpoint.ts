/**
 * Rendering checkpoint: a per-frame callback that runs after every animation-frame callback of
 * the frame, inside the same rendering update and before paint.
 *
 * Mechanism: each animation frame re-arms a ResizeObserver on a private 1×1 probe. HTML's
 * "update the rendering" runs animation-frame callbacks (and the microtasks they queue, such as
 * Svelte flushes), then style/layout, then broadcasts resize observations. The checkpoint
 * therefore sees the DOM/style state that the frame's rendering update will use, including writes
 * made by runtime rAF callbacks registered after the checkpoint's own rAF callback.
 *
 * Limits: this is DOM/style state, not compositor output. Writes made later in the same rendering
 * update (by ResizeObserver or IntersectionObserver callbacks delivered after this one) are not
 * seen. A frame whose rendering update is skipped runs neither rAF nor this checkpoint.
 */

export type SamplePhase =
  /** Start of the frame's rAF callbacks: excludes writes by later rAF callbacks in the same frame. */
  | 'animationFrame'
  /** After all rAF callbacks of the frame, before paint (ResizeObserver delivery). */
  | 'renderingCheckpoint'
  /** Explicit caller-chosen checkpoint (`sampleNow`); ordering is the caller's responsibility. */
  | 'manual';

export interface RenderingCheckpointLoop {
  /** Frames whose rAF ran but whose checkpoint was not delivered before the next frame. */
  readonly missed: number;
  stop(): void;
}

/** Runs `onCheckpoint(frameTime)` once per frame after all animation-frame callbacks. */
export function startRenderingCheckpoints(onCheckpoint: (frameTime: number) => void): RenderingCheckpointLoop {
  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.setAttribute('data-motion-harness-probe', '');
  probe.style.cssText = 'position:fixed;left:-10px;top:-10px;width:1px;height:1px;visibility:hidden;pointer-events:none;';
  document.documentElement.append(probe);

  let active = true;
  let missed = 0;
  let pendingFrameTime: number | undefined;
  let rafId: number | undefined;

  const observer = new ResizeObserver(() => {
    if (!active || pendingFrameTime === undefined) return;
    const frameTime = pendingFrameTime;
    pendingFrameTime = undefined;
    onCheckpoint(frameTime);
  });

  const arm = (frameTime: number) => {
    rafId = undefined;
    if (!active) return;
    if (pendingFrameTime !== undefined) missed++;
    pendingFrameTime = frameTime;
    // Re-observing creates a fresh observation, which is reported in this frame's rendering update.
    observer.unobserve(probe);
    observer.observe(probe);
    rafId = requestAnimationFrame(arm);
  };
  rafId = requestAnimationFrame(arm);

  return {
    get missed() {
      return missed;
    },
    stop() {
      if (!active) return;
      active = false;
      if (rafId !== undefined) cancelAnimationFrame(rafId);
      observer.disconnect();
      probe.remove();
    }
  };
}

/** Resolves with the frame time at the next rendering checkpoint. */
export function nextRenderingCheckpoint(): Promise<number> {
  return new Promise(resolve => {
    const loop = startRenderingCheckpoints(time => {
      loop.stop();
      resolve(time);
    });
  });
}

/**
 * Awaits rendering checkpoints until `predicate` holds or `timeoutMs` elapses.
 * Returns whether the predicate held; callers assert on the result.
 */
export async function waitForRenderingCheckpoint(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  const start = performance.now();
  while (performance.now() - start < timeoutMs) {
    await nextRenderingCheckpoint();
    if (predicate()) return true;
  }
  return predicate();
}
