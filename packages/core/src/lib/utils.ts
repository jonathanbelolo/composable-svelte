/**
 * Utility functions for component implementation.
 */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind CSS classes without conflicts.
 *
 * Combines clsx (conditional class handling) with tailwind-merge (deduplication).
 * Later classes override earlier ones when there are conflicts.
 *
 * @example
 * ```typescript
 * cn('px-2 py-1', 'px-4')
 * // → 'py-1 px-4' (px-4 overrides px-2)
 *
 * cn('text-red-500', condition && 'text-blue-500')
 * // → 'text-blue-500' (if condition is true)
 *
 * cn('bg-background', className)
 * // → merges user's className, allowing overrides
 * ```
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
