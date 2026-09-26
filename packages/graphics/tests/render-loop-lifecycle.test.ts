import { describe, it, expect, vi, afterEach } from 'vitest';
import { RenderLoop } from '../src/lib/utils/render-loop.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function frames() {
	let next = 0;
	const queue = new Map<number, FrameRequestCallback>();
	const target = Object.assign(new EventTarget(), { hidden: false });
	vi.stubGlobal('document', target);
	vi.spyOn(performance, 'now').mockReturnValue(0);
	vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
	 queue.set(++next, callback);
	 return next;
	});
	vi.stubGlobal('cancelAnimationFrame', (id: number) => queue.delete(id));
	return {
	 queue, target,
	 step(time: number) {
	  const entries = [...queue];
	  queue.clear();
	  for (const [, callback] of entries) callback(time);
	 }
	};
}

describe('render loop callback ownership', () => {
	it.each(['stop', 'destroy'] as const)('does not rearm after callback calls %s', method => {
	 const framesControl = frames();
	 const loop = new RenderLoop();
	 const callback = vi.fn(() => loop[method]());
	 try {
	  loop.start(callback);
	  framesControl.step(20);
	  expect(callback).toHaveBeenCalledTimes(1);
	  expect(framesControl.queue.size).toBe(0);
	  expect(loop.isRunning()).toBe(false);
	 } finally { loop.destroy(); }
	});

	it('a restart during delivery leaves only the new generation queued', () => {
	 const framesControl = frames();
	 const loop = new RenderLoop();
	 const newer = vi.fn();
	 try {
	  loop.start(() => { loop.stop(); loop.start(newer); });
	  framesControl.step(20);
	  expect(framesControl.queue.size).toBe(1);
	  framesControl.step(40);
	  expect(newer).toHaveBeenCalledTimes(1);
	  expect(framesControl.queue.size).toBe(1);
	 } finally { loop.destroy(); }
	 expect(framesControl.queue.size).toBe(0);
	});

	it('double start preserves the already live generation', () => {
	 const framesControl = frames();
	 const loop = new RenderLoop();
	 const first = vi.fn();
	 const second = vi.fn();
	 const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
	 try {
	  loop.start(first);
	  loop.start(second);
	  framesControl.step(20);
	  framesControl.step(40);
	  expect(first).toHaveBeenCalledTimes(2);
	  expect(second).not.toHaveBeenCalled();
	  expect(warning).toHaveBeenCalledOnce();
	  expect(framesControl.queue.size).toBe(1);
	 } finally { loop.destroy(); }
	 expect(framesControl.queue.size).toBe(0);
	});

	it('hidden frames retain one loop without calling the renderer', () => {
	 const framesControl = frames();
	 const loop = new RenderLoop();
	 const callback = vi.fn();
	 try {
	  loop.start(callback);
	  framesControl.target.hidden = true;
	  framesControl.target.dispatchEvent(new Event('visibilitychange'));
	  framesControl.step(20);
	  expect(callback).not.toHaveBeenCalled();
	  expect(framesControl.queue.size).toBe(1);
	  framesControl.target.hidden = false;
	  framesControl.target.dispatchEvent(new Event('visibilitychange'));
	  framesControl.step(40);
	  expect(callback).toHaveBeenCalledOnce();
	 } finally { loop.destroy(); }
	});

	it('a throwing renderer reports the error and leaves a restartable stopped loop', () => {
	 const framesControl = frames();
	 const loop = new RenderLoop();
	 const newer = vi.fn();
	 try {
	  loop.start(() => { throw new Error('renderer failed'); });
	  expect(() => framesControl.step(20)).toThrow('renderer failed');
	  expect(loop.isRunning()).toBe(false);
	  expect(framesControl.queue.size).toBe(0);
	  loop.start(newer);
	  framesControl.step(40);
	  expect(newer).toHaveBeenCalledOnce();
	 } finally { loop.destroy(); }
	});

	it('an old throwing renderer cannot stop a reentrantly started successor', () => {
	 const framesControl = frames();
	 const loop = new RenderLoop();
	 const newer = vi.fn();
	 try {
	  loop.start(() => { loop.stop(); loop.start(newer); throw new Error('old failed'); });
	  expect(() => framesControl.step(20)).toThrow('old failed');
	  expect(loop.isRunning()).toBe(true);
	  expect(framesControl.queue.size).toBe(1);
	  framesControl.step(40);
	  expect(newer).toHaveBeenCalledOnce();
	 } finally { loop.destroy(); }
	});
});

it('destroy is terminal even when start is called later', () => {
 const control=frames();const loop=new RenderLoop();loop.destroy();
 expect(()=>loop.start(()=>{})).toThrow('destroyed');expect(loop.isRunning()).toBe(false);expect(control.queue.size).toBe(0);
});
it('a restarted generation has fresh FPS and warning measurements', () => {
 const control=frames();const warning=vi.spyOn(console,'warn').mockImplementation(()=>{});const loop=new RenderLoop();
 try {loop.start(()=>{});control.step(1000);expect(loop.getCurrentFPS()).toBe(1);expect(warning).toHaveBeenCalledTimes(1);
 loop.stop();loop.start(()=>{});expect(loop.getCurrentFPS()).toBe(0);control.step(1000);expect(warning).toHaveBeenCalledTimes(2);
 } finally {loop.destroy();}
});
