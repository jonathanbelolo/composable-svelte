import {expect,it} from 'vitest';
import {parseInventoryURL,serializeInventoryState} from '../src/routing';
import {createInitialState,inventoryReducer} from '../src/reducer';
it('has explicit list aliases, encoded IDs, and unknown-route recovery decisions',()=>{
 for(const path of ['/','/inventory','/inventory/add','/inventory/item/a%2Fb']) {
  expect(serializeInventoryState(parseInventoryURL(path))).toBe(path);
 }
 expect(parseInventoryURL('/inventory/item/2?source=demo')).toEqual({type:'detail',itemId:'2'});
 expect(parseInventoryURL('/inventory/item/%ZZ')).toEqual({type:'notFound',path:'/inventory/item/%ZZ'});
 expect(parseInventoryURL('/missing?source=demo')).toEqual({type:'notFound',path:'/missing?source=demo'});
});
it('business navigation and edits produce no browser I/O effect',()=>{
 let state=createInitialState({type:'list',path:'/'});
 for(const action of [{type:'itemSelected',itemId:'1'},{type:'itemDeleted',itemId:'1'},{type:'addTapped'},{type:'closeDestination'}] as const){
  const [next,effect]=inventoryReducer(state,action,undefined);
  expect(effect).toEqual({_tag:'None'});state=next;
 }
 expect(state.route).toEqual({type:'list',path:'/inventory'});
 expect(state.items.some(item=>item.id==='1')).toBe(false);
});

it('treats leading double slash as an unsupported pathname, never a network host',()=>{
 const route=parseInventoryURL('//missing');
 expect(route).toEqual({type:'notFound',path:'//missing'});
 expect(serializeInventoryState(route)).toBe('/not-found');
});
