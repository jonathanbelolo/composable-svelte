import { it, expect, vi } from 'vitest';
import { createStore } from '../src/lib/store.svelte.js';
import { carouselReducer } from '../src/lib/components/ui/carousel/carousel.reducer.js';
import { createInitialCarouselState, type CarouselState, type CarouselAction } from '../src/lib/components/ui/carousel/carousel.types.js';
const slides = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
it('publishes an atomic transitioning state before a reentrant subscriber can navigate', () => {
    const store = createStore<CarouselState, CarouselAction>({ initialState: createInitialCarouselState(slides), reducer: carouselReducer, ssr: { deferEffects: false } });
    let attempted = false;
    const stop = store.subscribe(state => { if (state.currentIndex === 1 && !attempted) {
        attempted = true;
        store.dispatch({ type: 'nextSlide' });
    } });
    try {
        store.dispatch({ type: 'nextSlide' });
        expect(attempted).toBe(true);
        expect(store.state.currentIndex).toBe(1);
        expect(store.state.isTransitioning).toBe(true);
    }
    finally {
        stop();
        store.destroy();
    }
});
it('tagged start notification cannot relatch a transition that already completed', () => {
    const [moving] = carouselReducer(createInitialCarouselState(slides), { type: 'nextSlide' });
    expect(moving.isTransitioning).toBe(true);
    const [complete] = carouselReducer(moving, { type: 'transitionCompleted', transitionId: moving.transitionId! });
    const [late] = carouselReducer(complete, { type: 'transitionStarted', transitionId: moving.transitionId! });
    expect(late).toBe(complete);
    expect(late.isTransitioning).toBe(false);
});

it('parks autoplay work for non-navigable slides and resumes after replacement', () => {
 vi.useFakeTimers();
 const store = createStore<CarouselState, CarouselAction>({initialState:createInitialCarouselState([],0,true,100),reducer:carouselReducer,ssr:{deferEffects:false}});
 try {
  store.dispatch({type:'autoPlayStarted'});expect(vi.getTimerCount()).toBe(0);
  store.dispatch({type:'slidesUpdated',slides});expect(vi.getTimerCount()).toBe(1);
  store.dispatch({type:'slidesUpdated',slides:[slides[0]!]});expect(vi.getTimerCount()).toBe(0);
 } finally {store.destroy();vi.useRealTimers();}
});
