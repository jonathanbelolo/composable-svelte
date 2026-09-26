/**
 * @file animate-zoom.ts
 * Animation utilities for zoom transitions
 */

import type { ZoomTransform } from '../types/chart.types.js';
import type { Dispatch } from '@composable-svelte/core';
import type { ChartAction } from '../types/chart.types.js';

/**
 * Easing function: easeOutCubic for smooth deceleration
 */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Animate zoom transform with custom easing
 * Uses requestAnimationFrame for smooth 60fps transitions
 */
export async function animateZoomTransition(
  from: ZoomTransform,
  to: ZoomTransform,
  dispatch: Dispatch<ChartAction<any>>,
  onProgress: (transform: ZoomTransform) => void,
  /**
   * Milliseconds. Defaults to the 400 this used to hardcode, which is why
   * `transitionDuration` — declared on both `ChartState` and `ChartConfig`,
   * seeded, and documented with a usage example — was read by nothing.
   */
  duration = 400,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    let frame: number | undefined;
    let settled = false;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = undefined;
      signal?.removeEventListener('abort', abort);
      if (error !== undefined) reject(error); else resolve();
    };
    const abort = () => finish();
    if (signal?.aborted) { finish(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    const startTime = performance.now();
    function animate(currentTime: number) {
      frame = undefined;
      if (settled || signal?.aborted) return;
      try {
        const progress = duration > 0 && Number.isFinite(duration)
          ? Math.min(Math.max((currentTime - startTime) / duration, 0), 1) : 1;
        const eased = easeOutCubic(progress);
        onProgress(progress === 1 ? to : {
          k: from.k + (to.k - from.k) * eased,
          x: from.x + (to.x - from.x) * eased,
          y: from.y + (to.y - from.y) * eased
        });
        if (settled || signal?.aborted) return;
        if (progress < 1) frame = requestAnimationFrame(animate);
        else { signal?.removeEventListener('abort', abort); dispatch({ type: 'zoomComplete' }); finish(); }
      } catch (error) { finish(error); }
    }
    try { frame = requestAnimationFrame(animate); }
    catch (error) { finish(error); }
  });
}
