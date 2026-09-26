import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, tick } from 'svelte';
import { createStore } from '@composable-svelte/core';
import GalleryHarness from './fixtures/GalleryHarness.svelte';
import { createInitialShaderGalleryState, shaderGalleryReducer } from '../src/lib/shader-reducer';
import { GALLERY_CONTEXT_KEY, type ShaderGalleryContext } from '../src/lib/gallery-context';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=';
const stores: ReturnType<typeof makeStore>[] = [];
const cleanups: Array<() => Promise<void>> = [];
function makeStore() {
  return createStore({ initialState: createInitialShaderGalleryState(), reducer: shaderGalleryReducer, dependencies: {} });
}
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  stores.splice(0).forEach(store => store.destroy());
  vi.restoreAllMocks();
});
async function setup(context?: ShaderGalleryContext) {
  const target = document.createElement('div'); document.body.append(target);
  const store = makeStore(); stores.push(store);
  const actions = vi.spyOn(store, 'dispatch');
  const app = mount(GalleryHarness, {
    target,
    props: { store, standalone: !!context, initialSrc: PNG },
    ...(context ? { context: new Map([[GALLERY_CONTEXT_KEY, context]]) } : {})
  });
  let live = true;
  const dispose = async () => { if (live) { live = false; await unmount(app); target.remove(); } };
  cleanups.push(dispose);
  await tick();
  return { target, store, actions, app, dispose };
}
function boundary(success = true) {
  const callbacks: Array<() => void> = [];
  const register = vi.fn<ShaderGalleryContext['registerImageElement']>((_id, _element, _src, _shader, ready) => {
    if (ready) callbacks.push(ready);
    return success;
  });
  const context: ShaderGalleryContext = {
    isFallback: () => false,
    registerImageElement: register,
    unregisterImageElement: vi.fn(),
    updateImageShader: vi.fn(),
    updateImagePosition: vi.fn()
  };
  return { context, register, callbacks };
}
function unloaded() {
  vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(false);
}
function deliverLoad(image: HTMLImageElement) {
  Object.defineProperty(image, 'complete', { configurable: true, value: true });
  Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 1 });
  image.dispatchEvent(new Event('load'));
}

describe('actual gallery and overlay integration', () => {
  it('applies numeric and updated CSS dimensions', async () => {
    const { target, app } = await setup();
    const box = target.querySelector<HTMLElement>('.gallery-container')!;
    expect(getComputedStyle(box).width).toBe('600px');
    expect(getComputedStyle(box).minHeight).toBe('400px');
    app.change({ width: '320px', height: '240px' }); await tick();
    expect(getComputedStyle(box).width).toBe('320px');
    expect(getComputedStyle(box).minHeight).toBe('240px');
  });
  it('cached images register during mount without a later load event', async () => {
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(1);
    const warning = vi.spyOn(console, 'warn');
    const { store } = await setup();
    expect(store.state.images.has('image-1')).toBe(true);
    expect(warning.mock.calls.some(call => String(call[0]).includes('not initialized'))).toBe(false);
  });
  it('context loss restores DOM after fade and stays in fallback after restore', async () => {
    const { target, store } = await setup();
    const image = target.querySelector('img')!;
    await expect.poll(() => image.style.opacity).toBe('0');
    const canvas = target.querySelector('canvas')!;
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    await expect.poll(() => getComputedStyle(image).opacity).toBe('1');
    canvas.dispatchEvent(new Event('webglcontextrestored')); await tick();
    expect(getComputedStyle(image).opacity).toBe('1');
    expect(store.state.images.has('image-1')).toBe(true);
  });
  it('real GPU context loss restores visible fallback content', async () => {
    const { target } = await setup();
    const image = target.querySelector('img')!;
    await expect.poll(() => image.style.opacity).toBe('0');
    const extension = target.querySelector('canvas')!.getContext('webgl')?.getExtension('WEBGL_lose_context');
    expect(extension).toBeTruthy(); extension!.loseContext();
    await expect.poll(() => getComputedStyle(image).opacity).toBe('1');
  });
  it('unmount before image load produces no unregister action', async () => {
    unloaded();
    const { store, actions, dispose } = await setup();
    expect(store.state.images.size).toBe(0);
    await dispose();
    expect(actions.mock.calls.map(([action]) => action.type)).not.toContain('unregisterImage');
  });
  it('actual WebGL creation failure preserves DOM and avoids registration state', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { target, store, actions, dispose } = await setup();
    const image = target.querySelector('img')!;
    await expect.poll(() => image.complete && image.naturalWidth > 0).toBe(true);
    image.dispatchEvent(new Event('load')); await tick();
    expect(error).toHaveBeenCalled();
    expect(store.state.images.size).toBe(0);
    expect(getComputedStyle(image).opacity).toBe('1');
    await dispose();
    expect(actions.mock.calls.map(([action]) => action.type)).not.toContain('unregisterImage');
    expect(warning.mock.calls.some(call => String(call[0]).includes('not initialized'))).toBe(true);
  });
  it('real loaded texture registers once and source replacement releases captured id', async () => {
    const { target, store, actions, app, dispose } = await setup();
    await expect.poll(() => store.state.images.get('image-1')?.src).toBe(PNG);
    const oldImage = target.querySelector('img')!;
    oldImage.dispatchEvent(new Event('load')); await tick();
    expect(actions.mock.calls.filter(([action]) => action.type === 'registerImage')).toHaveLength(1);
    app.change({ id: 'image-2', src: PNG + '#replacement' }); await tick();
    await expect.poll(() => store.state.images.has('image-2')).toBe(true);
    expect(store.state.images.has('image-1')).toBe(false);
    expect(target.querySelector('img')).not.toBe(oldImage);
    expect(store.state.images.get('image-2')).toEqual({ id: 'image-2', src: PNG + '#replacement' });
    await dispose();
    expect(store.state.images.size).toBe(0);
  });
});

describe('image rendering boundary lifetime', () => {
  it('does not release a failed registration or update its shader', async () => {
    unloaded(); const { context, register } = boundary(false);
    const { target, app, dispose } = await setup(context);
    deliverLoad(target.querySelector('img')!); await tick();
    expect(register).toHaveBeenCalledTimes(1);
    expect(context.updateImageShader).not.toHaveBeenCalled();
    app.change({ shader: 'wave-gentle' }); await tick();
    expect(context.updateImageShader).not.toHaveBeenCalled();
    await dispose(); expect(context.unregisterImageElement).not.toHaveBeenCalled();
  });
  it('repeated loads retain one registration and hover uses the accepted id', async () => {
    unloaded(); const { context, register } = boundary();
    const { target, app, dispose } = await setup(context);
    const image = target.querySelector('img')!;
    deliverLoad(image); deliverLoad(image); await tick();
    expect(register).toHaveBeenCalledTimes(1);
    expect(context.updateImageShader).not.toHaveBeenCalled();
    app.change({ shader: 'wave-gentle' }); await tick();
    expect(context.updateImageShader).toHaveBeenLastCalledWith('image-1', 'wave-gentle');
    target.querySelector('.shader-image-wrapper')!.dispatchEvent(new MouseEvent('mouseenter'));
    expect(context.updateImagePosition).toHaveBeenCalledWith('image-1');
    await dispose(); expect(context.unregisterImageElement).toHaveBeenCalledExactlyOnceWith('image-1', image);
  });
  it('source replacement ignores stale texture callback but accepts current completion', async () => {
    unloaded(); const { context, callbacks } = boundary();
    const { target, app, dispose } = await setup(context);
    const oldImage = target.querySelector('img')!; deliverLoad(oldImage); await tick();
    const oldReady = callbacks[0]!;
    app.change({ src: PNG + '#new' }); await tick();
    const image = target.querySelector('img')!;
    expect(image).not.toBe(oldImage);
    expect(context.unregisterImageElement).toHaveBeenCalledWith('image-1', oldImage);
    oldReady(); await tick(); expect(getComputedStyle(image).opacity).toBe('1');
    deliverLoad(image); await tick(); callbacks[1]!();
    await expect.poll(() => image.style.opacity).toBe('0');
    await dispose();
    image.style.opacity = '1'; callbacks[1]!(); await tick();
    expect(image.style.opacity).toBe('1');
  });
  it('an already running old fade cannot hide a replacement source', async () => {
    unloaded(); const { context, callbacks } = boundary();
    const { target, app } = await setup(context);
    const oldImage = target.querySelector('img')!;
    deliverLoad(oldImage); await tick(); callbacks[0]!();
    await expect.poll(() => oldImage.getAnimations().length).toBeGreaterThan(0);
    const oldCompletions = oldImage.getAnimations().map(animation => animation.finished);
    app.change({ src: PNG + '#during-fade' }); await tick();
    const replacement = target.querySelector('img')!;
    await Promise.allSettled(oldCompletions);
    expect(replacement).not.toBe(oldImage);
    expect(getComputedStyle(replacement).opacity).toBe('1');
  });
  it('broken cached image never registers', async () => {
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(0);
    const { context, register } = boundary(); const { dispose } = await setup(context);
    expect(register).not.toHaveBeenCalled(); await dispose();
    expect(context.unregisterImageElement).not.toHaveBeenCalled();
  });
});
