import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import ManagedSheetDrawerPresentation from '../fixtures/ManagedSheetDrawerPresentation.svelte';
import Sheet from '../../src/lib/navigation-components/Sheet.svelte';
import SheetPrimitive from '../../src/lib/navigation-components/primitives/SheetPrimitive.svelte';
import Drawer from '../../src/lib/navigation-components/Drawer.svelte';
import DrawerPrimitive from '../../src/lib/navigation-components/primitives/DrawerPrimitive.svelte';
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
  const app = mount(ManagedSheetDrawerPresentation, { target, props });
  flushSync();
  cleanups.push(async () => {
    await unmount(app);
    target.remove();
  });
  return { app, target };
}

describe('DEF-021 Packet B2: Managed Sheet and Drawer Presentation', () => {
  it('genuine Sheet and Drawer Escape and pointer dismissal act on real managed composition', async () => {
    for (const family of ['sheet', 'drawer'] as const) {
      const { app } = setup({ family, useWrapper: false });
      const shellSelector = `[data-testid="${family}-shell"]`;

      app.open(1, `${family} Escape`);
      flushSync();
      expect(document.querySelector(shellSelector)).not.toBeNull();

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      flushSync();
      expect(app.getRootStore().state[family]).toBeNull();
      expect(document.querySelector(shellSelector)).toBeNull();

      app.open(2, `${family} Pointer`);
      flushSync();
      expect(document.querySelector(shellSelector)).not.toBeNull();
      document.body.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
      await vi.waitFor(() => expect(app.getRootStore().state[family]).toBeNull());
      flushSync();
      expect(document.querySelector(shellSelector)).toBeNull();
    }
  });

  it('wrapper Sheet and Drawer support genuine Escape and pointer dismissal', async () => {
    for (const config of [
      { family: 'sheet' as const, selector: '[data-dialog-type="sheet"]' },
      { family: 'drawer' as const, selector: '[role="dialog"][aria-label="Side drawer"]' }
    ]) {
      const { app } = setup({ family: config.family, useWrapper: true });
      app.open(10, `Wrapper ${config.family}`);
      flushSync();
      expect(document.querySelector(config.selector)).not.toBeNull();

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      flushSync();
      expect(app.getRootStore().state[config.family]).toBeNull();
      expect(document.querySelector(config.selector)).toBeNull();

      app.open(20, `Wrapper ${config.family} 2`);
      flushSync();
      expect(document.querySelector(config.selector)).not.toBeNull();
      document.body.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
      await vi.waitFor(() => expect(app.getRootStore().state[config.family]).toBeNull());
      flushSync();
      expect(document.querySelector(config.selector)).toBeNull();
    }
  });

  it('rejects structural legacy and forged input before rendering or authority use', () => {
    const forged = {
      state: { count: 1, title: 'Forged' },
      dispatch: vi.fn(),
      select: vi.fn(),
      subscribe: vi.fn(() => () => {}),
      dismiss: vi.fn()
    };

    for (const Component of [SheetPrimitive, Sheet, DrawerPrimitive, Drawer]) {
      const target = createTarget();
      cleanups.push(() => target.remove());
      expect(() => {
        mount(Component, { target, props: { store: forged as any } });
      }).toThrow(TypeError);
      expect(forged.dismiss).not.toHaveBeenCalled();
      expect(forged.dispatch).not.toHaveBeenCalled();
    }

    const legacy = { subscribe: vi.fn(), dispatch: vi.fn(), dismiss: vi.fn() };
    for (const Component of [SheetPrimitive, DrawerPrimitive]) {
      const target = createTarget();
      cleanups.push(() => target.remove());
      expect(() => {
        mount(Component, { target, props: { store: legacy as any } });
      }).toThrow(TypeError);
      expect(legacy.dismiss).not.toHaveBeenCalled();
    }

    for (const Component of [SheetPrimitive, DrawerPrimitive]) {
      const target = createTarget();
      cleanups.push(() => target.remove());
      expect(() => {
        mount(Component, { target, props: { store: null as any } });
      }).toThrow(TypeError);
    }
  });

  it('retired view state does not render live content while non-idle presentation shell remains', () => {
    for (const config of [
      { family: 'sheet' as const, shellSelector: '[data-dialog-type="sheet"]' },
      { family: 'drawer' as const, shellSelector: '[role="dialog"][aria-label="Side drawer"]' }
    ]) {
      const { app } = setup({ family: config.family, useWrapper: true });
      const liveSelector = `[data-testid="${config.family}-live-content"]`;

      app.open(1, `Living ${config.family}`);
      app.setPresentation({ status: 'presented', content: { count: 1, title: 'Living' } });
      flushSync();

      expect(document.querySelector(config.shellSelector)).not.toBeNull();
      expect(document.querySelector(liveSelector)).not.toBeNull();

      app.setPresentation({ status: 'dismissing', content: { count: 1, title: 'Living' } });
      app.retireState();
      flushSync();

      expect(document.querySelector(liveSelector)).toBeNull();
      expect(document.querySelector(config.shellSelector)).not.toBeNull();

      app.setPresentation({ status: 'idle' });
      flushSync();
      expect(document.querySelector(config.shellSelector)).toBeNull();
    }
  });

  it('pointer-down followed by same-case replacement does not dismiss the replacement', async () => {
    for (const family of ['sheet', 'drawer'] as const) {
      const { app } = setup({ family, useWrapper: false });
      app.open(1, 'First');
      flushSync();

      const view1 = app.getBoundView()!;
      expect(view1).toBeDefined();
      assertPresentationView(view1);

      document.body.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
      app.replaceOwner(2, 'Second');
      flushSync();

      const view2 = app.getBoundView()!;
      expect(view2).not.toBe(view1);
      assertPresentationView(view2);

      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(app.getRootStore().state[family]).toEqual({ count: 2, title: 'Second' });
      expect(view2.state).toEqual({ count: 2, title: 'Second' });

      document.body.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
      await vi.waitFor(() => expect(app.getRootStore().state[family]).toBeNull());
      expect(view2.state).toBeUndefined();
    }
  });

  it('re-enrolls Escape for the replacement while stale direct dismissal stays inert', () => {
    for (const family of ['sheet', 'drawer'] as const) {
      const { app } = setup({ family, useWrapper: false });
      app.open(1, 'First');
      flushSync();

      const view1 = app.getBoundView()!;
      assertPresentationView(view1);

      app.replaceOwner(2, 'Second');
      flushSync();

      const view2 = app.getBoundView()!;
      expect(view2).not.toBe(view1);
      assertPresentationView(view2);
      expect(view1.state).toBeUndefined();

      view1.dismiss();
      expect(app.getRootStore().state[family]).toEqual({ count: 2, title: 'Second' });

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      flushSync();
      expect(app.getRootStore().state[family]).toBeNull();
      expect(view2.state).toBeUndefined();
    }
  });

  it('restores the original opener after an authority replacement on retained DOM', async () => {
    for (const family of ['sheet', 'drawer'] as const) {
      const opener = document.createElement('button');
      document.body.append(opener);
      cleanups.push(() => opener.remove());
      opener.focus();

      const { app } = setup({ family, useWrapper: false });
      app.open(1, 'First');
      flushSync();
      await new Promise<void>((resolve) => queueMicrotask(resolve));

      const inside = document.querySelector<HTMLButtonElement>(`[data-testid="${family}-dismiss-btn"]`)!;
      inside.focus();
      expect(document.activeElement).toBe(inside);

      app.replaceOwner(2, 'Second');
      flushSync();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      flushSync();

      expect(app.getRootStore().state[family]).toBeNull();
      await expect.poll(() => document.activeElement).toBe(opener);
    }
  });

  it('wrapper snippet receives the same genuine view identity', () => {
    for (const family of ['sheet', 'drawer'] as const) {
      let observedSnippetStore: unknown = undefined;
      const { app } = setup({
        family,
        useWrapper: true,
        onSnippetStore: (s: unknown) => {
          observedSnippetStore = s;
        }
      });

      app.open(55, 'Snippet Test');
      flushSync();

      const genuineView = app.getBoundView();
      expect(genuineView).toBeDefined();
      assertPresentationView(genuineView);
      expect(observedSnippetStore).toBe(genuineView);
      expect(app.getSnippetStore()).toBe(genuineView);
    }
  });

  it('preserves family-specific geometry and layout properties', () => {
    const { app: sheetApp } = setup({ family: 'sheet', useWrapper: true, side: 'bottom', height: '75vh' });
    sheetApp.open(1, 'Geometry Sheet');
    flushSync();

    const sheetDialog = document.querySelector<HTMLElement>('[data-dialog-type="sheet"]');
    expect(sheetDialog).not.toBeNull();
    expect(sheetDialog?.style.height).toBe('75vh');
    expect(sheetDialog?.getAttribute('aria-label')).toBe('Bottom sheet');

    const { app: drawerAppLeft } = setup({ family: 'drawer', useWrapper: true, side: 'left', width: '450px' });
    drawerAppLeft.open(1, 'Left Drawer');
    flushSync();

    const drawerLeft = document.querySelector<HTMLElement>('[role="dialog"][aria-label="Side drawer"]');
    expect(drawerLeft).not.toBeNull();
    expect(drawerLeft?.style.width).toBe('450px');
    expect(drawerLeft?.className).toContain('border-r');
    expect(drawerLeft?.className).toContain('left-0');

    const { app: drawerAppRight } = setup({ family: 'drawer', useWrapper: true, side: 'right', width: '280px' });
    drawerAppRight.open(2, 'Right Drawer');
    flushSync();

    const drawers = document.querySelectorAll<HTMLElement>('[role="dialog"][aria-label="Side drawer"]');
    const drawerRight = drawers[drawers.length - 1];
    expect(drawerRight).not.toBeNull();
    expect(drawerRight?.style.width).toBe('280px');
    expect(drawerRight?.className).toContain('border-l');
    expect(drawerRight?.className).toContain('right-0');
  });
});
