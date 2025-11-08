/**
 * @file chart.integration.test.ts
 * Integration tests for chart state management and interactions
 *
 * These tests verify the full workflow of chart interactions including:
 * - Store creation and initialization
 * - Action dispatching and state updates
 * - Effect execution
 * - Multi-step interaction flows
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createStore } from '@composable-svelte/core';
import { chartReducer, createInitialChartState } from '../src/lib/reducers/chart.reducer';
import type { ChartState, ChartAction } from '../src/lib/types/chart.types';

describe('Chart Integration Tests', () => {
  const sampleData = [
    { date: new Date('2024-01-01'), value: 100, category: 'A' },
    { date: new Date('2024-01-02'), value: 120, category: 'B' },
    { date: new Date('2024-01-03'), value: 90, category: 'A' },
    { date: new Date('2024-01-04'), value: 150, category: 'C' },
    { date: new Date('2024-01-05'), value: 110, category: 'B' }
  ];

  describe('Store Initialization', () => {
    it('creates store with initial data', () => {
      const store = createStore({
        initialState: createInitialChartState({ data: sampleData }),
        reducer: chartReducer,
        dependencies: {}
      });

      expect(store.state.data).toEqual(sampleData);
      expect(store.state.filteredData).toEqual(sampleData);
      expect(store.state.selection.type).toBe('none');
    });

    it('creates store with custom dimensions', () => {
      const store = createStore({
        initialState: createInitialChartState({
          data: sampleData,
          dimensions: { width: 800, height: 600 }
        }),
        reducer: chartReducer,
        dependencies: {}
      });

      expect(store.state.dimensions).toEqual({ width: 800, height: 600 });
    });
  });

  describe('Data Filtering Workflow', () => {
    it('filters data and maintains original dataset', () => {
      const store = createStore({
        initialState: createInitialChartState({ data: sampleData }),
        reducer: chartReducer,
        dependencies: {}
      });

      // Filter to category A
      store.dispatch({
        type: 'filterData',
        predicate: (d: any) => d.category === 'A'
      });

      expect(store.state.filteredData.length).toBe(2);
      expect(store.state.data.length).toBe(5); // Original unchanged
      expect(store.state.filteredData.every((d: any) => d.category === 'A')).toBe(true);
    });

    it('clears filters and restores original data', () => {
      const store = createStore({
        initialState: createInitialChartState({ data: sampleData }),
        reducer: chartReducer,
        dependencies: {}
      });

      // Filter
      store.dispatch({
        type: 'filterData',
        predicate: (d: any) => d.value > 100
      });
      expect(store.state.filteredData.length).toBe(3);

      // Clear
      store.dispatch({ type: 'clearFilters' });
      expect(store.state.filteredData).toEqual(sampleData);
    });

    it('chains multiple filters', () => {
      const store = createStore({
        initialState: createInitialChartState({ data: sampleData }),
        reducer: chartReducer,
        dependencies: {}
      });

      // First filter
      store.dispatch({
        type: 'filterData',
        predicate: (d: any) => d.value > 90
      });
      expect(store.state.filteredData.length).toBe(4);

      // Apply to filtered data
      const filtered = store.state.filteredData;
      store.dispatch({
        type: 'setData',
        data: filtered
      });
      expect(store.state.data.length).toBe(4);
    });
  });

  describe('Selection Workflow', () => {
    it('selects single point', () => {
      const store = createStore({
        initialState: createInitialChartState({ data: sampleData }),
        reducer: chartReducer,
        dependencies: {}
      });

      store.dispatch({
        type: 'selectPoint',
        data: sampleData[2],
        index: 2
      });

      expect(store.state.selection.type).toBe('point');
      expect(store.state.selection.selectedData).toEqual([sampleData[2]]);
      expect(store.state.selection.selectedIndices).toEqual([2]);
    });

    it('selects range of points', () => {
      const store = createStore({
        initialState: createInitialChartState({ data: sampleData }),
        reducer: chartReducer,
        dependencies: {}
      });

      store.dispatch({
        type: 'selectRange',
        range: [1, 3]
      });

      expect(store.state.selection.type).toBe('range');
      expect(store.state.selection.selectedIndices).toEqual([1, 2, 3]);
      expect(store.state.selection.selectedData.length).toBe(3);
    });

    it('clears selection', () => {
      const store = createStore({
        initialState: createInitialChartState({ data: sampleData }),
        reducer: chartReducer,
        dependencies: {}
      });

      // Select
      store.dispatch({
        type: 'selectPoint',
        data: sampleData[0],
        index: 0
      });
      expect(store.state.selection.selectedIndices.length).toBe(1);

      // Clear
      store.dispatch({ type: 'clearSelection' });
      expect(store.state.selection.type).toBe('none');
      expect(store.state.selection.selectedData).toEqual([]);
      expect(store.state.selection.selectedIndices).toEqual([]);
    });
  });

  describe('Zoom/Pan Workflow', () => {
    it('updates zoom transform', () => {
      const store = createStore({
        initialState: createInitialChartState({ data: sampleData }),
        reducer: chartReducer,
        dependencies: {}
      });

      store.dispatch({
        type: 'zoom',
        transform: { x: 100, y: 50, k: 2 }
      });

      expect(store.state.transform).toEqual({ x: 100, y: 50, k: 2 });
    });

    it('initiates animated zoom', () => {
      const store = createStore({
        initialState: createInitialChartState({ data: sampleData }),
        reducer: chartReducer,
        dependencies: {}
      });

      store.dispatch({
        type: 'zoomAnimated',
        targetTransform: { x: 0, y: 0, k: 2 }
      });

      expect(store.state.isAnimating).toBe(true);
      expect(store.state.targetTransform).toEqual({ x: 0, y: 0, k: 2 });
    });

    it('completes animated zoom', () => {
      const store = createStore({
        initialState: createInitialChartState({ data: sampleData }),
        reducer: chartReducer,
        dependencies: {}
      });

      // Start animation
      store.dispatch({
        type: 'zoomAnimated',
        targetTransform: { x: 0, y: 0, k: 2 }
      });

      // Complete animation
      store.dispatch({ type: 'zoomComplete' });

      expect(store.state.isAnimating).toBe(false);
      expect(store.state.targetTransform).toBeUndefined();
    });

    it('resets zoom to identity', () => {
      const store = createStore({
        initialState: createInitialChartState({ data: sampleData }),
        reducer: chartReducer,
        dependencies: {}
      });

      // Zoom in
      store.dispatch({
        type: 'zoom',
        transform: { x: 100, y: 50, k: 3 }
      });

      // Reset
      store.dispatch({ type: 'resetZoom' });

      expect(store.state.isAnimating).toBe(true);
      expect(store.state.targetTransform).toEqual({ x: 0, y: 0, k: 1 });
    });
  });

  describe('Brush Selection Workflow', () => {
    it('starts brush', () => {
      const store = createStore({
        initialState: createInitialChartState({ data: sampleData }),
        reducer: chartReducer,
        dependencies: {}
      });

      store.dispatch({ type: 'brushStart' });

      expect(store.state.selection.type).toBe('brush');
    });

    it('moves brush extent', () => {
      const store = createStore({
        initialState: createInitialChartState({ data: sampleData }),
        reducer: chartReducer,
        dependencies: {}
      });

      store.dispatch({ type: 'brushStart' });
      store.dispatch({
        type: 'brushMove',
        extent: [[10, 20], [100, 150]]
      });

      expect(store.state.selection.brushExtent).toEqual([[10, 20], [100, 150]]);
    });

    it('ends brush', () => {
      const store = createStore({
        initialState: createInitialChartState({ data: sampleData }),
        reducer: chartReducer,
        dependencies: {}
      });

      store.dispatch({ type: 'brushStart' });
      store.dispatch({
        type: 'brushMove',
        extent: [[10, 20], [100, 150]]
      });
      store.dispatch({ type: 'brushEnd' });

      // State should remain (handled by component)
      expect(store.state.selection.type).toBe('brush');
    });
  });

  describe('Responsive Resize Workflow', () => {
    it('updates dimensions on resize', () => {
      const store = createStore({
        initialState: createInitialChartState({
          data: sampleData,
          dimensions: { width: 600, height: 400 }
        }),
        reducer: chartReducer,
        dependencies: {}
      });

      store.dispatch({
        type: 'resize',
        dimensions: { width: 800, height: 600 }
      });

      expect(store.state.dimensions).toEqual({ width: 800, height: 600 });
    });

    it('handles multiple resize events', () => {
      const store = createStore({
        initialState: createInitialChartState({ data: sampleData }),
        reducer: chartReducer,
        dependencies: {}
      });

      // Desktop
      store.dispatch({
        type: 'resize',
        dimensions: { width: 1200, height: 800 }
      });
      expect(store.state.dimensions.width).toBe(1200);

      // Tablet
      store.dispatch({
        type: 'resize',
        dimensions: { width: 768, height: 1024 }
      });
      expect(store.state.dimensions.width).toBe(768);

      // Mobile
      store.dispatch({
        type: 'resize',
        dimensions: { width: 375, height: 667 }
      });
      expect(store.state.dimensions.width).toBe(375);
    });
  });

  describe('Complex Interaction Workflows', () => {
    it('filters data then selects from filtered results', () => {
      const store = createStore({
        initialState: createInitialChartState({ data: sampleData }),
        reducer: chartReducer,
        dependencies: {}
      });

      // Filter to category A
      store.dispatch({
        type: 'filterData',
        predicate: (d: any) => d.category === 'A'
      });

      // Select first filtered item (index 0 of filtered data)
      const filteredItem = store.state.filteredData[0];
      store.dispatch({
        type: 'selectPoint',
        data: filteredItem,
        index: 0
      });

      expect(store.state.selection.selectedData).toEqual([filteredItem]);
      expect(store.state.filteredData.length).toBe(2);
    });

    it('zooms then filters data', () => {
      const store = createStore({
        initialState: createInitialChartState({ data: sampleData }),
        reducer: chartReducer,
        dependencies: {}
      });

      // Zoom
      store.dispatch({
        type: 'zoom',
        transform: { x: 50, y: 50, k: 2 }
      });

      // Then filter
      store.dispatch({
        type: 'filterData',
        predicate: (d: any) => d.value > 100
      });

      expect(store.state.transform.k).toBe(2);
      expect(store.state.filteredData.length).toBe(3);
    });

    it('selects range then clears then selects point', () => {
      const store = createStore({
        initialState: createInitialChartState({ data: sampleData }),
        reducer: chartReducer,
        dependencies: {}
      });

      // Range selection
      store.dispatch({
        type: 'selectRange',
        range: [0, 2]
      });
      expect(store.state.selection.selectedIndices.length).toBe(3);

      // Clear
      store.dispatch({ type: 'clearSelection' });
      expect(store.state.selection.selectedIndices.length).toBe(0);

      // Point selection
      store.dispatch({
        type: 'selectPoint',
        data: sampleData[4],
        index: 4
      });
      expect(store.state.selection.type).toBe('point');
      expect(store.state.selection.selectedIndices).toEqual([4]);
    });
  });

  describe('State Immutability', () => {
    it('does not mutate original data', () => {
      const originalData = [...sampleData];
      const store = createStore({
        initialState: createInitialChartState({ data: sampleData }),
        reducer: chartReducer,
        dependencies: {}
      });

      // Perform various operations
      store.dispatch({
        type: 'filterData',
        predicate: (d: any) => d.value > 100
      });
      store.dispatch({
        type: 'selectPoint',
        data: sampleData[0],
        index: 0
      });

      expect(store.state.data).toEqual(originalData);
      expect(sampleData).toEqual(originalData);
    });

    it('does not mutate state object', () => {
      const store = createStore({
        initialState: createInitialChartState({ data: sampleData }),
        reducer: chartReducer,
        dependencies: {}
      });

      const initialTransform = store.state.transform;

      store.dispatch({
        type: 'zoom',
        transform: { x: 100, y: 100, k: 2 }
      });

      // Original transform should be unchanged
      expect(initialTransform).toEqual({ x: 0, y: 0, k: 1 });
      expect(store.state.transform).toEqual({ x: 100, y: 100, k: 2 });
    });
  });
});
