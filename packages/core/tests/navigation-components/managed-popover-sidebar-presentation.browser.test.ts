import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import ManagedPopoverSidebarPresentation from '../fixtures/ManagedPopoverSidebarPresentation.svelte';
import Popover from '../../src/lib/navigation-components/Popover.svelte';
import PopoverPrimitive from '../../src/lib/navigation-components/primitives/PopoverPrimitive.svelte';
import Sidebar from '../../src/lib/navigation-components/Sidebar.svelte';
import SidebarPrimitive from '../../src/lib/navigation-components/primitives/SidebarPrimitive.svelte';
import { assertPresentationView } from '../../src/lib/navigation/managed-integration.js';

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

function createTarget(): HTMLDivElement {
  const target = document.createElement('div');
  document.body.appendChild(target);
  return target;
}

function setup(props: Record<string, unknown> = {}) {
  const target = createTarget();
  const app = mount(ManagedPopoverSidebarPresentation, { target, props });
  flushSync();
  cleanups.push(async () => {
    await unmount(app);
    target.remove();
  });
  return { app, target };
}

describe('DEF-021 Packet B: Managed Popover and Sidebar Presentation', () => {
  it('genuine Popover Escape and pointer dismissal act on real managed composition', async () => {
    const { app } = setup({ family: 'popover', useWrapper: false });
    app.open(1, 'Escape Popover');
    flushSync();
    expect(document.querySelector('[data-testid="popover-shell"]')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    flushSync();
    expect(app.getRootStore().state.popover).toBeNull();
    expect(document.querySelector('[data-testid="popover-shell"]')).toBeNull();

    app.open(2, 'Pointer Popover');
    flushSync();
    expect(document.querySelector('[data-testid="popover-shell"]')).not.toBeNull();
    document.body.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
    await vi.waitFor(() => expect(app.getRootStore().state.popover).toBeNull());
    flushSync();
    expect(document.querySelector('[data-testid="popover-shell"]')).toBeNull();
  });

  it('wrapper Popover supports genuine dismissal and preserves portal placement', async () => {
    const { app, target } = setup({ family: 'popover', useWrapper: true });
    app.open(10, 'Wrapper Popover');
    flushSync();
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(target.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    flushSync();
    expect(app.getRootStore().state.popover).toBeNull();
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    app.open(20, 'Wrapper Popover 2');
    flushSync();
    document.body.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
    await vi.waitFor(() => expect(app.getRootStore().state.popover).toBeNull());
    flushSync();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('genuine Sidebar Escape dismissal acts on real composition while preserving inline no-backdrop policy', async () => {
    const { app, target } = setup({ family: 'sidebar', useWrapper: false });
    app.open(1, 'Sidebar Prim');
    flushSync();
    const sidebar = document.querySelector('[data-testid="sidebar-shell"]');
    expect(sidebar).not.toBeNull();
    expect(target.contains(sidebar)).toBe(true);

    // Outside pointer does NOT dismiss Sidebar
    document.body.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(app.getRootStore().state.sidebar).toEqual({ count: 1, title: 'Sidebar Prim' });

    // Escape dismisses
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    flushSync();
    expect(app.getRootStore().state.sidebar).toBeNull();
    expect(document.querySelector('[data-testid="sidebar-shell"]')).toBeNull();
  });

  it('wrapper Sidebar supports genuine Escape dismissal and preserves inline placement', async () => {
    const { app, target } = setup({ family: 'sidebar', useWrapper: true });
    app.open(10, 'Sidebar Wrapper');
    flushSync();
    const wrapper = document.querySelector('[data-sidebar-wrapper]');
    expect(wrapper).not.toBeNull();
    expect(target.contains(wrapper)).toBe(true);

    document.body.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(app.getRootStore().state.sidebar).toEqual({ count: 10, title: 'Sidebar Wrapper' });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    flushSync();
    expect(app.getRootStore().state.sidebar).toBeNull();
    expect(document.querySelector('[data-sidebar-wrapper]')).toBeNull();
  });

  it('rejects structural legacy and forged input before rendering or authority use', () => {
    const forged = {
      state: { count: 1, title: 'Forged' },
      dispatch: vi.fn(),
      select: vi.fn(),
      subscribe: vi.fn(() => () => {}),
      dismiss: vi.fn()
    };

    for (const Comp of [PopoverPrimitive, Popover, SidebarPrimitive, Sidebar]) {
      const t = createTarget();
      cleanups.push(() => t.remove());
      expect(() => mount(Comp, { target: t, props: { store: forged as any } })).toThrow(TypeError);
    }
    expect(forged.dismiss).not.toHaveBeenCalled();
    expect(forged.dispatch).not.toHaveBeenCalled();

    const legacy = { subscribe: vi.fn(), dispatch: vi.fn(), dismiss: vi.fn() };
    for (const Comp of [PopoverPrimitive, SidebarPrimitive]) {
      const t = createTarget();
      cleanups.push(() => t.remove());
      expect(() => mount(Comp, { target: t, props: { store: legacy as any } })).toThrow(TypeError);
      const tNull = createTarget();
      cleanups.push(() => tNull.remove());
      expect(() => mount(Comp, { target: tNull, props: { store: null as any } })).toThrow(TypeError);
    }
    expect(legacy.dismiss).not.toHaveBeenCalled();
  });

  it('retired view state does not render live content while non-idle presentation shell remains', () => {
    const pop = setup({ family: 'popover', useWrapper: true });
    pop.app.open(1, 'Pop Shell');
    pop.app.setPresentation({ status: 'presented', content: { count: 1, title: 'Pop Shell' } });
    flushSync();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="popover-live-content"]')).not.toBeNull();

    pop.app.setPresentation({ status: 'dismissing', content: { count: 1, title: 'Pop Shell' } });
    pop.app.retireState();
    flushSync();
    expect(document.querySelector('[data-testid="popover-live-content"]')).toBeNull();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();

    pop.app.setPresentation({ status: 'idle' });
    flushSync();
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    const side = setup({ family: 'sidebar', useWrapper: true });
    side.app.open(1, 'Side Shell');
    side.app.setPresentation({ status: 'presented', content: { count: 1, title: 'Side Shell' } });
    flushSync();
    expect(document.querySelector('[data-sidebar-wrapper]')).not.toBeNull();
    expect(document.querySelector('[data-testid="sidebar-live-content"]')).not.toBeNull();

    side.app.setPresentation({ status: 'dismissing', content: { count: 1, title: 'Side Shell' } });
    side.app.retireState();
    flushSync();
    expect(document.querySelector('[data-testid="sidebar-live-content"]')).toBeNull();
    expect(document.querySelector('[data-sidebar-wrapper]')).not.toBeNull();

    side.app.setPresentation({ status: 'idle' });
    flushSync();
    expect(document.querySelector('[data-sidebar-wrapper]')).toBeNull();
  });

  it('Popover pointer-down followed by same-case replacement does not dismiss the replacement', async () => {
    const { app } = setup({ family: 'popover', useWrapper: false });
    app.open(1, 'First Owner');
    flushSync();

    const view1 = app.getBoundView()!;
    assertPresentationView(view1);

    document.body.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));

    app.replaceOwner(2, 'Second Owner');
    flushSync();

    const view2 = app.getBoundView()!;
    expect(view2).not.toBe(view1);
    assertPresentationView(view2);

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(app.getRootStore().state.popover).toEqual({ count: 2, title: 'Second Owner' });
    expect(view2.state).toEqual({ count: 2, title: 'Second Owner' });

    document.body.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
    await vi.waitFor(() => expect(app.getRootStore().state.popover).toBeNull());
    expect(view2.state).toBeUndefined();
  });

  it('re-enrolls Escape for the replacement while stale direct dismissal stays inert', () => {
    // Popover
    const pop = setup({ family: 'popover', useWrapper: false });
    pop.app.open(1, 'First Pop');
    flushSync();
    const popV1 = pop.app.getBoundView()!;
    pop.app.replaceOwner(2, 'Second Pop');
    flushSync();
    const popV2 = pop.app.getBoundView()!;
    expect(popV2).not.toBe(popV1);
    expect(popV1.state).toBeUndefined();

    popV1.dismiss();
    expect(pop.app.getRootStore().state.popover).toEqual({ count: 2, title: 'Second Pop' });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    flushSync();
    expect(pop.app.getRootStore().state.popover).toBeNull();
    expect(popV2.state).toBeUndefined();

    // Sidebar
    const side = setup({ family: 'sidebar', useWrapper: false });
    side.app.open(1, 'First Side');
    flushSync();
    const sideV1 = side.app.getBoundView()!;
    side.app.replaceOwner(2, 'Second Side');
    flushSync();
    const sideV2 = side.app.getBoundView()!;
    expect(sideV2).not.toBe(sideV1);
    expect(sideV1.state).toBeUndefined();

    sideV1.dismiss();
    expect(side.app.getRootStore().state.sidebar).toEqual({ count: 2, title: 'Second Side' });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    flushSync();
    expect(side.app.getRootStore().state.sidebar).toBeNull();
    expect(sideV2.state).toBeUndefined();
  });

  it('restores original opener after authority replacement on retained DOM for focus-owning Popover', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    cleanups.push(() => opener.remove());
    opener.focus();

    const { app } = setup({ family: 'popover', useWrapper: false });
    app.open(1, 'Focus Target');
    flushSync();
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    const inside = document.querySelector<HTMLButtonElement>('[data-testid="popover-dismiss-btn"]')!;
    inside.focus();
    expect(document.activeElement).toBe(inside);

    app.replaceOwner(2, 'Focus Replacement');
    flushSync();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    flushSync();

    expect(app.getRootStore().state.popover).toBeNull();
    await expect.poll(() => document.activeElement).toBe(opener);
  });

  it('wrapper snippet receives the same genuine view identity', () => {
    let observedSnippet: unknown = undefined;
    const pop = setup({
      family: 'popover',
      useWrapper: true,
      onSnippetStore: (s: unknown) => { observedSnippet = s; }
    });
    pop.app.open(10, 'Snippet Pop');
    flushSync();
    const popView = pop.app.getBoundView();
    expect(popView).toBeDefined();
    assertPresentationView(popView);
    expect(observedSnippet).toBe(popView);
    expect(pop.app.getSnippetStore()).toBe(popView);

    let observedSideSnippet: unknown = undefined;
    const side = setup({
      family: 'sidebar',
      useWrapper: true,
      onSnippetStore: (s: unknown) => { observedSideSnippet = s; }
    });
    side.app.open(20, 'Snippet Side');
    flushSync();
    const sideView = side.app.getBoundView();
    expect(sideView).toBeDefined();
    assertPresentationView(sideView);
    expect(observedSideSnippet).toBe(sideView);
    expect(side.app.getSnippetStore()).toBe(sideView);
  });

  it('Sidebar honors side and width configurations for layout integration', () => {
    const left = setup({ family: 'sidebar', useWrapper: true });
    left.app.open(1, 'Left');
    flushSync();
    const leftWrap = left.target.querySelector<HTMLElement>('[data-sidebar-wrapper]')!;
    const leftNav = left.target.querySelector<HTMLElement>('nav[aria-label="Sidebar navigation"]')!;
    expect(leftWrap.style.width).toBe('240px');
    expect(leftNav.className).toContain('border-r');

    const right = setup({ family: 'sidebar', useWrapper: true, side: 'right', width: '320px' });
    right.app.open(2, 'Right');
    flushSync();
    const rightWrap = right.target.querySelector<HTMLElement>('[data-sidebar-wrapper]')!;
    const rightNav = right.target.querySelector<HTMLElement>('nav[aria-label="Sidebar navigation"]')!;
    expect(rightWrap.style.width).toBe('320px');
    expect(rightNav.className).toContain('border-l');

    const prim = setup({ family: 'sidebar', useWrapper: false, side: 'right', width: '280px' });
    prim.app.open(3, 'Prim Right');
    flushSync();
    const primContainer = prim.target.querySelector<HTMLElement>('[data-testid="sidebar-container"]')!;
    expect(primContainer.getAttribute('data-side')).toBe('right');
    expect(primContainer.getAttribute('data-width')).toBe('280px');
  });

  it('Popover honors pointer boundary so clicks inside do not dismiss', async () => {
    const { app } = setup({ family: 'popover', useWrapper: false });
    app.open(1, 'Inside Content');
    flushSync();
    const content = document.querySelector<HTMLElement>('[data-testid="popover-content"]')!;
    expect(content).not.toBeNull();

    content.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(app.getRootStore().state.popover).toEqual({ count: 1, title: 'Inside Content' });
    expect(document.querySelector('[data-testid="popover-content"]')).not.toBeNull();
  });
});
