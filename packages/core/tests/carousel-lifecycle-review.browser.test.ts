import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from 'vitest-browser-svelte';
import Carousel from '../src/lib/components/ui/carousel/Carousel.svelte';
afterEach(cleanup);
describe('carousel mounted regression',()=>{
 it('DEF011 zero/single slides disable navigation and do not produce transition callbacks',async()=>{
  for(const slides of [[],[{id:'one',data:'One'}]]){
   const changed=vi.fn();const screen=render(Carousel,{slides,loop:true,onSlideChange:changed});
   await expect.element(screen.getByRole('button',{name:'Next slide'})).toBeDisabled();
   await expect.element(screen.getByRole('button',{name:'Previous slide'})).toBeDisabled();
   screen.container.querySelector('.carousel-container')!.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
   expect(changed).not.toHaveBeenCalled();await screen.unmount();
  }
 });
 it('DEF012 autoplay keeps progressing when ticks overlap actual track animations',async()=>{
  const changed=vi.fn();const started=vi.fn();const stopped=vi.fn();
  const screen=render(Carousel,{slides:[{id:'a'},{id:'b'},{id:'c'}],autoPlayInterval:30,transitionDuration:100,onSlideChange:changed,onAutoPlayStart:started,onAutoPlayStop:stopped});
  await expect.poll(()=>changed.mock.calls.length,{timeout:3000}).toBeGreaterThanOrEqual(2);
  expect(started).toHaveBeenCalledTimes(1);
  screen.container.querySelector('.carousel-container')!.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));
  expect(stopped).toHaveBeenCalledTimes(1);
  const count=changed.mock.calls.length;
  await new Promise(resolve=>setTimeout(resolve,160));
  expect(changed).toHaveBeenCalledTimes(count);
  await screen.unmount();
 });
});
