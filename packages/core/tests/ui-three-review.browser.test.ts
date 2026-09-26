import {afterEach,it,expect} from 'vitest';
import {render,cleanup} from 'vitest-browser-svelte';
import {tick} from 'svelte';
import {createStore} from '../src/lib/store.svelte.js';
import {createInitialState,createTableReducer} from '../src/lib/components/data-table/table.reducer.js';
import Harness from './test-components/UiThreeReview.svelte';
type Row={name:string;age:number;id:number};
const stores:Array<{destroy:()=>void}>=[];
afterEach(()=>{cleanup();stores.splice(0).forEach(store=>store.destroy());});
function setup(){const config={initialData:[{id:1,name:'B',age:10},{id:2,name:'A',age:20}]};const store=createStore({initialState:createInitialState<Row>(config),reducer:createTableReducer<Row>(config)});stores.push(store);return {store,view:render(Harness,{store})};}
const paths=(header:Element)=>[...header.querySelectorAll('svg path')].map(path=>path.getAttribute('d'));
it('B002-007 exposes real sort state and different decorative direction icons',async()=>{
 const {store,view}=setup();const headers=[...view.container.querySelectorAll('th')];
 expect(headers[0]!.getAttribute('aria-sort')).toBe('none');
 expect(headers[2]!.hasAttribute('aria-sort')).toBe(false);expect(headers[2]!.querySelector('button')).toBeNull();
 const unsorted=paths(headers[0]!);
 await view.getByRole('button',{name:'Name',exact:true}).click();
 expect(store.state.sorting).toEqual([{column:'name',direction:'asc'}]);
 expect(store.state.data.map(row=>row.name)).toEqual(['A','B']);
 expect(headers[0]!.getAttribute('aria-sort')).toBe('ascending');const ascending=paths(headers[0]!);
 expect(ascending).not.toEqual(unsorted);
 await view.getByRole('button',{name:'Name',exact:true}).click();
 expect(store.state.sorting).toEqual([{column:'name',direction:'desc'}]);
 expect(store.state.data.map(row=>row.name)).toEqual(['B','A']);
 expect(headers[0]!.getAttribute('aria-sort')).toBe('descending');expect(paths(headers[0]!)).not.toEqual(ascending);
 expect(headers[0]!.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
 await view.getByRole('button',{name:'Age',exact:true}).click();
 expect(headers[0]!.getAttribute('aria-sort')).toBe('none');expect(headers[1]!.getAttribute('aria-sort')).toBe('ascending');
 store.dispatch({type:'sortChanged',column:'age',direction:'desc'});await tick();
 expect(headers[1]!.getAttribute('aria-sort')).toBe('descending');
});
it('B002-009 groups have unique single IDREFs despite duplicate whitespace labels and preserve IDs on rerender',async()=>{
 const {view}=setup();const groups=[...view.container.querySelectorAll('[role="group"]')];
 const ids=groups.map(group=>group.getAttribute('aria-labelledby')!);
 expect(new Set(ids).size).toBe(2);
 for(const [index,id] of ids.entries()){expect(id).not.toMatch(/\s/);const heading=document.getElementById(id);expect(heading).not.toBeNull();expect(groups[index]!.contains(heading)).toBe(true);expect(heading!.textContent).toContain('Shared heading with spaces');}
 await view.rerender({label:'Renamed heading'});
 expect(groups.map(group=>group.getAttribute('aria-labelledby'))).toEqual(ids);
 for(const id of ids)expect(document.getElementById(id)!.textContent).toContain('Renamed heading');
});
it('B006-7 updates resize classes reactively while preserving typed value',async()=>{
 const {view}=setup();const textarea=view.container.querySelector('textarea')!;
 textarea.value='Keep this';textarea.dispatchEvent(new Event('input',{bubbles:true}));
 for(const [resize,expected] of [['none','resize-none'],['horizontal','resize-x'],['both','resize'],['vertical','resize-y']] as const){
  await view.rerender({resize});expect(textarea.classList.contains(expected)).toBe(true);
  for(const other of ['resize-none','resize-x','resize','resize-y'].filter(value=>value!==expected))expect(textarea.classList.contains(other)).toBe(false);
  expect(textarea.value).toBe('Keep this');
 }
});
