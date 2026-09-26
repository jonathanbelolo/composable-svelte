import { createStore } from '@composable-svelte/core';
import { chartReducer, createInitialChartState, type ChartAction, type ChartAccessor, type ChartState } from '@composable-svelte/charts';
import type { ComponentProps } from 'svelte';
import { Chart, ChartPrimitive } from '@composable-svelte/charts';
import type { MetricRow } from './model.js';

const store = createStore({
  initialState: createInitialChartState<MetricRow>({ data: [{ x: 1, y: 2, label: 'a', category: 'A' }] }),
  reducer: chartReducer<MetricRow>,
  dependencies: {}
});
const chartStore: ComponentProps<typeof Chart<MetricRow>>['store'] = store;
const primitiveStore: ComponentProps<typeof ChartPrimitive<MetricRow>>['store'] = store;
const accessor: ChartAccessor<MetricRow> = 'category';
store.dispatch({ type: 'setData', data: [{ x: 3, y: 4, label: 'b', category: 'B' }] });
// @ts-expect-error Wrong row shape cannot be dispatched to a typed chart store.
store.dispatch({ type: 'setData', data: [{ foo: 'wrong' }] });
// @ts-expect-error A typed row accessor rejects nonexistent keys.
const wrongAccessor: ChartAccessor<MetricRow> = 'nonexistent';
const state: ChartState<MetricRow> = store.state;
const action: ChartAction<MetricRow> = { type: 'setData', data: state.data };
void [chartStore, primitiveStore, accessor, wrongAccessor, action];
