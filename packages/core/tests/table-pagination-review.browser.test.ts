import { afterEach, describe, it, expect } from 'vitest';
import { render, cleanup } from 'vitest-browser-svelte';
import { createStore } from '../src/lib/store.svelte.js';
import { createInitialState, createTableReducer } from '../src/lib/components/data-table/table.reducer.js';
import Harness from './test-components/TableReviewHarness.svelte';
afterEach(cleanup);
type Row = {id:number;value:number};
describe('Table rendered pagination regressions', () => {
 it('DEF-008 renders total and reaches last loaded client page', async () => {
  const store=createStore({initialState:createInitialState<Row>({pageSize:10}),reducer:createTableReducer<Row>()});
  try {
   const screen=render(Harness,{store});
   store.dispatch({type:'dataLoaded',data:Array.from({length:25},(_,id)=>({id,value:id}))});
   await expect.element(screen.getByTestId('page-indicator')).toHaveTextContent('Page 1 of 3');
   await expect.element(screen.getByText('1-10 of 25',{exact:true})).toBeVisible();
   await screen.getByRole('button',{name:'Go to last page'}).click();
   await expect.element(screen.getByTestId('page-indicator')).toHaveTextContent('Page 3 of 3');
   await expect.element(screen.getByText('21-25 of 25',{exact:true})).toBeVisible();
   await expect.poll(()=>[...screen.container.querySelectorAll('tbody tr')].map(tr=>tr.firstElementChild?.textContent)).toEqual(['20','21','22','23','24']);
   await expect.element(screen.getByRole('button',{name:'Go to next page'})).toBeDisabled();
  }finally{store.destroy();}
 });
 it('B002-010 renders an empty page count and names the page-size selector', async () => {
  const store=createStore({initialState:createInitialState<Row>({}),reducer:createTableReducer<Row>()});
  try{const screen=render(Harness,{store});
   await expect.element(screen.getByTestId('page-indicator')).toHaveTextContent('Page 0 of 0');
   await expect.element(screen.getByRole('combobox',{name:'Items per page'})).toBeVisible();
   await expect.element(screen.getByRole('button',{name:'Go to next page'})).toBeDisabled();
  }finally{store.destroy();}
 });
});


it('reports zero rendered rows and a typed refresh-needed state after external page correction',async()=>{
 const config={serverSide:true,pageSize:5,initialPage:9,initialTotal:50,initialData:[{id:45,value:45}]};const store=createStore({initialState:createInitialState(config),reducer:createTableReducer(config)});
 try{const screen=render(Harness,{store});store.dispatch({type:'dataLoaded',data:[],total:3});await expect.element(screen.getByText('0-0 of 3',{exact:true})).toBeVisible();expect(store.state.errorReason).toBe('page-out-of-range');expect(store.state.needsRefresh).toBe(true);expect(store.state.isLoading).toBe(false);}finally{store.destroy();}
});
it('renders only valid page sizes and keeps the actual current size available',async()=>{
 const store=createStore({initialState:createInitialState<Row>({pageSize:10}),reducer:createTableReducer<Row>()});
 try{const screen=render(Harness,{store,pageSizeOptions:[0,-1,1.5,NaN,Infinity,20]});await expect.element(screen.getByRole('combobox',{name:'Items per page'})).toBeVisible();const select=screen.container.querySelector('select')!;expect([...select.options].map(option=>option.value)).toEqual(['20','10']);expect(select.value).toBe('10');await screen.getByRole('combobox',{name:'Items per page'}).selectOptions('20');expect(store.state.pagination.pageSize).toBe(20);expect(select.value).toBe('20');}finally{store.destroy();}
});

it('preserves configured option order after selection and clears obsolete page rows', async () => {
 const config={serverSide:true,pageSize:10,initialTotal:50,initialData:[{id:0,value:0}]};
 const store=createStore({initialState:createInitialState(config),reducer:createTableReducer(config)});
 try {
  const screen=render(Harness,{store,pageSizeOptions:[10,20,30]});
  await screen.getByRole('combobox',{name:'Items per page'}).selectOptions('20');
  const select=screen.container.querySelector('select')!;
  expect([...select.options].map(option=>option.value)).toEqual(['10','20','30']);
  await expect.element(screen.getByText('0-0 of 50',{exact:true})).toBeVisible();
  expect(store.state.data).toEqual([]);
  expect(screen.container.querySelectorAll('tbody tr').length).toBe(0);
 } finally {store.destroy();}
});
