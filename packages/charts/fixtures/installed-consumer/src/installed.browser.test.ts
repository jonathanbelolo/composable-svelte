import { expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import type { ApplicationInstance } from '@composable-svelte/core/application';
import App from './App.svelte';
import type { State, Action, MetricRow } from './model.js';

const waitFor = async (predicate: () => boolean) => {
  const deadline = Date.now() + 10_000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Installed native chart gesture timed out');
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  }
};

it('renders a packed managed chart and lifts a native wheel gesture', async () => {
  const target = document.createElement('div');
  target.style.width = '640px';
  target.style.height = '400px';
  document.body.append(target);
  let application: ApplicationInstance<State, Action> | undefined;
  const component = mount(App, { target, props: { onApp: value => { application = value; } } });
  try {
    flushSync();
    await waitFor(() => target.querySelector('svg') !== null);
    expect(target.querySelectorAll('svg circle')).toHaveLength(2);
    await waitFor(() => {
      const current = target.querySelector('svg');
      return current !== null && Reflect.get(current, '__zoom') !== undefined;
    });
    const svg = target.querySelector('svg')!;
    svg.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100, clientX: 200, clientY: 200 }));
    await waitFor(() => (application?.store.state.chart?.transform.k ?? 1) > 1);
    expect(application!.store.state.chart?.transform.k).toBeGreaterThan(1);
    application!.store.dispatch({ type: 'close' });
    expect(application!.store.state.chart).toBeNull();
  } finally {
    await unmount(component);
    target.remove();
  }
});

it('lifts a native brush gesture into the managed parent action', async () => {
  const target = document.createElement('div');
  target.style.width = '640px';
  target.style.height = '400px';
  document.body.append(target);
  let application: ApplicationInstance<State, Action> | undefined;
  let callbackRows: MetricRow[] | undefined;
  const component = mount(App, { target, props: { brush: true, onApp: value => { application = value; }, onSelectionChange: rows => { callbackRows = rows; } } });
  try {
    flushSync();
    await waitFor(() => target.querySelector('.cs-brush .overlay') !== null);
    const overlay = target.querySelector<SVGRectElement>('.cs-brush .overlay')!;
    const svg = target.querySelector('svg')!;
    const bounds = svg.getBoundingClientRect();
    const circles = Array.from(svg.querySelectorAll('circle'));
    expect(circles).toHaveLength(2);
    const xs = circles.map(circle => Number(circle.getAttribute('cx')));
    const ys = circles.map(circle => Number(circle.getAttribute('cy')));
    const x0 = bounds.left + Math.min(...xs) - 10;
    const y0 = bounds.top + Math.min(...ys) - 10;
    const x1 = bounds.left + Math.max(...xs) + 10;
    const y1 = bounds.top + Math.max(...ys) + 10;
    overlay.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: x0, clientY: y0, view: window }));
    window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, buttons: 1, clientX: x1, clientY: y1, view: window }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0, clientX: x1, clientY: y1, view: window }));
    await waitFor(() => application?.store.state.lastSelection !== null);
    expect(application!.store.state.lastSelection).toHaveLength(2);
    await waitFor(() => callbackRows?.length === 2);
    expect(callbackRows).toEqual(application!.store.state.lastSelection);
  } finally {
    await unmount(component);
    target.remove();
  }
});
