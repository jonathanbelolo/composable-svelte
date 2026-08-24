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
  duration = 400
): Promise<void> {
  return new Promise((resolve) => {
    const startTime = performance.now();

    function animate(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);

      // Interpolate values
      const currentTransform: ZoomTransform = {
        k: from.k + (to.k - from.k) * eased,
        x: from.x + (to.x - from.x) * eased,
        y: from.y + (to.y - from.y) * eased
      };

      // Dispatch progress update
      onProgress(currentTransform);

      if (progress < 1) {
        // Continue animation
        requestAnimationFrame(animate);
      } else {
        // Ensure final value is exact
        onProgress(to);

        // Dispatch completion
        dispatch({ type: 'zoomComplete' });

        resolve();
      }
    }

    // Start animation
    requestAnimationFrame(animate);
  });
}
