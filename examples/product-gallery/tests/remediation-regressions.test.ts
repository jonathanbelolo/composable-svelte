import {describe,it,expect,vi} from 'vitest';
import {createStore} from '@composable-svelte/core';
import {productDetailReducer} from '../src/features/product-detail/product-detail.reducer.js';
import {createProductDetailState} from '../src/features/product-detail/product-detail.types.js';
import {appComposition, appReducer} from '../src/app/app.reducer.js';
import {createInitialAppState, type AppAction} from '../src/app/app.types.js';
import {SAMPLE_PRODUCTS} from '../src/models/sample-data.js';
import {serializeAppState} from '../src/app/app.routing.js';
import {shareReducer} from '../src/features/share/share.reducer.js';
const confirm={type:'destination',action:{type:'presented',action:{type:'deleteAlert',action:{type:'confirmButtonTapped'}}}} as const;
describe('product gallery business boundaries',()=>{
 it('managed detail routing emits deletion exactly once for active confirmation and never cancellation',async()=>{
 const actions:AppAction[]=[];const store=createStore({initialState:createInitialAppState(SAMPLE_PRODUCTS),...appComposition,dependencies:{},ssr:{deferEffects:false}});const subscribe=store.subscribeToActions;expect(subscribe).toBeTypeOf('function');if(!subscribe)throw new Error('managed store action observation is required');const unsubscribe=subscribe(action=>actions.push(action));
 const detail=(action:Parameters<typeof productDetailReducer>[1]):AppAction=>({type:'productDetail',action:{type:'presented',action}});
 store.dispatch({type:'productClicked',productId:'prod-1'});store.dispatch(detail({type:'rootPresentationCompleted'}));store.dispatch(detail({type:'deleteButtonTapped'}));store.dispatch(detail({type:'destination',action:{type:'presented',action:{type:'deleteAlert',action:{type:'cancelButtonTapped'}}}}));for(let i=0;i<10;i++)await Promise.resolve();expect(store.state.products.some(product=>product.id==='prod-1')).toBe(true);
 store.dispatch(detail({type:'deleteButtonTapped'}));store.dispatch(detail(confirm));for(let i=0;i<20;i++)await Promise.resolve();expect(store.state.products.some(product=>product.id==='prod-1')).toBe(false);expect(actions.filter(action=>action.type==='productDetail'&&action.action.type==='presented'&&action.action.action.type==='destination'&&action.action.action.action.type==='presented'&&action.action.action.action.action.type==='deleteAlert'&&action.action.action.action.action.action.type==='deleteConfirmed')).toHaveLength(1);store.dispatch(detail(confirm));for(let i=0;i<10;i++)await Promise.resolve();expect(store.state.products.some(product=>product.id==='prod-1')).toBe(false);unsubscribe();store.destroy();
 });
 it('application deletion output commits catalog, presentation and routed URL projection together',async()=>{
 const store=createStore({initialState:createInitialAppState(SAMPLE_PRODUCTS,'prod-1'),...appComposition,dependencies:{},ssr:{deferEffects:false}});const detail=(action:Parameters<typeof productDetailReducer>[1]):AppAction=>({type:'productDetail',action:{type:'presented',action}});store.dispatch(detail({type:'deleteButtonTapped'}));store.dispatch(detail(confirm));for(let i=0;i<20;i++)await Promise.resolve();expect(store.state.productDetail).toBeNull();expect(store.state.presentation.status).toBe('idle');expect(store.state.products.some(p=>p.id==='prod-1')).toBe(false);expect(serializeAppState(store.state)).toBe('/');store.destroy();
 });
 it('clear filters is one business action and preserves chosen view mode',()=>{const initial={...createInitialAppState(SAMPLE_PRODUCTS),viewMode:'list' as const,filters:{selectedCategories:['electronics' as const]}};const store=createStore({initialState:initial,reducer:appReducer,dependencies:{}});store.dispatch({type:'filtersCleared'});expect(store.state.filters.selectedCategories).toEqual([]);expect(store.state.viewMode).toBe('list');store.destroy();});
 it('nonexistent product selection never enters a presentation awaiting absent animation',()=>{const store=createStore({initialState:createInitialAppState(SAMPLE_PRODUCTS),reducer:appReducer,dependencies:{}});store.dispatch({type:'productClicked',productId:'missing'});expect(store.state.productDetail).toBeNull();expect(store.state.presentation.status).toBe('idle');store.destroy();});
 it('dismiss retains the exact live detail until its captured owner reports completion',()=>{const detail=createProductDetailState('missing');const store=createStore({initialState:{...createInitialAppState(SAMPLE_PRODUCTS),productDetail:detail,presentation:{status:'presented' as const,content:detail}},reducer:appReducer,dependencies:{}});store.dispatch({type:'productDetail',action:{type:'dismiss'}});expect(store.state.productDetail).toBe(detail);expect(store.state.presentation).toEqual({status:'dismissing',content:detail,duration:200});store.dispatch({type:'productDetail',action:{type:'presented',action:{type:'rootDismissalCompleted'}}});expect(store.state.productDetail).toBeNull();expect(store.state.presentation.status).toBe('idle');store.destroy();});
 it('sharing is pure until executed by a real store',()=>{const log=vi.spyOn(console,'log').mockImplementation(()=>{});const initial={productId:'prod-1',selectedMethod:'email' as const};shareReducer(initial,{type:'shareButtonTapped'},{});expect(log).not.toHaveBeenCalled();const store=createStore({initialState:initial,reducer:shareReducer,dependencies:{}});store.dispatch({type:'shareButtonTapped'});expect(log).toHaveBeenCalledExactlyOnceWith('[Share] Sharing via email');store.destroy();log.mockRestore();});
});

it('ignores a stale delete cancellation after another destination opens', () => {
  const store = createStore({initialState:createProductDetailState('prod-1'),reducer:productDetailReducer,dependencies:{}});
  store.dispatch({type:'addToCartButtonTapped'});
  const destination = store.state.destination;
  expect(destination?.type).toBe('addToCart');
  store.dispatch({type:'destination',action:{type:'presented',action:{type:'deleteAlert',action:{type:'cancelButtonTapped'}}}});
  expect(store.state.destination).toBe(destination);
  store.destroy();
});
