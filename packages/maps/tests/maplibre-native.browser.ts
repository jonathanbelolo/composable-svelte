import { expect, it } from 'vitest';
import { MaplibreAdapter } from '../src/lib/utils/maplibre-adapter.js';

const style = `data:application/json,${encodeURIComponent(JSON.stringify({
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#fff' } }]
}))}`;

it('mounts and destroys a real MapLibre WebGL map with a local style', async () => {
  const container = document.createElement('div');
  container.style.width = '320px';
  container.style.height = '240px';
  document.body.append(container);
  const adapter = new MaplibreAdapter();
  let canvas: HTMLCanvasElement | null = null;
  let context: WebGLRenderingContext | WebGL2RenderingContext | null = null;

  try {
    adapter.initialize(container, {
      center: [0, 0], zoom: 2, style, interactive: false
    });
    const loaded = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('MapLibre did not load')), 10_000);
      adapter.on('load', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    await loaded;
    canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    context = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl') ?? null;
    expect(context).not.toBeNull();
    const flightCompleted = new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('MapLibre flight did not complete')), 10_000);
      adapter.on('moveend', (event: { flightId?: number }) => {
        if (event.flightId !== 1) return;
        clearTimeout(timer);
        resolve(event.flightId);
      });
    });
    adapter.flyTo({ center: [5, 6], zoom: 4, duration: 0 });
    expect(await flightCompleted).toBe(1);
    expect(adapter.getCenter()).toEqual([5, 6]);
  } finally {
    adapter.destroy();
    container.remove();
  }
  expect(container.querySelector('canvas')).toBeNull();
  expect(context?.isContextLost()).toBe(true);
});

it('keeps a sibling map alive when the first engine is removed during load', async () => {
  const firstContainer = document.createElement('div');
  const siblingContainer = document.createElement('div');
  for (const container of [firstContainer, siblingContainer]) {
    container.style.width = '320px';
    container.style.height = '240px';
    document.body.append(container);
  }
  const first = new MaplibreAdapter();
  const sibling = new MaplibreAdapter();
  let retiredLoads = 0;
  let firstDestroyed = false;

  try {
    first.initialize(firstContainer, { center: [0, 0], zoom: 2, style });
    first.on('load', () => { retiredLoads++; });
    sibling.initialize(siblingContainer, { center: [10, 20], zoom: 3, style });
    const siblingLoaded = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Sibling MapLibre map did not load')), 10_000);
      sibling.on('load', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    first.destroy();
    firstDestroyed = true;
    expect(firstContainer.querySelector('canvas')).toBeNull();
    await siblingLoaded;
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(retiredLoads).toBe(0);
    expect(siblingContainer.querySelector('canvas')).not.toBeNull();
    expect(sibling.getCenter()).toEqual([10, 20]);
  } finally {
    if (!firstDestroyed) first.destroy();
    sibling.destroy();
    firstContainer.remove();
    siblingContainer.remove();
  }
});
