import { describe, it, expect } from 'vitest';
import { createStore } from '../src/lib/store.svelte.js';
import { TestStore } from '../src/lib/test/test-store.js';
import { createInitialState, createTableReducer } from '../src/lib/components/data-table/table.reducer.js';
import type { TableConfig } from '../src/lib/components/data-table/table.types.js';
type Row = { id: number; value: number };
const rows = Array.from({ length: 25 }, (_, id) => ({ id, value: id }));
function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<T>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}

describe('Table review follow-up', () => {
	it('F2 receives legacy subset expectation despite additional total', async () => {
		const config: TableConfig<Row> = { serverSide: true, fetchData: async () => ({ data: rows.slice(0, 5), total: 250 }) };
		const store = new TestStore({ initialState: createInitialState(config), reducer: createTableReducer(config) });
		await store.send({ type: 'refreshTriggered' });
		await store.receive({ type: 'dataLoaded', data: rows.slice(0, 5) }, (s) => expect(s.pagination.total).toBe(250));
		await store.finish();
	});

	it('F4 retains a valid nonzero page and reapplies active sorting on reload', async () => {
		const store = new TestStore({ initialState: createInitialState<Row>({ pageSize: 5 }), reducer: createTableReducer<Row>() });
		await store.send({ type: 'dataLoaded', data: rows });
		await store.send({ type: 'pageChanged', page: 3 });
		await store.send({ type: 'dataLoaded', data: rows }, (s) => {
			expect(s.pagination.page).toBe(3);
			expect(s.data.map((x) => x.id)).toEqual([15, 16, 17, 18, 19]);
		});
		await store.send({ type: 'sortChanged', column: 'value', direction: 'desc' });
		await store.send({ type: 'pageChanged', page: 3 });
		await store.send({ type: 'dataLoaded', data: [...rows].reverse() }, (s) => {
			expect(s.pagination.page).toBe(3);
			expect(s.pagination.total).toBe(25);
			expect(s.data.map((x) => x.id)).toEqual([9, 8, 7, 6, 5]);
		});
		await store.finish();
	});

	it('NEW-TABLE-001 clamps a shrinking server total and fetches the matching page itself', async () => {
		const pages: number[] = [];
		let total = 250;
		const correction = deferred<{ data: Row[]; total: number }>();
		const config: TableConfig<Row> = {
			serverSide: true,
			pageSize: 5,
			fetchData: async (s) => {
				pages.push(s.pagination.page);
				if (pages.length === 3) return correction.promise;
				return { data: s.pagination.page === 0 ? rows.slice(0, Math.min(5, total)) : [], total };
			}
		};
		const store = new TestStore({ initialState: createInitialState(config), reducer: createTableReducer(config) });
		await store.send({ type: 'refreshTriggered' });
		await store.receive({ type: 'dataLoaded' }, (s) => expect(s.pagination.total).toBe(250));
		await store.send({ type: 'pageChanged', page: 49 });
		total = 3;
		await store.send({ type: 'refreshTriggered' });
		await store.receive({ type: 'dataLoaded', total: 3 }, (s) => {
			expect(s.pagination.page).toBe(0);
			expect(s.isLoading).toBe(true);
			expect(s.data).toEqual([]);
		});
		correction.resolve({ data: rows.slice(0, 3), total: 3 });
		await store.receive({ type: 'dataLoaded', data: rows.slice(0, 3) }, (s) => {
			expect(s.isLoading).toBe(false);
			expect(s.pagination.total).toBe(3);
		});
		expect(pages).toEqual([0, 49, 0]);
		await store.finish();
	});

	it('NEW-TABLE-002 preserves an explicitly seeded server total and supplied page', () => {
		const config = { serverSide: true, pageSize: 5, initialData: rows.slice(0, 8), initialTotal: 250 };
		const state = createInitialState(config);
		expect(state.pagination.total).toBe(250);
		expect(state.data).toEqual(rows.slice(0, 8));
	});

	it('NEW-TABLE-003 rejects invalid page sizes and nonfinite page requests without corrupting state', async () => {
		const store = new TestStore({ initialState: createInitialState<Row>({ initialData: rows, pageSize: 5 }), reducer: createTableReducer<Row>() });
		for (const pageSize of [0, -1, 1.5, NaN, Infinity]) {
			await store.send({ type: 'pageSizeChanged', pageSize }, (s) => expect(s.pagination.pageSize).toBe(5));
		}
		for (const page of [NaN, Infinity, -Infinity]) {
			await store.send({ type: 'pageChanged', page }, (s) => expect(s.pagination.page).toBe(0));
		}
		await store.send({ type: 'pageChanged', page: 1.8 }, (s) => expect(s.pagination.page).toBe(1));
		await store.send({ type: 'dataLoaded', data: [] }, (s) => expect(s.pagination).toEqual({ page: 0, pageSize: 5, total: 0 }));
		await store.finish();
		for (const pageSize of [0, -1, 1.5, NaN, Infinity]) {
			expect(createInitialState<Row>({ pageSize }).pagination.pageSize).toBe(10);
		}
	});

	it('NEW-TABLE-004 ignores out-of-order success and failure from superseded refreshes', async () => {
		const first = deferred<{ data: Row[]; total: number }>();
		const second = deferred<{ data: Row[]; total: number }>();
		let calls = 0;
		const config: TableConfig<Row> = { serverSide: true, fetchData: () => (++calls === 1 ? first.promise : second.promise) };
		const store = createStore({ initialState: createInitialState(config), reducer: createTableReducer(config), ssr: { deferEffects: false } });
		try {
			store.dispatch({ type: 'refreshTriggered' });
			store.dispatch({ type: 'refreshTriggered' });
			second.resolve({ data: rows.slice(5, 10), total: 100 });
			await expect.poll(() => store.state.isLoading).toBe(false);
			first.resolve({ data: rows.slice(0, 5), total: 5 });
			await Promise.resolve();
			await Promise.resolve();
			expect(store.state.data).toEqual(rows.slice(5, 10));
			expect(store.state.pagination.total).toBe(100);
		} finally {
			store.destroy();
		}
		const old = deferred<{ data: Row[]; total: number }>();
		let n = 0;
		const failConfig: TableConfig<Row> = { serverSide: true, fetchData: () => (++n === 1 ? old.promise : Promise.resolve({ data: rows, total: 25 })) };
		const other = createStore({ initialState: createInitialState(failConfig), reducer: createTableReducer(failConfig), ssr: { deferEffects: false } });
		try {
			other.dispatch({ type: 'refreshTriggered' });
			other.dispatch({ type: 'refreshTriggered' });
			await expect.poll(() => other.state.isLoading).toBe(false);
			old.reject(new Error('obsolete'));
			await Promise.resolve();
			await Promise.resolve();
			expect(other.state.error).toBeNull();
			expect(other.state.data).toEqual(rows);
		} finally {
			other.destroy();
		}
	});

	it('NEW-TABLE-004 invalidates pending results after a query change or externally supplied data', async () => {
		for (const replacement of ['query', 'data'] as const) {
			const pending = deferred<{ data: Row[]; total: number }>();
			const config: TableConfig<Row> = { serverSide: true, initialData: rows, fetchData: () => pending.promise };
			const store = createStore({ initialState: createInitialState(config), reducer: createTableReducer(config), ssr: { deferEffects: false } });
			try {
				store.dispatch({ type: 'refreshTriggered' });
				if (replacement === 'query') store.dispatch({ type: 'filterAdded', filter: { column: 'value', operator: 'equals', value: 2 } });
				else store.dispatch({ type: 'dataLoaded', data: rows.slice(10), total: 15 });
				pending.resolve({ data: [], total: 0 });
				await Promise.resolve();
				await Promise.resolve();
				expect(store.state.pagination.total).toBe(replacement === 'query' ? 25 : 15);
			} finally {
				store.destroy();
			}
		}
	});

	it('NEW-TABLE-005 prunes deleted client row selection but preserves selection outside a server page', async () => {
		for (const serverSide of [false, true]) {
			const config: TableConfig<Row> = { serverSide, initialData: rows };
			const store = new TestStore({ initialState: createInitialState(config), reducer: createTableReducer(config) });
			await store.send({ type: 'rowSelected', rowId: '0' });
			await store.send({ type: 'rowSelected', rowId: '20' });
			await store.send({ type: 'dataLoaded', data: rows.slice(1) }, (s) => {
				expect(s.selectedRows.has('0')).toBe(serverSide);
				expect(s.selectedRows.has('20')).toBe(true);
			});
			await store.finish();
		}
	});

	it('R1 does not use inferred omitted totals to destructively clamp or refetch server rows', async () => {
		const calls: number[] = [];
		const config: TableConfig<Row> = {
			serverSide: true,
			pageSize: 10,
			fetchData: async (s) => {
				calls.push(s.pagination.page);
				return { data: [], total: 0 };
			}
		};
		const store = new TestStore({ initialState: createInitialState(config), reducer: createTableReducer(config) });
		await store.send({ type: 'dataLoaded', data: rows.slice(0, 10), total: 250 });
		await store.send({ type: 'pageChanged', page: 3 });
		await store.send({ type: 'dataLoaded', data: rows.slice(0, 10) }, (s) => {
			expect(s.data).toEqual(rows.slice(0, 10));
			expect(s.pagination.page).toBe(3);
			expect(s.pagination.total).toBe(10);
		});
		expect(calls).toEqual([]);
		await store.finish();
	});

	it('R2 honestly represents stale and error when correction fetch is superseded', async () => {
		const pages: number[] = [];
		const correction = deferred<{ data: Row[]; total: number }>();
		let total = 250;
		const config: TableConfig<Row> = {
			serverSide: true,
			pageSize: 5,
			fetchData: async (s) => {
				pages.push(s.pagination.page);
				if (pages.length === 3) return correction.promise;
				return { data: s.pagination.page === 0 ? rows.slice(0, 5) : [], total };
			}
		};
		const store = createStore({
			initialState: createInitialState(config),
			reducer: createTableReducer(config),
			ssr: { deferEffects: false }
		});
		try {
			store.dispatch({ type: 'refreshTriggered' });
			await expect.poll(() => store.state.isLoading).toBe(false);
			store.dispatch({ type: 'pageChanged', page: 49 });
			total = 3;
			store.dispatch({ type: 'refreshTriggered' });
			await expect.poll(() => store.state.pagination.page).toBe(0);
			expect(store.state.isLoading).toBe(true);
			expect(store.state.data).toEqual([]);
			store.dispatch({ type: 'sortChanged', column: 'value', direction: 'desc' });
			expect(store.state.isLoading).toBe(false);
			expect(store.state.needsRefresh).toBe(true);
			expect(store.state.error).toBeNull();
			expect(store.state.errorReason).toBeNull();
			correction.resolve({ data: rows.slice(0, 3), total: 3 });
			await Promise.resolve();
			await Promise.resolve();
			expect(store.state.data).toEqual([]);
			expect(store.state.error).toBeNull();
		} finally {
			store.destroy();
		}
	});

	it('R3 identical query changes do not invalidate active fetches', async () => {
		const pending = deferred<{ data: Row[]; total: number }>();
		const config: TableConfig<Row> = {
			serverSide: true,
			fetchData: () => pending.promise
		};
		const store = createStore({
			initialState: createInitialState(config),
			reducer: createTableReducer(config),
			ssr: { deferEffects: false }
		});
		try {
			store.dispatch({ type: 'refreshTriggered' });
			expect(store.state.isLoading).toBe(true);
			store.dispatch({ type: 'pageChanged', page: store.state.pagination.page });
			expect(store.state.isLoading).toBe(true);
			pending.resolve({ data: rows.slice(0, 5), total: 100 });
			await Promise.resolve();
			await Promise.resolve();
			expect(store.state.data).toEqual(rows.slice(0, 5));
			expect(store.state.pagination.total).toBe(100);
			expect(store.state.isLoading).toBe(false);
		} finally {
			store.destroy();
		}
	});

	it('R4 provides typed error and configurable presentation when requested page does not exist without fetchData', async () => {
		const config: TableConfig<Row> = {
			serverSide: true,
			pageSize: 10,
			pageOutOfRangeMessage: 'Custom page out of range'
		};
		const store = new TestStore({ initialState: createInitialState(config), reducer: createTableReducer(config) });
		await store.send({ type: 'dataLoaded', data: rows.slice(0, 10), total: 250 });
		await store.send({ type: 'pageChanged', page: 3 });
		await store.send({ type: 'dataLoaded', data: [], total: 10 }, (s) => {
			expect(s.pagination.page).toBe(0);
			expect(s.data).toEqual([]);
			expect(s.error).toBe('Custom page out of range');
			expect(s.errorReason).toBe('page-out-of-range');
		});
		await store.finish();

		const defaultConfig: TableConfig<Row> = { serverSide: true, pageSize: 10 };
		const defaultStore = new TestStore({ initialState: createInitialState(defaultConfig), reducer: createTableReducer(defaultConfig) });
		await defaultStore.send({ type: 'dataLoaded', data: rows.slice(0, 10), total: 250 });
		await defaultStore.send({ type: 'pageChanged', page: 3 });
		await defaultStore.send({ type: 'dataLoaded', data: [], total: 10 }, (s) => {
			expect(s.error).toBe('The requested page is no longer available. Refresh to load the current page.');
			expect(s.errorReason).toBe('page-out-of-range');
		});
		await defaultStore.finish();
	});

	it('R5 supports validated initialPage and ignores initialTotal in client mode', () => {
		const serverConfig: TableConfig<Row> = {
			serverSide: true,
			pageSize: 5,
			initialPage: 3,
			initialData: rows.slice(15, 20),
			initialTotal: 250
		};
		const serverState = createInitialState(serverConfig);
		expect(serverState.pagination.page).toBe(3);
		expect(serverState.pagination.pageSize).toBe(5);
		expect(serverState.pagination.total).toBe(250);
		expect(serverState.data).toEqual(rows.slice(15, 20));

		const clientConfig: TableConfig<Row> = {
			pageSize: 5,
			initialData: rows.slice(0, 5),
			initialTotal: 250
		};
		const clientState = createInitialState(clientConfig);
		expect(clientState.pagination.total).toBe(5);
		expect(clientState.pagination.page).toBe(0);
	});

	it('R6 forwards AbortSignal and aborts on store destruction', async () => {
		let capturedSignal: AbortSignal | undefined;
		const pending = deferred<{ data: Row[]; total: number }>();
		const config: TableConfig<Row> = {
			serverSide: true,
			fetchData: async (_state, signal) => {
				capturedSignal = signal;
				return pending.promise;
			}
		};
		const store = createStore({
			initialState: createInitialState(config),
			reducer: createTableReducer(config),
			ssr: { deferEffects: false }
		});
		try {
			store.dispatch({ type: 'refreshTriggered' });
			expect(capturedSignal).toBeDefined();
			expect(capturedSignal?.aborted).toBe(false);
			store.destroy();
			expect(capturedSignal?.aborted).toBe(true);
			pending.resolve({ data: rows.slice(0, 5), total: 25 });
			await Promise.resolve();
			await Promise.resolve();
			expect(store.state.data).toEqual([]);
		} finally {
			// already destroyed
		}
	});
});


describe('additional table repair edge cases',()=>{
 it('does not cancel any identical query during an active refresh',async()=>{
  const pending=deferred<{data:Row[];total:number}>();const config:TableConfig<Row>={serverSide:true,fetchData:()=>pending.promise};
  const state={...createInitialState(config),sorting:[{column:'value' as const,direction:'asc' as const}],filters:[{column:'id' as const,operator:'equals' as const,value:1},{column:'value' as const,operator:'equals' as const,value:1}]};
  const store=new TestStore({initialState:state,reducer:createTableReducer(config)});await store.send({type:'refreshTriggered'});const version=store.state.requestVersion;
  for(const action of [{type:'pageChanged',page:0},{type:'pageSizeChanged',pageSize:10},{type:'sortChanged',column:'value',direction:'asc'},{type:'filterAdded',filter:{column:'id',operator:'equals',value:1}},{type:'filterRemoved',column:'missing'}] as const){await store.send(action as import('../src/lib/components/data-table/table.types.js').TableAction<Row>);expect(store.state.requestVersion).toBe(version);expect(store.state.isLoading).toBe(true);}
  pending.resolve({data:rows,total:25});await store.receive({type:'dataLoaded'});await store.finish();
 });
 it('limits automatic correction to one additional fetch per explicit refresh',async()=>{
  const pages:number[]=[];const config:TableConfig<Row>={serverSide:true,pageSize:1,initialTotal:100,initialPage:99,fetchData:async s=>{pages.push(s.pagination.page);return {data:[],total:pages.length===1?50:25};}};
  const store=new TestStore({initialState:createInitialState(config),reducer:createTableReducer(config)});await store.send({type:'refreshTriggered'});await store.receive({type:'dataLoaded'});await store.receive({type:'dataLoaded'});expect(pages).toEqual([99,49]);expect(store.state.isLoading).toBe(false);expect(store.state.needsRefresh).toBe(true);expect(store.state.errorReason).toBe('page-out-of-range');await store.finish();
 });
 it('settles a fetch rejected with undefined',async()=>{const config:TableConfig<Row>={serverSide:true,fetchData:()=>Promise.reject(undefined)};const store=new TestStore({initialState:createInitialState(config),reducer:createTableReducer(config)});await store.send({type:'refreshTriggered'});await store.receive({type:'dataLoadFailed'},s=>{expect(s.isLoading).toBe(false);expect(s.errorReason).toBe('load-failed');expect(s.needsRefresh).toBe(true);});await store.finish();});
});


describe('table final review boundaries', () => {
 it('client query changes do not lose an in-flight full dataset', async () => {
  const pending = deferred<{data: Row[]; total: number}>();
  const config: TableConfig<Row> = {fetchData: () => pending.promise, pageSize: 5};
  const store = new TestStore({initialState: createInitialState(config), reducer: createTableReducer(config)});
  await store.send({type:'refreshTriggered'});
  await store.send({type:'sortChanged',column:'value',direction:'desc'});
  pending.resolve({data:rows,total:rows.length});
  await store.receive({type:'dataLoaded'}, state => expect(state.data[0]?.value).toBe(24));
  await store.finish();
 });
 it('server query changes clear rows belonging to the previous page', () => {
  const config: TableConfig<Row> = {serverSide:true,initialData:rows.slice(0,5),initialTotal:25,pageSize:5};
  const reduce=createTableReducer(config);const initial=createInitialState(config);
  const [next]=reduce(initial,{type:'pageChanged',page:1},{});
  expect(next.data).toEqual([]);expect(next.needsRefresh).toBe(true);
 });
 it('an explicit refresh resets the correction budget', () => {
  const config: TableConfig<Row> = {serverSide:true,fetchData:async()=>({data:[],total:0})};
  const [next]=createTableReducer(config)({...createInitialState(config),correctionPending:true},{type:'refreshTriggered'},{});
  expect(next.correctionPending).toBe(false);
 });
 it.each([undefined,null,{}])('malformed fetch result reaches failure instead of stranding loading', async (value) => {
  const config: TableConfig<Row> = {fetchData:async()=>value as never};
  const store = new TestStore({initialState:createInitialState(config),reducer:createTableReducer(config)});
  await store.send({type:'refreshTriggered'});
  await store.receive({type:'dataLoadFailed'},state=>{expect(state.isLoading).toBe(false);expect(state.error).toContain('fetchData');});
  await store.finish();
 });
 it('query changes clear obsolete page-range errors',()=>{
  const config: TableConfig<Row>={serverSide:true,initialTotal:50,pageSize:5};
  const state={...createInitialState(config),error:'old page',errorReason:'page-out-of-range' as const};
  const [next]=createTableReducer(config)(state,{type:'pageChanged',page:1},{});
  expect(next.error).toBeNull();expect(next.errorReason).toBeNull();
 });
});
