/**
 * Managed Chart Recipe Model for Charts Companion Migration Proof
 * Uses real Composable Svelte core production APIs:
 * - defineApplication
 * - ManagedIntegrationBuilder
 * - optionalSlot
 * - defineViews
 * - ChildView, FeatureViewProps
 */

import {
  defineApplication,
  ManagedIntegrationBuilder,
  optionalSlot,
  type ChildView,
  type FeatureViewProps,
  type PresentationFeatureViewProps
} from '@composable-svelte/core/application';
import { Effect, type Reducer, type PresentationAction } from '@composable-svelte/core';
import { chartReducer, createInitialChartState } from '../../src/lib/reducers/chart.reducer.js';
import type { ChartState, ChartAction, ZoomTransform } from '../../src/lib/types/chart.types.js';

export interface MetricRow {
  x: number;
  y: number;
  label: string;
  category: string;
}

export interface AppDeps {}

export interface AppState {
  title: string;
  chart: ChartState<MetricRow> | null;
  sidebarChart: ChartState<MetricRow> | null;
  lastSelection: MetricRow[] | null;
  lastZoom: ZoomTransform | null;
}

export type AppAction =
  | { type: 'chart'; action: PresentationAction<ChartAction<MetricRow>> }
  | { type: 'sidebarChart'; action: PresentationAction<ChartAction<MetricRow>> }
  | { type: 'openChart'; initialData?: MetricRow[] }
  | { type: 'closeChart' }
  | { type: 'replaceChart'; data?: MetricRow[] }
  | { type: 'openBothCharts' }
  | { type: 'closeChartA' };

export const chartSlot = optionalSlot<AppState, AppAction>()('chart');
export const sidebarChartSlot = optionalSlot<AppState, AppAction>()('sidebarChart');

export const defaultRows: [MetricRow, MetricRow, MetricRow] = [
  { x: 1, y: 10, label: 'alpha', category: 'cat-A' },
  { x: 2, y: 20, label: 'beta', category: 'cat-B' },
  { x: 3, y: 30, label: 'gamma', category: 'cat-A' }
];

export const replacementRows: [MetricRow, MetricRow] = [
  { x: 10, y: 100, label: 'delta', category: 'cat-C' },
  { x: 20, y: 200, label: 'epsilon', category: 'cat-D' }
];

export const rootReducer: Reducer<AppState, AppAction, AppDeps> = (state, action) => {
  switch (action.type) {
    case 'chart': {
      if (action.action.type === 'presented') {
        const child = action.action.action;
        if (child.type === 'selectPoint') {
          return [
            {
              ...state,
              lastSelection: [child.data]
            },
            Effect.none()
          ];
        }
        if (child.type === 'selectPoints') {
          const selected = child.indices
            .map(i => state.chart?.filteredData[i])
            .filter((d): d is MetricRow => d !== undefined);
          return [
            {
              ...state,
              lastSelection: selected
            },
            Effect.none()
          ];
        }
        if (child.type === 'clearSelection') {
          return [
            {
              ...state,
              lastSelection: []
            },
            Effect.none()
          ];
        }
        if (child.type === 'zoom') {
          return [
            {
              ...state,
              lastZoom: child.transform
            },
            Effect.none()
          ];
        }
      }
      return [state, Effect.none()];
    }

    case 'openChart':
      return [
        {
          ...state,
          chart: createInitialChartState<MetricRow>({
            data: action.initialData ?? defaultRows
          })
        },
        Effect.none()
      ];

    case 'closeChart':
      return [{ ...state, chart: null }, Effect.none()];

    case 'replaceChart':
      return [
        {
          ...state,
          chart: createInitialChartState<MetricRow>({
            data: action.data ?? replacementRows
          })
        },
        Effect.none()
      ];

    case 'openBothCharts':
      return [
        {
          ...state,
          chart: createInitialChartState<MetricRow>({
            data: defaultRows
          }),
          sidebarChart: createInitialChartState<MetricRow>({
            data: replacementRows
          })
        },
        Effect.none()
      ];

    case 'closeChartA':
      return [{ ...state, chart: null }, Effect.none()];

    default:
      return [state, Effect.none()];
  }
};

export const composition = new ManagedIntegrationBuilder<AppState, AppAction, AppDeps>(rootReducer)
  .with(chartSlot, chartReducer<MetricRow>, { replaceOn: (action) => action.type === 'replaceChart' })
  .with(sidebarChartSlot, chartReducer<MetricRow>)
  .build();

export const initialAppState = (): AppState => ({
  title: 'Managed Chart Proof Application',
  chart: createInitialChartState<MetricRow>({
    data: defaultRows
  }),
  sidebarChart: null,
  lastSelection: null,
  lastZoom: null
});

export const chartAppDefinition = defineApplication(composition, {
  initialState: initialAppState
});
