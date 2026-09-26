import { describe, it, expect } from 'vitest';
import { buildBarChart } from '../src/lib/utils/plot-builder';
import { createInitialChartState } from '../src/lib/reducers/chart.reducer';
const rows = [{ month: 'May', value: 180 }, { month: 'Dec', value: 190 }, { month: 'Jul', value: 200 }];
const labels = (plot: Element) => [...plot.querySelectorAll('text')].map(node => node.textContent).filter(text => ['May', 'Dec', 'Jul'].includes(text ?? ''));
describe('bar categorical ordering', () => {
  it('preserves Plot default ordering unless explicitly requested', () => {
    const state = createInitialChartState({ data: rows });
    expect(labels(buildBarChart(state, { x: 'month', y: 'value' }))).toEqual(['Dec', 'Jul', 'May']);
    expect(labels(buildBarChart(state, { x: 'month', y: 'value', barCategoryOrder: 'auto' }))).toEqual(['Dec', 'Jul', 'May']);
  });
  it('uses input category order for field and function accessors', () => {
    const state = createInitialChartState({ data: rows });
    expect(labels(buildBarChart(state, { x: 'month', y: 'value', barCategoryOrder: 'input' }))).toEqual(['May', 'Dec', 'Jul']);
    expect(labels(buildBarChart(state, { x: (row: typeof rows[number]) => row.month, y: 'value', barCategoryOrder: 'input' }))).toEqual(['May', 'Dec', 'Jul']);
  });
  it('uses filtered rows and delegates duplicate category normalization to Plot', () => {
    const state = createInitialChartState({ data: [...rows].reverse() });
    state.filteredData = [rows[0]!, rows[2]!, rows[0]!];
    expect(labels(buildBarChart(state, { x: 'month', y: 'value', barCategoryOrder: 'input' }))).toEqual(['May', 'Jul']);
  });
});
