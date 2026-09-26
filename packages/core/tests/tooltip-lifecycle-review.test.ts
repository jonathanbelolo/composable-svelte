import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createStore } from '../src/lib/store.svelte.js';
import { TestStore } from '../src/lib/test/test-store.js';
import { tooltipReducer } from '../src/lib/components/ui/tooltip/tooltip.reducer.js';
import { initialTooltipState } from '../src/lib/components/ui/tooltip/tooltip.types.js';
const disposers:Array<()=>void>=[];
beforeEach(()=>vi.useFakeTimers());afterEach(()=>{for(const dispose of disposers.splice(0))dispose();vi.clearAllTimers();vi.useRealTimers();});
const slides=[{id:'a'},{id:'b'},{id:'c'}];
describe('tooltip lifecycle correction',()=>{
 it('DEF004 leaves during entrance then reaches idle through actual effect clocks',async()=>{
  const store=createStore({initialState:initialTooltipState,reducer:tooltipReducer,dependencies:{hoverDelay:10},ssr:{deferEffects:false}});disposers.push(()=>store.destroy());
  store.dispatch({type:'hoverStarted',content:'one'});await vi.advanceTimersByTimeAsync(10);expect(store.state.presentation.status).toBe('presenting');
  store.dispatch({type:'hoverEnded'});await vi.advanceTimersByTimeAsync(150);expect(store.state.presentation.status).toBe('dismissing');
  await vi.advanceTimersByTimeAsync(105);expect(store.state.presentation.status).toBe('idle');expect(vi.getTimerCount()).toBe(0);
 });
 it('latest reenter intent and content win during entrance',async()=>{
  const store=createStore({initialState:initialTooltipState,reducer:tooltipReducer,dependencies:{hoverDelay:10},ssr:{deferEffects:false}});disposers.push(()=>store.destroy());
  store.dispatch({type:'hoverStarted',content:'one'});await vi.advanceTimersByTimeAsync(10);store.dispatch({type:'hoverEnded'});store.dispatch({type:'hoverStarted',content:'two'});
  await vi.advanceTimersByTimeAsync(150);expect(store.state.presentation).toEqual({status:'presented',content:'two'});
 });
 it('stale completion and destroyed wait cannot affect a later phase or leave timers',async()=>{
  const store=createStore({initialState:initialTooltipState,reducer:tooltipReducer,dependencies:{hoverDelay:10},ssr:{deferEffects:false}});disposers.push(()=>store.destroy());
  store.dispatch({type:'hoverStarted',content:'one'});await vi.advanceTimersByTimeAsync(160);store.dispatch({type:'hoverEnded'});
  const old=store.state.presentationVersion;
  store.dispatch({type:'hoverStarted',content:'two'});await vi.advanceTimersByTimeAsync(10);expect(store.state.presentation.status).toBe('presenting');
  store.dispatch({type:'presentation',event:{type:'dismissalCompleted'},presentationVersion:old});expect(store.state.presentation.status).toBe('presenting');
  store.destroy();expect(vi.getTimerCount()).toBe(0);
 });
 it('canceling hover before delay releases the timer and TestStore work',async()=>{
  const store=new TestStore({initialState:initialTooltipState,reducer:tooltipReducer,dependencies:{hoverDelay:300}});disposers.push(()=>store.destroy());
  await store.send({type:'hoverStarted',content:'one'});await store.send({type:'hoverEnded'});expect(vi.getTimerCount()).toBe(0);await store.finish();
 });
});
