/**
 * @file data-transforms.ts
 * Data transformation utilities for chart data processing
 * Supports filtering, grouping, aggregation, sorting, binning, and rolling windows
 */

import type { DataTransform } from '../types/chart.types';
import { bin as d3Bin, extent, mean as d3Mean, median as d3Median, sum as d3Sum } from 'd3-array';

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
 * Compose multiple transforms
 */
export function compose<T>(...transforms: DataTransform<T>[]): DataTransform<T> {
  return (data: T[]) => {
    return transforms.reduce((acc, transform) => transform(acc), data);
  };
}

/**
 * Bin data into discrete intervals (for histograms)
 * Returns binned data with added bin metadata
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
