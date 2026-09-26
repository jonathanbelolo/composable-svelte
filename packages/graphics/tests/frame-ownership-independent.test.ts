import { afterEach, describe, expect, it, vi } from 'vitest';
import { graphicsReducer } from '../src/core/reducer';
import { createInitialGraphicsState } from '../src/core/initial-state';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function frame() {
 const initial = createInitialGraphicsState();
 const [state] = graphicsReducer(initial, { type: 'addMesh', mesh: { id: 'cube', geometry: { type: 'box', size: 1 }, position: [0,0,0], material: { color: 'red' } } }, {});
 const [, effect] = graphicsReducer(state, { type: 'startAnimation', animation: { id: 'a', targetId: 'cube', property: 'position', from: [0,0,0], to: [1,0,0], duration: 1000 } }, {});
 if (effect._tag !== 'Cancellable') throw new Error('Expected cancellable frame');
 return effect;
}
describe('independent frame registration boundaries', () => {
 it('does not allocate for a pre-aborted owner', async () => {
  const controller = new AbortController(); controller.abort();
  const request = vi.fn(); vi.stubGlobal('requestAnimationFrame', request);
  const dispatch = vi.fn(); await frame().execute(dispatch, controller.signal);
  expect(request).not.toHaveBeenCalled(); expect(dispatch).not.toHaveBeenCalled();
 });
 it('cancels handle zero when owner aborts before registration returns', async () => {
  const controller = new AbortController();
  vi.stubGlobal('requestAnimationFrame', () => { controller.abort(); return 0; });
  const cancel = vi.fn(); vi.stubGlobal('cancelAnimationFrame', cancel);
  const remove = vi.spyOn(controller.signal, 'removeEventListener');
  const dispatch = vi.fn(); await frame().execute(dispatch, controller.signal);
  expect(cancel).toHaveBeenCalledExactlyOnceWith(0); expect(remove).toHaveBeenCalledTimes(1); expect(dispatch).not.toHaveBeenCalled();
 });
 it('synchronous frame completion releases its listener and dispatches once', async () => {
  const controller = new AbortController();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(10); return 0; });
  const cancel = vi.fn(); vi.stubGlobal('cancelAnimationFrame', cancel);
  const remove = vi.spyOn(controller.signal, 'removeEventListener'); const dispatch = vi.fn();
  await frame().execute(dispatch, controller.signal); controller.abort();
  expect(dispatch).toHaveBeenCalledTimes(1); expect(remove).toHaveBeenCalledTimes(1); expect(cancel).not.toHaveBeenCalled();
 });
 it('registration failure removes the listener and preserves the error', async () => {
  const controller = new AbortController(); const error = new Error('frame allocation failed');
  vi.stubGlobal('requestAnimationFrame', () => { throw error; });
  const remove = vi.spyOn(controller.signal, 'removeEventListener'); const dispatch = vi.fn();
  await expect(frame().execute(dispatch, controller.signal)).rejects.toBe(error);
  expect(remove).toHaveBeenCalledTimes(1); expect(dispatch).not.toHaveBeenCalled();
 });
});
