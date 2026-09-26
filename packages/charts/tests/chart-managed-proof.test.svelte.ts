/**
 * @file chart-managed-proof.test.svelte.ts
 * Charts Managed Proof Tests for Maps/Graphics/Charts lane.
 *
 * Verifies:
 * 1. Production-captured ChildView from actual defineViews/FeatureViews/FeatureOutlet
 *    drives Chart / ChartPrimitive via narrow structural ChartStore with zero per-widget
 *    store creation, zero fabricated authority, and fully typed capture pipeline.
 * 2. Strict ComponentProps typing check against actual public component props with generic row typing.
 * 3. Prompt retirement lifecycle on owner retirement BEFORE DOM unmount:
 *    - Animation RAF cancelled (cancelAnimationFrame / AbortController)
 *    - d3 zoom / brush listeners detached (.on('.zoom', null), .on('.brush', null))
 *    - ResizeObserver disconnected
 *    - Pending SVG attachment timer cleared (clearTimeout)
 *    - Plot DOM element removed from container
 * 4. Idempotent cleanup: subsequent DOM unmount does not double-destroy or throw.
 * 5. One business route: typed child action dispatch into parent reducer (selectPoint,
 *    selectPoints, zoom) and full gating/suppression of callbacks after retirement.
 * 6. Same-ID replacement: captures new view, isolates state, cleans up old instance,
 *    and stale actions from old instance cannot mutate new view.
 * 7. Two siblings isolation: two managed charts mount simultaneously under a single root store,
 *    state and dispatches are isolated, retiring one cleans up its resources while the other continues.
 * 8. Retired-at-mount handling: passing an already-retired view schedules no work and throws no errors.
 * 9. Preserved standalone Store API with createStore, typed accessors, and selection callback.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync, type ComponentProps } from 'svelte';
import { createStore, type Store } from '@composable-svelte/core';
import type { ChildView, ApplicationInstance } from '@composable-svelte/core/application';
import { select } from 'd3-selection';

import Chart from '../src/lib/components/Chart.svelte';
import ChartPrimitive from '../src/lib/components/ChartPrimitive.svelte';
import { chartReducer, createInitialChartState } from '../src/lib/reducers/chart.reducer.js';
import type {
  ChartState,
  ChartAction,
  ChartStore,
  ChartConfig,
  ChartAccessor,
  ZoomTransform
} from '../src/lib/types/chart.types.js';

import ManagedChartRecipeApp from './fixtures/ManagedChartRecipeApp.svelte';
import StandaloneChartHost from './fixtures/StandaloneChartHost.svelte';
import StandalonePrimitiveHost from './fixtures/StandalonePrimitiveHost.svelte';
import {
  type AppState,
  type AppAction,
  type MetricRow,
  defaultRows,
  replacementRows
} from './fixtures/managed-chart-recipe-model.js';

const settle = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms));

function retirableChartStore(initialRows: MetricRow[]) {
  const backing = createStore({
    initialState: createInitialChartState<MetricRow>({ data: initialRows }),
    reducer: chartReducer<MetricRow>,
    dependencies: {}
  });
  let retired = false;
  const listeners = new Set<(state: ChartState<MetricRow> | undefined) => void>();
  const store: ChartStore<MetricRow> = {
    get state() { return retired ? undefined : backing.state; },
    dispatch(action) { if (!retired) backing.dispatch(action); },
    subscribe(listener) {
      listeners.add(listener);
      const stop = backing.subscribe(state => { if (!retired) listener(state); });
      return () => { listeners.delete(listener); stop(); };
    }
  };
  return { store, retire() { retired = true; for (const listener of [...listeners]) listener(undefined); } };
}

/**
 * Give jsdom the SVG geometry properties d3-brush's defaultExtent reads
 */
function shimSvgGeometry() {
  const proto = (globalThis as any).SVGSVGElement?.prototype;
  if (!proto || 'width' in proto) return;

  const lengthFrom = (el: Element, attr: string, fallback: number) => ({
    baseVal: { value: Number(el.getAttribute(attr)) || fallback }
  });

  Object.defineProperty(proto, 'width', {
    configurable: true,
    get(this: Element) {
      return lengthFrom(this, 'width', 640);
    }
  });
  Object.defineProperty(proto, 'height', {
    configurable: true,
    get(this: Element) {
      return lengthFrom(this, 'height', 400);
    }
  });
  Object.defineProperty(proto, 'viewBox', {
    configurable: true,
    get(this: Element) {
      const [x = 0, y = 0, width = 640, height = 400] = (
        this.getAttribute('viewBox') ?? ''
      )
        .split(/[\s,]+/)
        .filter(Boolean)
        .map(Number);
      return { baseVal: { x, y, width, height } };
    }
  });
}

shimSvgGeometry();

// Track ResizeObserver instances and calls
interface MockRO {
  observe: ReturnType<typeof vi.fn>;
  unobserve: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  callback: ResizeObserverCallback;
}

let activeObservers: MockRO[] = [];
const originalResizeObserver = (globalThis as any).ResizeObserver;

function setupResizeObserverMock() {
  activeObservers = [];
  (globalThis as any).ResizeObserver = class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
      activeObservers.push(this);
    }
  };
}

let cleanupFns: Array<() => void> = [];

beforeEach(() => {
  setupResizeObserverMock();
});

afterEach(() => {
  for (const fn of cleanupFns) {
    try {
      fn();
    } catch {
      // ignore in cleanup
    }
  }
  cleanupFns = [];
  (globalThis as any).ResizeObserver = originalResizeObserver;
  vi.restoreAllMocks();
});

describe('Charts Managed Proof', () => {
  it('builds one plot per store dispatch and one per prop change', () => {
    const backing = createStore({
      initialState: createInitialChartState<MetricRow>({ data: defaultRows }),
      reducer: chartReducer<MetricRow>,
      dependencies: {}
    });
    let config = $state<ChartConfig<MetricRow> & { type: 'scatter' }>({ type: 'scatter', x: 'x', y: 'y' });
    const plotBuilder = vi.fn(() => document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
    const target = document.createElement('div');
    document.body.appendChild(target);
    const component = mount(StandalonePrimitiveHost, {
      target,
      props: { store: backing, get config() { return config; }, plotBuilder }
    });
    cleanupFns.push(() => { unmount(component); target.remove(); });
    flushSync();
    expect(plotBuilder).toHaveBeenCalledTimes(1);
    plotBuilder.mockClear();
    backing.dispatch({ type: 'selectPoint', data: defaultRows[0], index: 0 });
    flushSync();
    expect(plotBuilder).toHaveBeenCalledTimes(1);
    plotBuilder.mockClear();
    config = { ...config, y: 'y' };
    flushSync();
    expect(plotBuilder).toHaveBeenCalledTimes(1);
  });

  it('rebinds a live chart when its store prop changes and ignores predecessor retirement', async () => {
    const first = retirableChartStore(defaultRows);
    const successor = retirableChartStore(replacementRows);
    let active = $state<ChartStore<MetricRow>>(first.store);
    const target = document.createElement('div');
    document.body.appendChild(target);
    const component = mount(StandaloneChartHost, {
      target,
      props: { get store() { return active; }, enableZoom: true }
    });
    cleanupFns.push(() => { unmount(component); target.remove(); });
    flushSync();
    await settle();
    active = successor.store;
    flushSync();
    await settle();
    expect(target.querySelectorAll('.chart-primitive svg circle')).toHaveLength(2);
    first.retire();
    expect(successor.store.state).toBeDefined();
    expect(target.querySelectorAll('.chart-primitive svg circle')).toHaveLength(2);
    successor.store.dispatch({ type: 'setData', data: [replacementRows[0]] });
    flushSync();
    await settle();
    expect(target.querySelectorAll('.chart-primitive svg circle')).toHaveLength(1);
    const svg = target.querySelector('svg');
    expect(svg).not.toBeNull();
    await settle();
    svg!.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100 }));
    await settle();
    expect(successor.store.state?.transform.k).toBeGreaterThan(1);
  });

  it('does not report an empty selection from a retired store while its host remains mounted', () => {
    const binding = retirableChartStore(defaultRows);
    const onSelectionChange = vi.fn<(rows: MetricRow[]) => void>();
    const target = document.createElement('div');
    document.body.appendChild(target);
    const component = mount(StandaloneChartHost, {
      target,
      props: { store: binding.store, onSelectionChange }
    });
    cleanupFns.push(() => { unmount(component); target.remove(); });
    flushSync();
    binding.store.dispatch({ type: 'selectPoint', data: defaultRows[0], index: 0 });
    flushSync();
    expect(onSelectionChange).toHaveBeenCalledWith([defaultRows[0]]);
    onSelectionChange.mockClear();
    binding.retire();
    expect(target.querySelector('[data-testid="standalone-chart-host"]')).not.toBeNull();
    flushSync();
    expect(target.querySelector('[data-testid="standalone-chart-host"]')).not.toBeNull();
    expect(onSelectionChange).not.toHaveBeenCalled();
  });
  // ==========================================================================
  // Proof 1: Production ChildView drives Chart & ChartPrimitive
  // ==========================================================================
  describe('Proof 1: Production ChildView drives Chart / ChartPrimitive via narrow structural ChartStore', () => {
    it('captures genuine ChildView from FeatureOutlet and drives Chart and ChartPrimitive with zero casts', async () => {
      let capturedView: ChildView<ChartState<MetricRow>, ChartAction<MetricRow>> | null = null;
      let appInstance: ApplicationInstance<AppState, AppAction> | null = null;
      const target = document.createElement('div');
      document.body.appendChild(target);

      const component = mount(ManagedChartRecipeApp, {
        target,
        props: {
          onCaptureChart: (view) => {
            capturedView = view;
          },
          onApp: (app) => {
            appInstance = app;
          }
        }
      });
      cleanupFns.push(() => {
        unmount(component);
        target.remove();
      });
      flushSync();
      await settle();

      expect(capturedView).not.toBeNull();
      expect(appInstance).not.toBeNull();

      // Narrow structural ChartStore typecheck without casts
      const _chartStore: ComponentProps<typeof Chart<MetricRow>>['store'] = capturedView!;
      const _primitiveStore: ComponentProps<typeof ChartPrimitive<MetricRow>>['store'] = capturedView!;
      expect(_chartStore).toBe(capturedView);
      expect(_primitiveStore).toBe(capturedView);

      // Verify DOM rendering
      const chartFeature = target.querySelector('[data-testid="managed-chart-feature"]');
      expect(chartFeature).not.toBeNull();
      const chartContainer = target.querySelector('.chart-container');
      expect(chartContainer).not.toBeNull();
      const applicationRole = target.querySelector('[role="application"]');
      expect(applicationRole).not.toBeNull();
      const table = target.querySelector('table');
      expect(table).not.toBeNull();

      // Initial state verified
      expect(capturedView!.state?.data).toEqual(defaultRows);
      expect(capturedView!.state?.filteredData).toHaveLength(3);
    });
  });

  // ==========================================================================
  // Proof 2: Prompt retirement lifecycle on owner retirement before DOM unmount
  // ==========================================================================
  describe('Proof 2: Prompt retirement lifecycle before DOM unmount', () => {
    it('promptly disconnects ResizeObserver on owner retirement before DOM unmount', async () => {
      let capturedView: ChildView<ChartState<MetricRow>, ChartAction<MetricRow>> | null = null;
      let appInstance: ApplicationInstance<AppState, AppAction> | null = null;
      const target = document.createElement('div');
      document.body.appendChild(target);

      const component = mount(ManagedChartRecipeApp, {
        target,
        props: {
          onCaptureChart: (view) => {
            capturedView = view;
          },
          onApp: (app) => {
            appInstance = app;
          }
        }
      });
      cleanupFns.push(() => {
        unmount(component);
        target.remove();
      });
      flushSync();
      await settle();

      expect(activeObservers.length).toBeGreaterThan(0);
      const observer = activeObservers[0];
      if (!observer) throw new Error('Expected observer');
      expect(observer.disconnect).not.toHaveBeenCalled();

      // Close the chart in application state
      appInstance!.store.dispatch({ type: 'closeChart' });

      // Chart is retired: state is undefined
      expect(capturedView!.state).toBeUndefined();

      // Assert ResizeObserver disconnect happened PROMPTLY BEFORE DOM unmount
      expect(observer.disconnect).toHaveBeenCalledTimes(1);
      expect(target.querySelector('[data-testid="managed-chart-feature"]')).not.toBeNull();
      flushSync();

      // Verify host container is still in DOM until parent unmounts
      expect(target.querySelector('[data-testid="chart-outlet"]')).not.toBeNull();
    });

    it('promptly cancels pending SVG attachment timer and removes plot DOM on retirement', async () => {
      const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
      const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
      let capturedView: ChildView<ChartState<MetricRow>, ChartAction<MetricRow>> | null = null;
      let appInstance: ApplicationInstance<AppState, AppAction> | null = null;
      const target = document.createElement('div');
      document.body.appendChild(target);

      const component = mount(ManagedChartRecipeApp, {
        target,
        props: {
          onCaptureChart: (view) => {
            capturedView = view;
          },
          onApp: (app) => {
            appInstance = app;
          }
        }
      });
      cleanupFns.push(() => {
        unmount(component);
        target.remove();
      });
      flushSync();

      // Before retirement, SVG or plot element exists
      const primitive = target.querySelector('.chart-primitive');
      expect(primitive).not.toBeNull();
      const attachmentTimerId = setTimeoutSpy.mock.results.at(-1)?.value;
      expect(attachmentTimerId).toBeDefined();
      const clearedBefore = clearTimeoutSpy.mock.calls.length;

      // Promptly retire
      appInstance!.store.dispatch({ type: 'closeChart' });

      // Terminal state confirmed
      expect(capturedView!.state).toBeUndefined();

      // Pending attachment timer cleared
      expect(clearTimeoutSpy.mock.calls.length).toBeGreaterThan(clearedBefore);
      expect(clearTimeoutSpy).toHaveBeenCalledWith(attachmentTimerId);

      // Plot element removed from container
      expect(primitive!.isConnected).toBe(true);
      expect(primitive!.querySelector('svg')).toBeNull();
      flushSync();
    });

    it('promptly aborts animation and cancels animation RAF on retirement', async () => {
      const rafSpy = vi.spyOn(window, 'requestAnimationFrame');
      const cancelRafSpy = vi.spyOn(window, 'cancelAnimationFrame');
      let capturedView: ChildView<ChartState<MetricRow>, ChartAction<MetricRow>> | null = null;
      let appInstance: ApplicationInstance<AppState, AppAction> | null = null;
      const target = document.createElement('div');
      document.body.appendChild(target);

      const component = mount(ManagedChartRecipeApp, {
        target,
        props: {
          onCaptureChart: (view) => {
            capturedView = view;
          },
          onApp: (app) => {
            appInstance = app;
          }
        }
      });
      cleanupFns.push(() => {
        unmount(component);
        target.remove();
      });
      flushSync();
      await settle();

      // Start an animated zoom transition
      capturedView!.dispatch({ type: 'zoomIn' });
      flushSync();

      // Verify animation state is active
      expect(capturedView!.state?.isAnimating).toBe(true);
      const animationFrameId = rafSpy.mock.results.at(-1)?.value;
      expect(animationFrameId).toBeDefined();

      // Promptly close chart while animation is in flight
      const cancelledBefore = cancelRafSpy.mock.calls.length;
      appInstance!.store.dispatch({ type: 'closeChart' });

      expect(capturedView!.state).toBeUndefined();
      // cancelAnimationFrame was called via AbortController abort
      expect(cancelRafSpy.mock.calls.length).toBeGreaterThan(cancelledBefore);
      expect(cancelRafSpy).toHaveBeenCalledWith(animationFrameId);
      flushSync();
    });

    it('promptly detaches d3 zoom event listeners on owner retirement', async () => {
      let capturedView: ChildView<ChartState<MetricRow>, ChartAction<MetricRow>> | null = null;
      let appInstance: ApplicationInstance<AppState, AppAction> | null = null;
      const target = document.createElement('div');
      document.body.appendChild(target);

      const component = mount(ManagedChartRecipeApp, {
        target,
        props: {
          enableZoom: true,
          enableBrush: false,
          onCaptureChart: (view) => {
            capturedView = view;
          },
          onApp: (app) => {
            appInstance = app;
          }
        }
      });
      cleanupFns.push(() => {
        unmount(component);
        target.remove();
      });
      flushSync();
      await settle(60);

      const svg = target.querySelector('svg');
      expect(svg).not.toBeNull();
      // d3 attaches zoom behavior to svg
      expect((svg as any).__zoom).toBeDefined();

      // Retire chart
      appInstance!.store.dispatch({ type: 'closeChart' });

      expect(capturedView!.state).toBeUndefined();
      expect(svg!.isConnected).toBe(false);
      expect(select(svg!).on('wheel.zoom')).toBeUndefined();
      flushSync();
      // Plot is removed from DOM container, and any zoom listeners detached
      expect(target.querySelector('svg')).toBeNull();
    });

    it('promptly detaches d3 brush event listeners and removes brush group on owner retirement', async () => {
      let capturedView: ChildView<ChartState<MetricRow>, ChartAction<MetricRow>> | null = null;
      let appInstance: ApplicationInstance<AppState, AppAction> | null = null;
      const target = document.createElement('div');
      document.body.appendChild(target);

      const component = mount(ManagedChartRecipeApp, {
        target,
        props: {
          enableZoom: false,
          enableBrush: true,
          onCaptureChart: (view) => {
            capturedView = view;
          },
          onApp: (app) => {
            appInstance = app;
          }
        }
      });
      cleanupFns.push(() => {
        unmount(component);
        target.remove();
      });
      flushSync();
      await settle(60);

      const svg = target.querySelector('svg');
      expect(svg).not.toBeNull();
      const brushGroup = target.querySelector('.cs-brush');
      expect(brushGroup).not.toBeNull();

      // Retire chart
      appInstance!.store.dispatch({ type: 'closeChart' });

      expect(capturedView!.state).toBeUndefined();
      expect(svg!.isConnected).toBe(false);
      expect(select(brushGroup!).on('mousedown.brush')).toBeUndefined();
      flushSync();
      expect(target.querySelector('.cs-brush')).toBeNull();
      expect(target.querySelector('svg')).toBeNull();
    });

    it('subsequent DOM unmount is completely idempotent', async () => {
      let appInstance: ApplicationInstance<AppState, AppAction> | null = null;
      const target = document.createElement('div');
      document.body.appendChild(target);

      const component = mount(ManagedChartRecipeApp, {
        target,
        props: {
          onApp: (app) => {
            appInstance = app;
          }
        }
      });
      flushSync();
      await settle();

      const observer = activeObservers[0];
      if (!observer) throw new Error('Expected observer');
      // Retire first
      appInstance!.store.dispatch({ type: 'closeChart' });
      flushSync();
      expect(observer.disconnect).toHaveBeenCalledTimes(1);

      // Now unmount DOM
      expect(() => {
        unmount(component);
        target.remove();
      }).not.toThrow();

      // No double disconnect or crash
      expect(observer.disconnect).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // Proof 3: Typed child action dispatch into parent reducer
  // ==========================================================================
  describe('Proof 3: Typed child actions into parent reducer & callback gating', () => {
    it('dispatches selectPoint, selectPoints, and zoom through ChildView to parent reducer', async () => {
      let capturedView: ChildView<ChartState<MetricRow>, ChartAction<MetricRow>> | null = null;
      let appInstance: ApplicationInstance<AppState, AppAction> | null = null;
      let callbackSelection: MetricRow[] | null = null;
      const target = document.createElement('div');
      document.body.appendChild(target);

      const component = mount(ManagedChartRecipeApp, {
        target,
        props: {
          onCaptureChart: (view) => {
            capturedView = view;
          },
          onApp: (app) => {
            appInstance = app;
          },
          onSelectionChange: (selection) => {
            callbackSelection = selection;
          }
        }
      });
      cleanupFns.push(() => {
        unmount(component);
        target.remove();
      });
      flushSync();
      await settle();

      // 1. selectPoint
      capturedView!.dispatch({ type: 'selectPoint', data: defaultRows[1], index: 1 });
      flushSync();
      await settle();

      expect(appInstance!.store.state.lastSelection).toEqual([defaultRows[1]]);
      expect(callbackSelection).toEqual([defaultRows[1]]);

      // 2. selectPoints
      capturedView!.dispatch({ type: 'selectPoints', indices: [0, 2] });
      flushSync();
      await settle();

      expect(appInstance!.store.state.lastSelection).toEqual([defaultRows[0], defaultRows[2]]);
      expect(callbackSelection).toEqual([defaultRows[0], defaultRows[2]]);

      // 3. zoom
      const targetTransform: ZoomTransform = { k: 2.5, x: 100, y: 150 };
      capturedView!.dispatch({ type: 'zoom', transform: targetTransform });
      flushSync();

      expect(appInstance!.store.state.lastZoom).toEqual(targetTransform);
    });

    it('gates and suppresses onSelectionChange after owner retirement', async () => {
      let capturedView: ChildView<ChartState<MetricRow>, ChartAction<MetricRow>> | null = null;
      let appInstance: ApplicationInstance<AppState, AppAction> | null = null;
      let selectionCallCount = 0;
      const target = document.createElement('div');
      document.body.appendChild(target);

      const component = mount(ManagedChartRecipeApp, {
        target,
        props: {
          onCaptureChart: (view) => {
            capturedView = view;
          },
          onApp: (app) => {
            appInstance = app;
          },
          onSelectionChange: () => {
            selectionCallCount++;
          }
        }
      });
      cleanupFns.push(() => {
        unmount(component);
        target.remove();
      });
      flushSync();
      await settle();

      // Initial change
      capturedView!.dispatch({ type: 'selectPoint', data: defaultRows[0], index: 0 });
      flushSync();
      await settle();
      const countBeforeRetire = selectionCallCount;
      expect(countBeforeRetire).toBeGreaterThanOrEqual(1);

      // Retire chart
      appInstance!.store.dispatch({ type: 'closeChart' });
      flushSync();
      await settle();

      // Any attempt to dispatch or trigger after retirement does not invoke callback
      capturedView!.dispatch({ type: 'selectPoint', data: defaultRows[2], index: 2 });
      flushSync();
      await settle();

      expect(selectionCallCount).toBe(countBeforeRetire);
    });
  });

  // ==========================================================================
  // Proof 4: Same-ID replacement under slot 'chart'
  // ==========================================================================
  describe('Proof 4: Same-ID replacement under slot chart', () => {
    it('captures new view with replacement data and cleans up old instance', async () => {
      let capturedViews: Array<ChildView<ChartState<MetricRow>, ChartAction<MetricRow>>> = [];
      let appInstance: ApplicationInstance<AppState, AppAction> | null = null;
      const target = document.createElement('div');
      document.body.appendChild(target);

      const component = mount(ManagedChartRecipeApp, {
        target,
        props: {
          onCaptureChart: (view) => {
            capturedViews.push(view);
          },
          onApp: (app) => {
            appInstance = app;
          }
        }
      });
      cleanupFns.push(() => {
        unmount(component);
        target.remove();
      });
      flushSync();
      await settle();

      expect(capturedViews.length).toBe(1);
      const firstView = capturedViews[0];
      if (!firstView) throw new Error('Expected first view');
      expect(firstView.state?.data).toEqual(defaultRows);
      const firstSvg = target.querySelector('main svg');
      expect(firstSvg).not.toBeNull();
      const firstObserver = activeObservers[0];
      expect(firstObserver).toBeDefined();

      // Replace chart with new replacementRows under same slot
      appInstance!.store.dispatch({ type: 'replaceChart', data: replacementRows });
      expect(firstView.state).toBeUndefined();
      expect(firstSvg!.isConnected).toBe(false);
      expect(select(firstSvg!).on('wheel.zoom')).toBeUndefined();
      expect(firstObserver!.disconnect).toHaveBeenCalledTimes(1);
      flushSync();
      await settle();

      expect(capturedViews.length).toBe(2);
      const secondView = capturedViews[1];
      if (!secondView) throw new Error('Expected second view');

      // First view received terminal undefined
      expect(firstView.state).toBeUndefined();

      // Second view is active with replacement data
      expect(secondView.state).toBeDefined();
      expect(secondView.state?.data).toEqual(replacementRows);
      const secondSvg = target.querySelector('main svg');
      expect(secondSvg).not.toBeNull();
      expect(secondSvg).not.toBe(firstSvg);

      // Stale dispatch on old view is safely ignored
      firstView.dispatch({ type: 'selectPoint', data: defaultRows[0], index: 0 });
      flushSync();
      expect(appInstance!.store.state.chart?.selection.selectedData).toEqual([]);
    });
  });

  // ==========================================================================
  // Proof 5: Sibling charts isolation and surviving sibling operation
  // ==========================================================================
  describe('Proof 5: Sibling charts isolation and surviving sibling operation', () => {
    it('runs two charts simultaneously under one root, retiring one leaves the other functional', async () => {
      let chartAView: ChildView<ChartState<MetricRow>, ChartAction<MetricRow>> | null = null;
      let chartBView: ChildView<ChartState<MetricRow>, ChartAction<MetricRow>> | null = null;
      let appInstance: ApplicationInstance<AppState, AppAction> | null = null;
      const target = document.createElement('div');
      document.body.appendChild(target);

      const component = mount(ManagedChartRecipeApp, {
        target,
        props: {
          onCaptureChart: (view) => {
            chartAView = view;
          },
          onCaptureSidebar: (view) => {
            chartBView = view;
          },
          onApp: (app) => {
            appInstance = app;
          }
        }
      });
      cleanupFns.push(() => {
        unmount(component);
        target.remove();
      });
      flushSync();

      // Open both charts
      appInstance!.store.dispatch({ type: 'openBothCharts' });
      flushSync();
      await settle();

      expect(chartAView).not.toBeNull();
      expect(chartBView).not.toBeNull();
      expect(chartAView!.state?.data).toEqual(defaultRows);
      expect(chartBView!.state?.data).toEqual(replacementRows);

      // Both rendered in DOM
      expect(target.querySelector('[data-testid="managed-chart-feature"]')).not.toBeNull();
      expect(target.querySelector('[data-testid="managed-sidebar-chart-feature"]')).not.toBeNull();
      const svgA = target.querySelector('main svg');
      const svgB = target.querySelector('aside svg');
      expect(svgA).not.toBeNull();
      expect(svgB).not.toBeNull();
      expect(select(svgB!).on('wheel.zoom')).toBeDefined();
      const observerCount = activeObservers.length;
      expect(observerCount).toBeGreaterThanOrEqual(2);

      // Close Chart A only
      appInstance!.store.dispatch({ type: 'closeChartA' });
      expect(chartAView!.state).toBeUndefined();
      expect(svgA!.isConnected).toBe(false);
      expect(select(svgA!).on('wheel.zoom')).toBeUndefined();
      expect(svgB!.isConnected).toBe(true);
      expect(select(svgB!).on('wheel.zoom')).toBeDefined();
      expect(activeObservers.filter(observer => observer.disconnect.mock.calls.length === 0)).toHaveLength(1);
      flushSync();
      await settle();

      // Chart A is retired
      expect(chartAView!.state).toBeUndefined();

      // Chart B is still active and operational
      expect(chartBView!.state).toBeDefined();
      expect(chartBView!.state?.data).toEqual(replacementRows);
      expect(target.querySelector('[data-testid="managed-sidebar-chart-feature"]')).not.toBeNull();
      expect(target.querySelector('aside svg')).toBe(svgB);
      const zoomBefore = chartBView!.state!.transform.k;
      svgA!.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100 }));
      await settle();
      expect(chartBView!.state!.transform.k).toBe(zoomBefore);
      svgB!.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100 }));
      await settle();
      expect(chartBView!.state!.transform.k).toBeGreaterThan(zoomBefore);
      expect(appInstance!.store.state.lastZoom).toBeNull();

      // Chart B responds to actions
      chartBView!.dispatch({ type: 'selectPoint', data: replacementRows[0], index: 0 });
      flushSync();
      expect(chartBView!.state?.selection.selectedData).toEqual([replacementRows[0]]);
    });
  });

  // ==========================================================================
  // Proof 6: Retired-at-mount handling
  // ==========================================================================
  describe('Proof 6: Retired-at-mount handling', () => {
    it('mounting Chart with an already-retired store produces zero errors and schedules no work', async () => {
      // Create a retired store
      const retiredStore: ChartStore<MetricRow> = {
        get state() {
          return undefined;
        },
        dispatch: vi.fn(),
        subscribe: (fn) => {
          fn(undefined);
          return () => {};
        }
      };

      const target = document.createElement('div');
      document.body.appendChild(target);

      let component: any;
      expect(() => {
        component = mount(StandaloneChartHost, {
          target,
          props: {
            store: retiredStore
          }
        });
        flushSync();
      }).not.toThrow();

      cleanupFns.push(() => {
        unmount(component);
        target.remove();
      });

      // No ResizeObserver was observed
      expect(activeObservers.every((ro) => ro.observe.mock.calls.length === 0)).toBe(true);
      // No SVG rendered
      expect(target.querySelector('svg')).toBeNull();
    });

    it('mounting ChartPrimitive with an already-retired store produces zero errors and cleans up', async () => {
      const retiredStore: ChartStore<MetricRow> = {
        get state() {
          return undefined;
        },
        dispatch: vi.fn(),
        subscribe: (fn) => {
          fn(undefined);
          return () => {};
        }
      };

      const target = document.createElement('div');
      document.body.appendChild(target);

      let component: any;
      expect(() => {
        component = mount(StandalonePrimitiveHost, {
          target,
          props: {
            store: retiredStore
          }
        });
        flushSync();
      }).not.toThrow();

      cleanupFns.push(() => {
        unmount(component);
        target.remove();
      });

      expect(target.querySelector('svg')).toBeNull();
    });
  });

  // ==========================================================================
  // Proof 7: Preserved standalone Store API compatibility
  // ==========================================================================
  describe('Proof 7: Preserved standalone Store API compatibility', () => {
    it('standalone createStore drives Chart with typed MetricRow, string and function accessors', async () => {
      const standaloneStore: Store<ChartState<MetricRow>, ChartAction<MetricRow>> = createStore({
        initialState: createInitialChartState<MetricRow>({
          data: defaultRows
        }),
        reducer: chartReducer<MetricRow>
      });

      let callbackRows: MetricRow[] | null = null;
      const target = document.createElement('div');
      document.body.appendChild(target);

      // Verify ChartAccessor types without casts
      const xAccessor: ChartAccessor<MetricRow> = 'x';
      const yAccessor: ChartAccessor<MetricRow> = (d: MetricRow) => d.y;

      const component = mount(StandaloneChartHost, {
        target,
        props: {
          store: standaloneStore,
          x: xAccessor,
          y: yAccessor,
          onSelectionChange: (rows: MetricRow[]) => {
            callbackRows = rows;
          }
        }
      });
      cleanupFns.push(() => {
        unmount(component);
        target.remove();
      });
      flushSync();
      await settle();

      // Figure and summary rendered
      expect(target.querySelector('.chart-container')).not.toBeNull();
      expect(target.querySelector('[role="application"]')).not.toBeNull();
      expect(target.querySelector('table')).not.toBeNull();

      // Dispatches operate directly
      standaloneStore.dispatch({ type: 'selectPoint', data: defaultRows[0], index: 0 });
      flushSync();
      await settle();

      expect(standaloneStore.state.selection.selectedData).toEqual([defaultRows[0]]);
      expect(callbackRows).toEqual([defaultRows[0]]);
    });
  });
});
