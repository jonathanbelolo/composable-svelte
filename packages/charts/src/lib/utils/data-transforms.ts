/**
 * @file data-transforms.ts
 * Data transformation utilities
 */

import type { DataTransform } from '../types/chart.types';

/**
 * Filter data by a predicate
 */
export function filter<T>(predicate: (d: T) => boolean): DataTransform<T> {
  return (data: T[]) => data.filter(predicate);
}

/**
 * Sort data by a field
 */
export function sortBy<T>(
  field: keyof T | ((d: T) => any),
  order: 'asc' | 'desc' = 'asc'
): DataTransform<T> {
  return (data: T[]) => {
    const sorted = [...data].sort((a, b) => {
      const aVal = typeof field === 'function' ? field(a) : a[field];
      const bVal = typeof field === 'function' ? field(b) : b[field];

      if (aVal < bVal) return order === 'asc' ? -1 : 1;
      if (aVal > bVal) return order === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  };
}

/**
 * Group data by a key
 */
export function groupBy<T>(
  key: keyof T | ((d: T) => string)
): Record<string, T[]> {
  return (data: T[]) => {
    const groups: Record<string, T[]> = {};

    data.forEach((item) => {
      const groupKey = typeof key === 'function' ? key(item) : String(item[key]);

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }

      groups[groupKey].push(item);
    });

    return groups;
  };
}

/**
 * Aggregate data
 */
export function aggregate<T>(
  operation: 'sum' | 'mean' | 'median' | 'count' | 'min' | 'max',
  field?: keyof T
): (data: T[]) => number {
  return (data: T[]) => {
    if (data.length === 0) return 0;

    if (operation === 'count') {
      return data.length;
    }

    const values = field
      ? data.map((d) => Number(d[field]))
      : data.map((d) => Number(d));

    switch (operation) {
      case 'sum':
        return values.reduce((acc, val) => acc + val, 0);

      case 'mean':
        return values.reduce((acc, val) => acc + val, 0) / values.length;

      case 'median': {
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0
          ? (sorted[mid - 1] + sorted[mid]) / 2
          : sorted[mid];
      }

      case 'min':
        return Math.min(...values);

      case 'max':
        return Math.max(...values);

      default:
        return 0;
    }
  };
}

/**
 * Compose multiple transforms
 */
export function compose<T>(...transforms: DataTransform<T>[]): DataTransform<T> {
  return (data: T[]) => {
    return transforms.reduce((acc, transform) => transform(acc), data);
  };
}
