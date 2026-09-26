import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import ManagedModalPresentation from '../fixtures/ManagedModalPresentation.svelte';
import Modal from '../../src/lib/navigation-components/Modal.svelte';
import ModalPrimitive from '../../src/lib/navigation-components/primitives/ModalPrimitive.svelte';
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
  const app = mount(ManagedModalPresentation, { target, props });
  flushSync();
  cleanups.push(async () => {
    await unmount(app);
    target.remove();
  });
  return { app, target };
}

describe('DEF-021 Packet A: Managed Modal Presentation', () => {
  it('genuine Modal Escape and pointer dismissal act on real managed composition', async () => {
    const { app } = setup({ useWrapper: false });
    app.open(1, 'Escape Target');
    flushSync();
    expect(document.querySelector('[data-testid="modal-shell"]')).not.toBeNull();

    // 1. Escape key dismissal
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    flushSync();
    expect(app.getRootStore().state.modal).toBeNull();
    expect(document.querySelector('[data-testid="modal-shell"]')).toBeNull();

    // 2. Outside pointer dismissal
    app.open(2, 'Pointer Target');
    flushSync();
    expect(document.querySelector('[data-testid="modal-shell"]')).not.toBeNull();
    document.body.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
    await vi.waitFor(() => expect(app.getRootStore().state.modal).toBeNull());
    flushSync();
    expect(document.querySelector('[data-testid="modal-shell"]')).toBeNull();
  });

  it('wrapper Modal supports genuine Escape and pointer dismissal', async () => {
    const { app } = setup({ useWrapper: true });
    app.open(10, 'Wrapper Dialog');
    flushSync();
    expect(document.querySelector('[data-dialog-type="modal"]')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    flushSync();
    expect(app.getRootStore().state.modal).toBeNull();
    expect(document.querySelector('[data-dialog-type="modal"]')).toBeNull();

    app.open(20, 'Wrapper Dialog 2');
    flushSync();
    expect(document.querySelector('[data-dialog-type="modal"]')).not.toBeNull();
    document.body.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
    await vi.waitFor(() => expect(app.getRootStore().state.modal).toBeNull());
    flushSync();
    expect(document.querySelector('[data-dialog-type="modal"]')).toBeNull();
  });

  it('rejects structural legacy and forged input before rendering or authority use', () => {
    const forged = {
      state: { count: 1, title: 'Forged' },
      dispatch: vi.fn(),
      select: vi.fn(),
      subscribe: vi.fn(() => () => {}),
      dismiss: vi.fn()
    };

    const targetPrimitive = createTarget();
    cleanups.push(() => targetPrimitive.remove());
    expect(() => {
      mount(ModalPrimitive, { target: targetPrimitive, props: { store: forged as any } });
    }).toThrow(TypeError);
    expect(forged.dismiss).not.toHaveBeenCalled();
    expect(forged.dispatch).not.toHaveBeenCalled();

    const targetWrapper = createTarget();
    cleanups.push(() => targetWrapper.remove());
    expect(() => {
      mount(Modal, { target: targetWrapper, props: { store: forged as any } });
    }).toThrow(TypeError);
    expect(forged.dismiss).not.toHaveBeenCalled();

    const legacy = {
      subscribe: vi.fn(),
      dispatch: vi.fn(),
      dismiss: vi.fn()
    };
    const targetLegacy = createTarget();
    cleanups.push(() => targetLegacy.remove());
    expect(() => {
      mount(ModalPrimitive, { target: targetLegacy, props: { store: legacy as any } });
    }).toThrow(TypeError);
    expect(legacy.dismiss).not.toHaveBeenCalled();

    const targetNull = createTarget();
    cleanups.push(() => targetNull.remove());
    expect(() => {
      mount(ModalPrimitive, { target: targetNull, props: { store: null as any } });
    }).toThrow(TypeError);
  });

  it('retired view state does not render live content while non-idle presentation shell remains', () => {
    const { app } = setup({ useWrapper: true });
    app.open(1, 'Living View');
    app.setPresentation({ status: 'presented', content: { count: 1, title: 'Living View' } });
    flushSync();

    expect(document.querySelector('[data-dialog-type="modal"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="modal-live-content"]')).not.toBeNull();

    // Transition to dismissing while store state retires
    app.setPresentation({ status: 'dismissing', content: { count: 1, title: 'Living View' } });
    app.retireState();
    flushSync();

    // Live occupant content is removed when state is retired
    expect(document.querySelector('[data-testid="modal-live-content"]')).toBeNull();
    // The presentation shell remains available for exit animation
    expect(document.querySelector('[data-dialog-type="modal"]')).not.toBeNull();

    // Settling to idle unmounts the shell
    app.setPresentation({ status: 'idle' });
    flushSync();
    expect(document.querySelector('[data-dialog-type="modal"]')).toBeNull();
  });

  it('pointer-down followed by same-case replacement does not dismiss the replacement', async () => {
    const { app } = setup({ useWrapper: false });
    app.open(1, 'First Owner');
    flushSync();

    const view1 = app.getBoundView()!;
    expect(view1).toBeDefined();
    assertPresentationView(view1);

    // Arm pointer-down outside
    document.body.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));

    // Replace with same-case feature before timer delivery
    app.replaceOwner(2, 'Second Owner');
    flushSync();

    const view2 = app.getBoundView()!;
    expect(view2).not.toBe(view1);
    assertPresentationView(view2);

    // Allow initial pending pointer timer to elapse
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Replacement feature was not dismissed
    expect(app.getRootStore().state.modal).toEqual({ count: 2, title: 'Second Owner' });
    expect(view2.state).toEqual({ count: 2, title: 'Second Owner' });

    // Fresh pointer gesture correctly dismisses the replacement
    document.body.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
    await vi.waitFor(() => expect(app.getRootStore().state.modal).toBeNull());
    expect(view2.state).toBeUndefined();
  });

  it('re-enrolls Escape for the replacement while stale direct dismissal stays inert', () => {
    const { app } = setup({ useWrapper: false });
    app.open(1, 'First');
    flushSync();

    const view1 = app.getBoundView()!;
    assertPresentationView(view1);

    // Same-case replacement
    app.replaceOwner(2, 'Second');
    flushSync();

    const view2 = app.getBoundView()!;
    expect(view2).not.toBe(view1);
    assertPresentationView(view2);
    expect(view1.state).toBeUndefined();

    // The stale origin remains inert independently of the component callback.
    view1.dismiss();
    expect(app.getRootStore().state.modal).toEqual({ count: 2, title: 'Second' });

    // A fresh Escape must use a newly enrolled callback captured with view2. If the
    // old enrollment remained, its stale captured view would no-op here.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    flushSync();
    expect(app.getRootStore().state.modal).toBeNull();
    expect(view2.state).toBeUndefined();
  });

  it('restores the original opener after an authority replacement on retained DOM', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    cleanups.push(() => opener.remove());
    opener.focus();

    const { app } = setup({ useWrapper: false });
    app.open(1, 'First');
    flushSync();
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    const inside = document.querySelector<HTMLButtonElement>('[data-testid="modal-dismiss-btn"]')!;
    inside.focus();
    expect(document.activeElement).toBe(inside);

    app.replaceOwner(2, 'Second');
    flushSync();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    flushSync();

    expect(app.getRootStore().state.modal).toBeNull();
    await expect.poll(() => document.activeElement).toBe(opener);
  });

  it('wrapper snippet receives the same genuine view identity', () => {
    let observedSnippetStore: unknown = undefined;
    const { app } = setup({
      useWrapper: true,
      onSnippetStore: (s: unknown) => {
        observedSnippetStore = s;
      }
    });

    app.open(77, 'Identical View');
    flushSync();

    const genuineView = app.getBoundView();
    expect(genuineView).toBeDefined();
    assertPresentationView(genuineView);
    expect(observedSnippetStore).toBe(genuineView);
    expect(app.getSnippetStore()).toBe(genuineView);
  });
});
