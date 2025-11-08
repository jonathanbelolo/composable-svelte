/**
 * @file data-transforms.ts
 * @description
 * Composable data transformation utilities for chart data processing.
 * All transforms follow the functional pattern: (data: T[]) => T[] or Record<K, V>
 *
 * Transforms can be composed using the `compose()` function for declarative
 * data pipelines.
 *
 * @example
 * ```typescript
 * import { DataTransforms } from '@composable-svelte/charts';
 *
 * // Compose multiple transforms
 * const transform = DataTransforms.compose(
 *   DataTransforms.filter(d => d.value > 100),
 *   DataTransforms.sortBy('date', 'desc'),
 *   DataTransforms.topN(10, 'value')
 * );
 *
 * const result = transform(data);
 * ```
 */

import type { DataTransform } from '../types/chart.types';
import { bin as d3Bin, extent, mean as d3Mean, median as d3Median, sum as d3Sum } from 'd3-array';

/**
 * @function filter
 * @description
 * Creates a transform that filters data by a predicate function.
 *
 * @example
 * ```typescript
 * const filterHighValues = filter(d => d.value > 100);
 * const result = filterHighValues(data);
 * ```
 *
 * @template T - Type of data items
 * @param {(d: T) => boolean} predicate - Filter predicate
 * @returns {DataTransform<T>} Transform function
 */
export function filter<T>(predicate: (d: T) => boolean): DataTransform<T> {
  return (data: T[]) => data.filter(predicate);
}

/**
 * @function sortBy
 * @description
 * Creates a transform that sorts data by a field or accessor function.
 *
 * @example
 * ```typescript
 * // Sort by field
 * const sortByValue = sortBy('value', 'desc');
 *
 * // Sort by accessor
 * const sortByComputed = sortBy(d => d.x * d.y, 'asc');
 * ```
 *
 * @template T - Type of data items
 * @param {keyof T | ((d: T) => any)} field - Field name or accessor
 * @param {'asc' | 'desc'} [order='asc'] - Sort order
 * @returns {DataTransform<T>} Transform function
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
 * Returns a function that transforms data into groups
 */
export function groupBy<T>(
  key: keyof T | ((d: T) => string)
): (data: T[]) => Record<string, T[]> {
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
          ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
          : (sorted[mid] ?? 0);
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
 * @function compose
 * @description
 * Composes multiple transforms into a single transform function.
 * Transforms are applied left-to-right (first transform receives original data).
 *
 * This enables declarative data pipelines:
 * ```typescript
 * const pipeline = compose(
 *   filter(d => d.active),
 *   sortBy('date', 'desc'),
 *   topN(10, 'score')
 * );
 * const result = pipeline(data);
 * ```
 *
 * @example
 * ```typescript
 * // Filter, sort, then take top 5
 * const transform = compose(
 *   filter(d => d.category === 'A'),
 *   sortBy('value', 'desc'),
 *   topN(5, 'value')
 * );
 *
 * const result = transform(data);
 * // Result: Top 5 category A items by value
 * ```
 *
 * @template T - Type of data items
 * @param {...DataTransform<T>} transforms - Transform functions to compose
 * @returns {DataTransform<T>} Composed transform function
 */
export function compose<T>(...transforms: DataTransform<T>[]): DataTransform<T> {
  return (data: T[]) => {
    return transforms.reduce((acc, transform) => transform(acc), data);
  };
}

/**
 * @function binData
 * @description
 * Creates a transform that bins continuous data into discrete intervals.
 * Useful for creating histograms or grouping continuous values.
 *
 * Each data point is augmented with:
 * - `binIndex`: Index of the bin (0-based)
 * - `binStart`: Lower bound of the bin
 * - `binEnd`: Upper bound of the bin
 *
 * Uses D3's bin() under the hood for optimal bin calculation.
 *
 * @example
 * ```typescript
 * // Bin values into 10 equal intervals
 * const bin10 = binData('value', 10);
 * const binned = bin10(data);
 * // Each item now has binIndex, binStart, binEnd
 *
 * // Custom thresholds
 * const binCustom = binData('value', [0, 50, 100, 150]);
 * ```
 *
 * @template T - Type of data items
 * @param {keyof T | ((d: T) => number)} field - Field to bin or accessor
 * @param {number | number[]} thresholds - Number of bins or explicit thresholds
 * @returns Transform function that adds bin metadata
 */
export function binData<T>(
  field: keyof T | ((d: T) => number),
  thresholds: number | number[]
): (data: T[]) => Array<T & { binIndex: number; binStart: number; binEnd: number }> {
  return (data: T[]) => {
    const getValue = (d: T) => typeof field === 'function' ? field(d) : Number(d[field]);
    const values = data.map(getValue);
    const [min, max] = extent(values) as [number, number];

    // Create bins using D3
    const binner = d3Bin()
      .value((d: any) => d)
      .domain([min, max]);

    if (typeof thresholds === 'number') {
      binner.thresholds(thresholds);
    } else {
      binner.thresholds(thresholds);
    }

    const bins = binner(values);

    // Map original data to bins
    const binned: Array<T & { binIndex: number; binStart: number; binEnd: number }> = [];

    data.forEach((d, i) => {
      const value = values[i];
      if (value === undefined || value === null) return;

      const binIndex = bins.findIndex(bin => {
        return value >= (bin.x0 ?? -Infinity) && value < (bin.x1 ?? Infinity);
      });

      if (binIndex !== -1 && bins[binIndex]) {
        binned.push({
          ...d,
          binIndex,
          binStart: bins[binIndex].x0 ?? 0,
          binEnd: bins[binIndex].x1 ?? 0
        });
      }
    });

    return binned;
  };
}

/**
 * Rolling window aggregation
 * Applies operation to sliding window of data
 */
export function rollup<T>(
  window: number,
  field: keyof T | ((d: T) => number),
  operation: (values: number[]) => number | undefined = d3Mean
): (data: T[]) => Array<T & { rollingValue: number }> {
  return (data: T[]) => {
    const getValue = (d: T) => typeof field === 'function' ? field(d) : Number(d[field]);

    return data.map((d, i) => {
      // Get window of values
      const start = Math.max(0, i - window + 1);
      const windowData = data.slice(start, i + 1);
      const values = windowData.map(getValue);

      // Apply operation
      const rollingValue = operation(values) ?? 0;

      return {
        ...d,
        rollingValue
      };
    });
  };
}

/**
 * Top N items by field
 */
export function topN<T>(
  n: number,
  field: keyof T | ((d: T) => number)
): DataTransform<T> {
  return (data: T[]) => {
    const getValue = (d: T) => typeof field === 'function' ? field(d) : Number(d[field]);

    return [...data]
      .sort((a, b) => getValue(b) - getValue(a))
      .slice(0, n);
  };
}

/**
 * Remove duplicates by field
 */
export function unique<T>(field: keyof T | ((d: T) => any)): DataTransform<T> {
  return (data: T[]) => {
    const getValue = (d: T) => typeof field === 'function' ? field(d) : d[field];
    const seen = new Set();

    return data.filter(d => {
      const value = getValue(d);
      if (seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    });
  };
}

/**
 * Sample random subset of data
 */
export function sample<T>(n: number): DataTransform<T> {
  return (data: T[]) => {
    if (n >= data.length) return [...data];

    const sampled: T[] = [];
    const indices = new Set<number>();

    while (indices.size < n) {
      const index = Math.floor(Math.random() * data.length);
      if (!indices.has(index)) {
        indices.add(index);
        const item = data[index];
        if (item !== undefined) {
          sampled.push(item);
        }
      }
    }

    return sampled;
  };
}

/**
 * Pre-built transform pipeline helpers
 */
export const DataTransforms = {
  filter,
  groupBy,
  aggregate,
  sortBy,
  binData,
  rollup,
  compose,
  topN,
  unique,
  sample
};
