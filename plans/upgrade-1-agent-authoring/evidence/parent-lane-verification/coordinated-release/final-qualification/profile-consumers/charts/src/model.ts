import { defineApplication, ManagedIntegrationBuilder, optionalSlot, defineViews } from '@composable-svelte/core/application';
import { Effect, type Reducer, type PresentationAction } from '@composable-svelte/core';
import {
  createInitialChartState,
  chartReducer,
  type ChartState,
  type ChartAction
} from '@composable-svelte/charts';
import ChartFeature from './ChartFeature.svelte';

export interface MetricRow {
  x: number;
  y: number;
  label: string;
  category: string;
}

export interface State {
  chart: ChartState<MetricRow> | null;
  clickedCount: number;
  lastSelection: MetricRow[] | null;
  lastZoom: number | null;
}

export type Action =
  | { type: 'chart'; action: PresentationAction<ChartAction<MetricRow>> }
  | { type: 'close' }
  | { type: 'increment' };

const rootReducer: Reducer<State, Action, object> = (state, action) => {
  if (action.type === 'chart' && action.action.type === 'presented') {
    const child = action.action.action;
    if (child.type === 'selectPoints') {
      return [{ ...state, lastSelection: child.indices.map(index => state.chart?.filteredData[index]).filter((row): row is MetricRow => row !== undefined) }, Effect.none()];
    }
    if (child.type === 'zoom') return [{ ...state, lastZoom: child.transform.k }, Effect.none()];
  }
  if (action.type === 'close') return [{ ...state, chart: null }, Effect.none()];
  if (action.type === 'increment') {
    return [{ ...state, clickedCount: state.clickedCount + 1 }, Effect.none()];
  }
  return [state, Effect.none()];
};

const chartSlot = optionalSlot<State, Action>()('chart');
export const composition = new ManagedIntegrationBuilder<State, Action, object>(rootReducer)
  .with(chartSlot, chartReducer<MetricRow>)
  .build();

export const definition = defineApplication(composition, {
  initialState: () => ({
    chart: createInitialChartState<MetricRow>({
      data: [
        { x: 10, y: 100, label: 'alpha', category: 'A' },
        { x: 20, y: 200, label: 'beta', category: 'B' }
      ]
    }),
    clickedCount: 0,
    lastSelection: null,
    lastZoom: null
  })
});

export const views = defineViews(composition, { chart: { render: ChartFeature } });
