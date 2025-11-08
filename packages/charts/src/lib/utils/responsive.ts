/**
 * @file responsive.ts
 * Utilities for responsive chart sizing
 */

import type { Dispatch } from '@composable-svelte/core';
import type { ChartAction } from '../types/chart.types';

/**
 * Create a ResizeObserver to watch container size changes
 * and dispatch resize actions to the store
 */
export function createResizeObserver<T>(
  element: HTMLElement,
  dispatch: Dispatch<ChartAction<T>>
): ResizeObserver {
  // Track previous dimensions to avoid dispatching when unchanged
  let previousWidth = 0;
  let previousHeight = 0;

  const observer = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (!entry) return;

    const { width, height } = entry.contentRect;
    const newWidth = Math.floor(width);
    const newHeight = Math.floor(height);

    // Only dispatch if dimensions actually changed
    if (newWidth !== previousWidth || newHeight !== previousHeight) {
      previousWidth = newWidth;
      previousHeight = newHeight;

      dispatch({
        type: 'resize',
        dimensions: {
          width: newWidth,
          height: newHeight
        }
      });
    }
  });

  observer.observe(element);

  return observer;
}

/**
 * Calculate responsive dimensions based on container and aspect ratio
 */
export function calculateDimensions(
  container: HTMLElement,
  aspectRatio?: number
): { width: number; height: number } {
  const rect = container.getBoundingClientRect();
  const width = Math.floor(rect.width);

  let height = Math.floor(rect.height);

  // If aspect ratio is provided and height is 0, calculate from width
  if (aspectRatio && height === 0) {
    height = Math.floor(width / aspectRatio);
  }

  // Default height if both are 0
  if (height === 0) {
    height = 400;
  }

  return { width, height };
}

/**
 * Debounce resize events to avoid too many dispatches
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delay);
  };
}
