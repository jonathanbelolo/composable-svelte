/**
 * @file chart.reducer.test.ts
 * Tests for the core chart reducer
 */

import { describe, it, expect } from 'vitest';
import { chartReducer, createInitialChartState } from '../src/lib/reducers/chart.reducer';

describe('chartReducer', () => {
  describe('setData', () => {
    it('sets data and filteredData', () => {
      const initialState = createInitialChartState({});
      const data = [
        { x: 1, y: 10 },
        { x: 2, y: 20 },
        { x: 3, y: 30 }
      ];

      const [newState] = chartReducer(
        initialState,
        { type: 'setData', data },
        {}
      );

      expect(newState.data).toEqual(data);
      expect(newState.filteredData).toEqual(data);
    });
  });

  describe('filterData', () => {
    it('filters data when filterData action dispatched', () => {
      const data = [
        { x: 1, y: 10 },
        { x: 2, y: 20 },
        { x: 3, y: 30 }
      ];

      const initialState = createInitialChartState({ data });

      const [newState] = chartReducer(
        initialState,
        { type: 'filterData', predicate: (d: any) => d.y > 15 },
        {}
      );

      expect(newState.filteredData).toEqual([
        { x: 2, y: 20 },
        { x: 3, y: 30 }
      ]);
      expect(newState.data).toEqual(data); // Original data unchanged
    });
  });

  describe('clearFilters', () => {
    it('resets filteredData to original data', () => {
      const data = [
        { x: 1, y: 10 },
        { x: 2, y: 20 }
      ];

      const initialState = createInitialChartState({ data });

      // First filter
      const [filteredState] = chartReducer(
        initialState,
        { type: 'filterData', predicate: (d: any) => d.y > 15 },
        {}
      );

      expect(filteredState.filteredData.length).toBe(1);

      // Then clear
      const [clearedState] = chartReducer(
        filteredState,
        { type: 'clearFilters' },
        {}
      );

      expect(clearedState.filteredData).toEqual(data);
    });
  });

  describe('selectPoint', () => {
    it('updates selection when selectPoint dispatched', () => {
      const data = [
        { x: 1, y: 10 },
        { x: 2, y: 20 }
      ];

      const initialState = createInitialChartState({ data });

      const [newState] = chartReducer(
        initialState,
        { type: 'selectPoint', data: data[1], index: 1 },
        {}
      );

      expect(newState.selection.type).toBe('point');
      expect(newState.selection.selectedData).toEqual([data[1]]);
      expect(newState.selection.selectedIndices).toEqual([1]);
    });
  });

  describe('clearSelection', () => {
    it('clears selection state', () => {
      const data = [{ x: 1, y: 10 }];
      const initialState = createInitialChartState({ data });

      // First select
      const [selectedState] = chartReducer(
        initialState,
        { type: 'selectPoint', data: data[0], index: 0 },
        {}
      );

      expect(selectedState.selection.selectedIndices.length).toBe(1);

      // Then clear
      const [clearedState] = chartReducer(
        selectedState,
        { type: 'clearSelection' },
        {}
      );

      expect(clearedState.selection.type).toBe('none');
      expect(clearedState.selection.selectedData).toEqual([]);
      expect(clearedState.selection.selectedIndices).toEqual([]);
    });
  });

  describe('zoom', () => {
    it('updates zoom transform', () => {
      const initialState = createInitialChartState({});

      const [newState] = chartReducer(
        initialState,
        { type: 'zoom', transform: { x: 10, y: 20, k: 2 } },
        {}
      );

      expect(newState.transform).toEqual({ x: 10, y: 20, k: 2 });
    });
  });

  describe('resetZoom', () => {
    it('initiates animated reset to identity transform', () => {
      const initialState = createInitialChartState({});

      // First zoom
      const [zoomedState] = chartReducer(
        initialState,
        { type: 'zoom', transform: { x: 10, y: 20, k: 2 } },
        {}
      );

      // Then reset - should initiate animation
      const [resetState] = chartReducer(
        zoomedState,
        { type: 'resetZoom' },
        {}
      );

      expect(resetState.isAnimating).toBe(true);
      expect(resetState.targetTransform).toEqual({ x: 0, y: 0, k: 1 });
      // Transform doesn't change immediately - component will animate
      expect(resetState.transform).toEqual({ x: 10, y: 20, k: 2 });
    });
  });

  // Tooltip tests removed - tooltips are now handled natively by Observable Plot

  describe('resize', () => {
    it('updates dimensions', () => {
      const initialState = createInitialChartState({});

      const [newState] = chartReducer(
        initialState,
        { type: 'resize', dimensions: { width: 800, height: 600 } },
        {}
      );

      expect(newState.dimensions).toEqual({ width: 800, height: 600 });
    });
  });

  describe('updateSpec', () => {
    it('updates plot specification', () => {
      const initialState = createInitialChartState({
        spec: { width: 600, height: 400 }
      });

      const [newState] = chartReducer(
        initialState,
        {
          type: 'updateSpec',
          spec: { marginLeft: 60, marginBottom: 40 }
        },
        {}
      );

      expect(newState.spec).toEqual({
        width: 600,
        height: 400,
        marginLeft: 60,
        marginBottom: 40
      });
    });
  });
});

describe('createInitialChartState', () => {
  it('creates initial state with defaults', () => {
    const state = createInitialChartState({});

    expect(state.data).toEqual([]);
    expect(state.filteredData).toEqual([]);
    expect(state.dimensions).toEqual({ width: 600, height: 400 });
    expect(state.selection.type).toBe('none');
    expect(state.transform).toEqual({ x: 0, y: 0, k: 1 });
    // Tooltip removed - handled by Observable Plot
    expect(state.isAnimating).toBe(false);
  });

  it('creates initial state with provided data', () => {
    const data = [{ x: 1, y: 10 }];
    const state = createInitialChartState({ data });

    expect(state.data).toEqual(data);
    expect(state.filteredData).toEqual(data);
  });

  it('creates initial state with custom dimensions', () => {
    const state = createInitialChartState({
      dimensions: { width: 800, height: 600 }
    });

    expect(state.dimensions).toEqual({ width: 800, height: 600 });
  });
});
