/** Compile-only negative checks for the exported row contract. */
import { createStore, type Reducer } from '@composable-svelte/core';
import { chartReducer, createInitialChartState } from '../../src/lib/reducers/chart.reducer.js';
import type { ChartState, ChartAction, ChartAccessor } from '../../src/lib/types/chart.types.js';

interface Row { x: number; y: number; label: string }
interface Other { foo: string }

const typed = createStore({
  initialState: createInitialChartState<Row>({ data: [{ x: 1, y: 2, label: 'a' }] }),
  reducer: chartReducer<Row>,
  dependencies: {}
});

typed.dispatch({ type: 'setData', data: [{ x: 3, y: 4, label: 'b' }] });
// @ts-expect-error Wrong-shaped data must not be accepted by a row-typed store.
typed.dispatch({ type: 'setData', data: [{ foo: 'x' }] });
// @ts-expect-error A known row accepts only its own property keys.
const wrongKey: ChartAccessor<Row> = 'nonexistent';
// @ts-expect-error A reducer for Row cannot be used for another action row.
const wrongReducer: Reducer<ChartState<Row>, ChartAction<Other>, unknown> = chartReducer<Row>;

void [wrongKey, wrongReducer];
