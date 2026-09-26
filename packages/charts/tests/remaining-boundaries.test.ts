import { afterEach, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { createStore } from '@composable-svelte/core';
import Chart from '../src/lib/components/Chart.svelte';
import ChartPrimitive from '../src/lib/components/ChartPrimitive.svelte';
import { chartReducer, createInitialChartState } from '../src/lib/reducers/chart.reducer';
import { calculateDomain, selectionMark, focusMark } from '../src/lib/utils/plot-builder';
import { installResizeObserverStub } from './helpers/jsdom-shims';
installResizeObserverStub();
const disposers: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const dispose of disposers.splice(0).reverse()) await dispose(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const rows = [{ x: 1, y: 10 }, { x: 2, y: 20 }];
function store() { const value = createStore({ initialState: createInitialChartState({data: rows, transitionDuration: 100}), reducer: chartReducer, dependencies: {} }); disposers.push(() => value.destroy()); return value; }
function container() { const value = document.createElement('div'); document.body.append(value); disposers.push(() => value.remove()); return value; }
function frames() {
 let next = 0; const callbacks = new Map<number, FrameRequestCallback>(); const cancelled: number[] = [];
 vi.spyOn(performance, 'now').mockReturnValue(0);
 vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { const id = next++; callbacks.set(id, callback); return id; });
 vi.stubGlobal('cancelAnimationFrame', (id: number) => { cancelled.push(id); callbacks.delete(id); });
 return { callbacks, cancelled, advance(time: number) { const pending = [...callbacks.values()]; callbacks.clear(); for (const callback of pending) callback(time); flushSync(); } };
}
it.each([0, 5, -5, 1e30])('B046-6 constant %s has finite nondegenerate enclosing bounds', value => {
 const bounds = calculateDomain([{x:value},{x:value}], 'x') as [number, number];
 expect(bounds.every(Number.isFinite)).toBe(true); expect(bounds[0]).toBeLessThan(value); expect(bounds[1]).toBeGreaterThan(value);
});
it('B046-1 omitted accessors match explicit x/y for selected and focused marks', () => {
 const state = {...createInitialChartState({data:rows}), focusedIndex:0, selection:{type:'point' as const, selectedIndices:[0], selectedData:[rows[0]!]}};
 for (const mark of [selectionMark,focusMark]) for (const kind of ['point','rule'] as const) {
  const implicit = mark(state,{},kind), explicit=mark(state,{x:'x',y:'y'},kind);
  expect(implicit).not.toBeNull(); expect(implicit.channels).toEqual(explicit.channels);
 }
});
it.each(['+','-','0','ArrowRight'])('B046-5 disabled navigation leaves %s unhandled and unchanged', key => {
 const value=store(), target=container(); const component=mount(Chart,{target,props:{store:value,width:600,height:400,enableZoom:false}}); disposers.push(()=>unmount(component)); flushSync();
 const event=new KeyboardEvent('keydown',{key,shiftKey:key==='ArrowRight',bubbles:true,cancelable:true}); target.querySelector('.chart-surface')!.dispatchEvent(event); flushSync();
 expect(event.defaultPrevented).toBe(false); expect(value.state.transform).toEqual({x:0,y:0,k:1}); expect(value.state.isAnimating).toBe(false);
});
it('B046-3 superseding zoom owns the only frame and reaches the newer target', async () => {
 const raf=frames(),value=store(),target=container(); const component=mount(ChartPrimitive,{target,props:{store:value,config:{enableAnimations:true},plotBuilder:()=>document.createElement('div')}}); disposers.push(()=>unmount(component)); flushSync();
 value.dispatch({type:'zoomAnimated',targetTransform:{x:10,y:10,k:2}});flushSync();expect(raf.callbacks.size).toBe(1);
 const old=[...raf.callbacks.values()][0]!;
 value.dispatch({type:'zoomAnimated',targetTransform:{x:50,y:50,k:3}});flushSync();expect(raf.cancelled).toContain(0);expect(raf.callbacks.size).toBe(1);
 old(100);flushSync();expect(value.state.isAnimating).toBe(true);
 raf.advance(100);await Promise.resolve();flushSync();expect(value.state.transform).toEqual({x:50,y:50,k:3});expect(value.state.isAnimating).toBe(false);
});
it('zoom unmount cancels its frame without dispatching into a borrowed store', async () => {
 const raf=frames(),value=store(),target=container();const component=mount(ChartPrimitive,{target,props:{store:value,config:{enableAnimations:true},plotBuilder:()=>document.createElement('div')}});flushSync();
 value.dispatch({type:'zoomAnimated',targetTransform:{x:10,y:10,k:2}});flushSync();const stale=[...raf.callbacks.values()][0]!;
 await unmount(component);expect(raf.callbacks.size).toBe(0);const before=value.state;stale(100);expect(value.state).toBe(before);
});

import ResizeHarness from './test-components/ResizeLifecycleHarness.svelte';
it('B046-4 fixed/auto transitions retire observers and reject their late deliveries',async()=>{
 const observers:Array<{callback:ResizeObserverCallback;disconnect:ReturnType<typeof vi.fn>;observe:ReturnType<typeof vi.fn>}>=[];
 vi.stubGlobal('ResizeObserver',class {disconnect=vi.fn();observe=vi.fn();unobserve=vi.fn();constructor(public callback:ResizeObserverCallback){observers.push(this);}});
 const value=store(),target=container();const component=mount(ResizeHarness,{target,props:{store:value}});disposers.push(()=>unmount(component));flushSync();expect(observers).toHaveLength(1);
 const deliver=(index:number,width:number,height:number)=>{const observer=observers[index]!;observer.callback([{contentRect:{width,height}} as ResizeObserverEntry],observer as unknown as ResizeObserver);flushSync();};
 deliver(0,800,500);expect(value.state.dimensions.width).toBe(800);component.size(320,240);flushSync();expect(observers[0]!.disconnect).toHaveBeenCalledOnce();expect(value.state.dimensions.width).toBe(320);
 deliver(0,999,999);expect(value.state.dimensions.width).toBe(320);component.size(400);flushSync();expect(value.state.dimensions.width).toBe(400);expect(value.state.dimensions.height).toBe(400);
 component.size();flushSync();expect(observers).toHaveLength(2);deliver(1,700,450);expect(value.state.dimensions.width).toBe(700);
 await unmount(component);disposers.pop();expect(observers[1]!.disconnect).toHaveBeenCalledOnce();const previous=value.state;deliver(1,900,900);expect(value.state).toBe(previous);
});
it('zoom progress does not restart the current animation and native id zero is cancelled',async()=>{
 const raf=frames(),value=store(),target=container();const component=mount(ChartPrimitive,{target,props:{store:value,config:{enableAnimations:true},plotBuilder:()=>document.createElement('div')}});disposers.push(()=>unmount(component));flushSync();
 value.dispatch({type:'zoomAnimated',targetTransform:{x:20,y:20,k:2}});flushSync();raf.advance(25);expect(raf.cancelled).toEqual([]);expect(raf.callbacks.size).toBe(1);expect(value.state.transform.k).toBeGreaterThan(1);raf.advance(100);await Promise.resolve();flushSync();expect(value.state.transform.k).toBe(2);expect(raf.callbacks.size).toBe(0);
});
it('domain padding ignores nonfinite values and stays finite for wide finite ranges',()=>{
 expect(calculateDomain([{x:Infinity},{x:-Infinity},{x:NaN},{x:10}],'x')).toEqual([9,11]);
 const bounds=calculateDomain([{x:-1e308},{x:1e308}],'x') as [number,number];expect(bounds.every(Number.isFinite)).toBe(true);expect(bounds[0]).toBeLessThan(-1e308);expect(bounds[1]).toBeGreaterThan(1e308);
});
it('a replaced target rejects old completion even before the Svelte cleanup flush',async()=>{
 const raf=frames(),value=store(),target=container();const component=mount(ChartPrimitive,{target,props:{store:value,config:{enableAnimations:true},plotBuilder:()=>document.createElement('div')}});disposers.push(()=>unmount(component));flushSync();
 value.dispatch({type:'zoomAnimated',targetTransform:{x:10,y:10,k:2}});flushSync();const successor={x:50,y:50,k:3};value.dispatch({type:'zoomAnimated',targetTransform:successor});
 raf.advance(100);await Promise.resolve();expect(value.state.isAnimating).toBe(true);expect(value.state.targetTransform).toBe(successor);raf.advance(100);await Promise.resolve();flushSync();expect(value.state.transform).toEqual(successor);
});

import {animateZoomTransition} from '../src/lib/utils/animate-zoom.js';
it('animator observes pre-abort and abort inside progress without scheduling another frame',async()=>{
 const raf=frames(),controller=new AbortController(),dispatch=vi.fn();controller.abort();await animateZoomTransition({x:0,y:0,k:1},{x:1,y:1,k:2},dispatch,vi.fn(),100,controller.signal);expect(raf.callbacks.size).toBe(0);
 const active=new AbortController();const promise=animateZoomTransition({x:0,y:0,k:1},{x:1,y:1,k:2},dispatch,()=>active.abort(),100,active.signal);raf.advance(25);await promise;expect(raf.callbacks.size).toBe(0);expect(dispatch).not.toHaveBeenCalled();
});
it('animator rejects throwing callbacks and releases pending native work',async()=>{
 const raf=frames();const completion=animateZoomTransition({x:0,y:0,k:1},{x:1,y:1,k:2},()=>{throw new Error('completion failed');},()=>{},0);const rejected=expect(completion).rejects.toThrow('completion failed');raf.advance(0);await rejected;expect(raf.callbacks.size).toBe(0);
});
it('an immediate pointer/pan zoom retires an earlier programmatic animation',async()=>{
 const raf=frames(),value=store(),target=container();const component=mount(ChartPrimitive,{target,props:{store:value,config:{enableAnimations:true},plotBuilder:()=>document.createElement('div')}});disposers.push(()=>unmount(component));flushSync();
 value.dispatch({type:'zoomAnimated',targetTransform:{x:100,y:100,k:3}});flushSync();const gesture={x:15,y:-10,k:1.2};value.dispatch({type:'zoom',transform:gesture});
 raf.advance(100);await Promise.resolve();flushSync();expect(value.state.transform).toEqual(gesture);expect(value.state.isAnimating).toBe(false);expect(value.state.targetTransform).toBeUndefined();expect(raf.callbacks.size).toBe(0);
});

it('selection callback replacement does not replay unchanged selection', () => {
 const value=store(), target=container(), first=vi.fn(), second=vi.fn();
 const component=mount(ResizeHarness,{target,props:{store:value}});disposers.push(()=>unmount(component));flushSync();
 component.selectionCallback(first);flushSync();value.dispatch({type:'selectPoint',index:0,data:rows[0]!});flushSync();expect(first).toHaveBeenCalledOnce();
 component.selectionCallback(second);flushSync();expect(second).not.toHaveBeenCalled();
 value.dispatch({type:'selectPoint',index:1,data:rows[1]!});flushSync();expect(second).toHaveBeenCalledOnce();
});
it('retired plot attachment timers cannot attach to the replacement and unmount cancels pending work', async () => {
 let next=0;const callbacks=new Map<number,()=>void>();const cancelled:number[]=[];
 vi.stubGlobal('setTimeout',(callback:()=>void)=>{const id=next++;callbacks.set(id,callback);return id;});
 vi.stubGlobal('clearTimeout',(id:number)=>{cancelled.push(id);callbacks.delete(id);});
 const value=store(),target=container();
 const component=mount(ChartPrimitive,{target,props:{store:value,config:{},enableBrush:true,plotBuilder:()=>{
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  if(!('width' in svg)){Object.defineProperty(svg,'width',{value:{baseVal:{value:600}}});Object.defineProperty(svg,'height',{value:{baseVal:{value:400}}});}
  return svg;
 }}});flushSync();
 const retired=[...callbacks.values()][0]!;value.dispatch({type:'focusPoint',index:0});flushSync();
 expect(cancelled).toContain(0);retired();expect(target.querySelectorAll('.cs-brush')).toHaveLength(0);
 const live=[...callbacks.values()].at(-1)!;callbacks.clear();live();expect(target.querySelectorAll('.cs-brush')).toHaveLength(1);
 value.dispatch({type:'focusPoint',index:1});flushSync();expect(callbacks.size).toBe(1);await unmount(component);expect(callbacks.size).toBe(0);
});
