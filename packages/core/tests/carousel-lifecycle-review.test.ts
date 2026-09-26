import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createStore } from '../src/lib/store.svelte.js';
import { TestStore } from '../src/lib/test/test-store.js';
import { carouselReducer } from '../src/lib/components/ui/carousel/carousel.reducer.js';
import { createInitialCarouselState, type CarouselState, type CarouselAction } from '../src/lib/components/ui/carousel/carousel.types.js';
const disposers:Array<()=>void>=[];
beforeEach(()=>vi.useFakeTimers());afterEach(()=>{for(const dispose of disposers.splice(0))dispose();vi.clearAllTimers();vi.useRealTimers();});
const slides=[{id:'a'},{id:'b'},{id:'c'}];
describe('carousel lifecycle correction',()=>{
 it('DEF011 zero and one slides never transition in either direction',async()=>{
  for(const items of [[],slides.slice(0,1)]){const store=new TestStore<CarouselState,CarouselAction>({initialState:createInitialCarouselState(items),reducer:carouselReducer});disposers.push(()=>store.destroy());
   await store.send({type:'nextSlide'});await store.send({type:'previousSlide'});expect(store.state.currentIndex).toBe(0);expect(store.state.isTransitioning).toBe(false);await store.finish();}
 });
 it('DEF012 real autoplay tick overlapping transition schedules later progress and one chain',async()=>{
  const store=createStore<CarouselState,CarouselAction>({initialState:createInitialCarouselState(slides,0,true,100),reducer:carouselReducer,ssr:{deferEffects:false}});disposers.push(()=>store.destroy());
  store.dispatch({type:'autoPlayStarted'});store.dispatch({type:'autoPlayStarted'});expect(vi.getTimerCount()).toBe(1);
  store.dispatch({type:'transitionStarted'});await vi.advanceTimersByTimeAsync(100);expect(store.state.currentIndex).toBe(0);expect(vi.getTimerCount()).toBe(1);
  store.dispatch({type:'transitionCompleted'});await vi.advanceTimersByTimeAsync(100);expect(store.state.currentIndex).toBe(1);expect(store.state.isTransitioning).toBe(true);
  store.dispatch({type:'autoPlayStopped'});expect(vi.getTimerCount()).toBe(0);await vi.advanceTimersByTimeAsync(500);expect(store.state.currentIndex).toBe(1);
 });
 it('stale transition completion cannot clear a new transition after slides replacement',()=>{
  const store=createStore<CarouselState,CarouselAction>({initialState:createInitialCarouselState(slides),reducer:carouselReducer,ssr:{deferEffects:false}});disposers.push(()=>store.destroy());
  store.dispatch({type:'nextSlide'});const old=store.state.transitionId;store.dispatch({type:'slidesUpdated',slides:[{id:'x'},{id:'y'},{id:'z'}]});expect(store.state.isTransitioning).toBe(false);
  store.dispatch({type:'nextSlide'});expect(store.state.isTransitioning).toBe(true);store.dispatch({type:'transitionCompleted',transitionId:old});expect(store.state.isTransitioning).toBe(true);
  store.dispatch({type:'transitionCompleted',transitionId:store.state.transitionId});expect(store.state.isTransitioning).toBe(false);
 });
 it('TestStore autoplay stops and finishes without stray tick; destroy cancels timers',async()=>{
  const store=new TestStore<CarouselState,CarouselAction>({initialState:createInitialCarouselState(slides,0,true,100),reducer:carouselReducer});disposers.push(()=>store.destroy());
  await store.send({type:'autoPlayStarted'});await store.send({type:'autoPlayStopped'});expect(vi.getTimerCount()).toBe(0);await store.finish();
  const live=createStore<CarouselState,CarouselAction>({initialState:createInitialCarouselState(slides,0,true,100),reducer:carouselReducer,ssr:{deferEffects:false}});live.dispatch({type:'autoPlayStarted'});live.destroy();expect(vi.getTimerCount()).toBe(0);
 });
});
