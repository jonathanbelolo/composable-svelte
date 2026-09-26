import { describe, it, expect } from 'vitest';
import { createStore } from '../src/lib/store.svelte.js';
import { TestStore } from '../src/lib/test/test-store.js';
import { createTableReducer, createInitialState } from '../src/lib/components/data-table/table.reducer.js';
import type { TableConfig } from '../src/lib/components/data-table/table.types.js';
type Row = { id: number; group: string };
const rows: Row[] = Array.from({ length: 25 }, (_, id) => ({ id, group: id % 2 ? 'odd' : 'even' }));

describe('DEF-008/009 table totals through real executors', () => {
  it('production client loading preserves total, filters, paging and empty boundaries', () => {
    const store = createStore({ initialState: createInitialState<Row>({ pageSize: 10 }), reducer: createTableReducer<Row>() });
    try {
      store.dispatch({ type: 'dataLoaded', data: rows });
      expect(store.state.pagination.total).toBe(25);
      expect(store.state.data.map(r => r.id)).toEqual(rows.slice(0,10).map(r => r.id));
      store.dispatch({ type: 'pageChanged', page: 999 });
      expect(store.state.pagination.page).toBe(2);
      expect(store.state.data.map(r => r.id)).toEqual([20,21,22,23,24]);
      store.dispatch({ type: 'pageChanged', page: -20 });
      expect(store.state.pagination.page).toBe(0);
      store.dispatch({ type: 'filterAdded', filter: { column: 'group', operator: 'equals', value: 'even' } });
      store.dispatch({ type: 'dataLoaded', data: rows });
      expect(store.state.pagination.total).toBe(13);
      expect(store.state.data).toHaveLength(10);
      store.dispatch({ type: 'pageChanged', page: 1 });
      expect(store.state.data.map(r => r.id)).toEqual([20,22,24]);
      store.dispatch({ type: 'dataLoaded', data: [] });
      expect(store.state.pagination.total).toBe(0);
      expect(store.state.data).toEqual([]);
      store.dispatch({ type: 'pageChanged', page: 100 });
      expect(store.state.pagination.page).toBe(0);
    } finally { store.destroy(); }
  });
  it('TestStore client refresh counts filtered rows before slicing and ignores remote total', async () => {
    const config: TableConfig<Row> = { pageSize: 5, fetchData: async () => ({ data: rows, total: 999 }) };
    const store = new TestStore({ initialState: createInitialState(config), reducer: createTableReducer(config) });
    await store.send({ type: 'filterAdded', filter: { column: 'group', operator: 'equals', value: 'odd' } });
    await store.send({ type: 'refreshTriggered' }, s => expect(s.isLoading).toBe(true));
    await store.receive({ type: 'dataLoaded', data: rows, total: 999 }, s => {
      expect(s.pagination.total).toBe(12);
      expect(s.data.map(r => r.id)).toEqual([1,3,5,7,9]);
    });
    await store.send({ type: 'pageChanged', page: 2 }, s => expect(s.data.map(r => r.id)).toEqual([21,23]));
    await store.send({ type: 'filtersCleared' }, s => expect(s.pagination.total).toBe(25));
    await store.finish();
  });
  it('production server refresh carries remote total without paginating the returned page again', async () => {
    const requested: number[] = [];
    const config: TableConfig<Row> = { serverSide: true, pageSize: 5, fetchData: async s => {
      requested.push(s.pagination.page);
      return { data: rows.slice(0,5), total: 250 };
    }};
    const store = createStore({ initialState: createInitialState(config), reducer: createTableReducer(config), ssr: { deferEffects: false } });
    try {
      store.dispatch({ type: 'refreshTriggered' });
      await expect.poll(() => store.state.isLoading).toBe(false);
      expect(store.state.pagination.total).toBe(250);
      store.dispatch({ type: 'pageChanged', page: 999 });
      expect(store.state.pagination.page).toBe(49);
      store.dispatch({ type: 'refreshTriggered' });
      await expect.poll(() => requested.length).toBe(2);
      await expect.poll(() => store.state.isLoading).toBe(false);
      expect(requested).toEqual([0,49]);
      expect(store.state.data).toEqual(rows.slice(0,5));
      expect(store.state.pagination.total).toBe(250);
    } finally { store.destroy(); }
  });
  it('TestStore server refresh receives total and zero total is preserved', async () => {
    const config: TableConfig<Row> = { serverSide: true, fetchData: async () => ({ data: rows.slice(0,5), total: 250 }) };
    const store = new TestStore({ initialState: createInitialState(config), reducer: createTableReducer(config) });
    await store.send({ type: 'refreshTriggered' });
    await store.receive({ type: 'dataLoaded', data: rows.slice(0,5), total: 250 }, s => expect(s.pagination.total).toBe(250));
    await store.send({ type: 'dataLoaded', data: [], total: 0 }, s => expect(s.pagination.total).toBe(0));
    await store.send({ type: 'pageChanged', page: 999 }, s => expect(s.pagination.page).toBe(0));
    await store.send({ type: 'dataLoaded', data: rows.slice(0,3) }, s => expect(s.pagination.total).toBe(3));
    await store.finish();
  });
});

describe('Client reload page validity', () => {
  it('clamps shrinking filtered reloads before slicing, resets empty to page zero and preserves page-size semantics', async () => {
    const store = new TestStore({ initialState: createInitialState<Row>({ pageSize: 5 }), reducer: createTableReducer<Row>() });
    await store.send({ type: 'dataLoaded', data: rows });
    await store.send({ type: 'pageChanged', page: 4 });
    await store.send({ type: 'dataLoaded', data: rows.slice(0,8) }, s => {
      expect(s.pagination).toEqual({ page: 1, pageSize: 5, total: 8 });
      expect(s.data.map(r => r.id)).toEqual([5,6,7]);
    });
    await store.send({ type: 'filterAdded', filter: { column: 'group', operator: 'equals', value: 'even' } });
    await store.send({ type: 'dataLoaded', data: rows });
    await store.send({ type: 'pageChanged', page: 2 });
    await store.send({ type: 'dataLoaded', data: rows.slice(0,12) }, s => {
      expect(s.pagination).toEqual({ page: 1, pageSize: 5, total: 6 });
      expect(s.data.map(r => r.id)).toEqual([10]);
    });
    await store.send({ type: 'pageSizeChanged', pageSize: 3 }, s => {
      expect(s.pagination).toEqual({ page: 0, pageSize: 3, total: 6 });
      expect(s.data.map(r => r.id)).toEqual([0,2,4]);
    });
    await store.send({ type: 'pageChanged', page: 1 });
    await store.send({ type: 'dataLoaded', data: [] }, s => {
      expect(s.pagination).toEqual({ page: 0, pageSize: 3, total: 0 });
      expect(s.data).toEqual([]);
    });
    await store.finish();
  });
});
