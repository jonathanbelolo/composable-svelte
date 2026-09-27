/**
 * The `<Scene>` canvas is a real orbit control (drag, wheel, arrow keys), so it
 * must be a named focus stop in document order.
 *
 * Babylon's default `canvasTabIndex` is 1: a positive tab index that pulled the
 * canvas ahead of everything before it, reasserted on every pointer move. The
 * adapter sets 0. The canvas stays focusable and keyboard-orbitable; it is not
 * stripped of its inputs.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { flushSync, mount, unmount } from 'svelte';
import type { Engine, Scene as BabylonScene, ArcRotateCamera } from '@babylonjs/core';
import Scene from '../src/components/Scene.svelte';
import { BabylonAdapter } from '../src/adapters/babylon-adapter.js';
import { createInitialGraphicsState } from '../src/core/initial-state.js';
import type { GraphicsStore } from '../src/core/types.js';

const settle = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));
let cleanup: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanup.reverse()) fn();
  cleanup = [];
});

class ObservedAdapter extends BabylonAdapter {
  liveEngine: Engine | null = null;
  liveScene: BabylonScene | null = null;
  override attachEngine(engine: Engine): BabylonScene {
    const scene = super.attachEngine(engine);
    this.liveEngine = engine;
    this.liveScene = scene;
    return scene;
  }
}

function store(): GraphicsStore {
  const state = createInitialGraphicsState();
  return { state, dispatch() {}, subscribe(listener) { listener(state); return () => {}; } };
}

async function mountBetweenButtons(props: Record<string, unknown> = {}) {
  const target = document.createElement('div');
  target.innerHTML = '<button id="before">before</button><div id="slot"></div><button id="after">after</button>';
  document.body.append(target);
  const adapter = new ObservedAdapter();
  const instance = mount(Scene as never, {
    target: target.querySelector('#slot')!,
    props: { store: store(), createAdapter: () => adapter, width: 240, height: 160, ...props }
  });
  flushSync();
  await settle(150);
  cleanup.push(() => { unmount(instance); target.remove(); });
  const canvas = target.querySelector('canvas')!;
  const camera = adapter.liveScene!.activeCamera as ArcRotateCamera;
  return { target, canvas, adapter, camera };
}

describe('<Scene> canvas focus and naming', () => {
  it('is a focus stop in document order, and stays there after pointer moves', async () => {
    const { target, canvas } = await mountBetweenButtons();
    expect(canvas.tabIndex).toBe(0);
    const before = target.querySelector('#before') as HTMLElement;
    const after = target.querySelector('#after') as HTMLElement;

    // From the element before it, Tab reaches the canvas next. With a positive tab
    // index the canvas sits ahead of every tabindex-0 element in the sequence, so
    // Tab from here would skip it and land on #after.
    // Real clicks set the keyboard's starting point; `focus()` alone does not move
    // it reliably inside the browser-mode test frame.
    await userEvent.click(before);
    await userEvent.tab();
    expect(document.activeElement, 'the canvas is not next in document order').toBe(canvas);
    await userEvent.tab();
    expect(document.activeElement).toBe(after);

    // Pointer moves are where Babylon reasserts the engine's tab index: a real hover.
    await userEvent.hover(canvas);
    await settle(30);
    expect(canvas.tabIndex, 'a pointer move reasserted a positive tab index').toBe(0);

    // And the order still holds, backwards (a positive index would skip it here too).
    await userEvent.click(after);
    await userEvent.tab({ shift: true });
    expect(document.activeElement, 'Shift+Tab skipped the canvas').toBe(canvas);
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(before);
  });

  it('keeps the camera inputs: arrow keys, wheel and drag still orbit or zoom', async () => {
    const { canvas, camera } = await mountBetweenButtons();
    canvas.focus();
    const alpha = camera.alpha;
    await userEvent.keyboard('{ArrowLeft>}');
    await settle(250);
    await userEvent.keyboard('{/ArrowLeft}');
    expect(camera.alpha, 'arrow keys no longer orbit the focused canvas').not.toBeCloseTo(alpha, 3);

    const radius = camera.radius;
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -200, bubbles: true, cancelable: true }));
    await settle(250);
    expect(camera.radius, 'the wheel no longer zooms').not.toBeCloseTo(radius, 3);

    const before = camera.alpha;
    const box = canvas.getBoundingClientRect();
    const at = (x: number) => ({ bubbles: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1, clientX: box.left + x, clientY: box.top + 80 });
    canvas.dispatchEvent(new PointerEvent('pointerdown', at(60)));
    for (let x = 70; x <= 160; x += 10) canvas.dispatchEvent(new PointerEvent('pointermove', at(x)));
    canvas.dispatchEvent(new PointerEvent('pointerup', { ...at(160), buttons: 0 }));
    await settle(250);
    expect(camera.alpha, 'dragging no longer orbits').not.toBeCloseTo(before, 3);
    expect(canvas.tabIndex).toBe(0);
  });

  it('names the canvas: a generic default, or the label the app passes', async () => {
    const first = await mountBetweenButtons();
    expect(first.canvas.getAttribute('role')).toBe('img');
    expect(first.canvas.getAttribute('aria-label')).toBe('Interactive 3D scene');
    const second = await mountBetweenButtons({ label: 'Pavilion model — drag or use arrow keys to orbit' });
    expect(second.canvas.getAttribute('aria-label')).toBe('Pavilion model — drag or use arrow keys to orbit');
  });
});
