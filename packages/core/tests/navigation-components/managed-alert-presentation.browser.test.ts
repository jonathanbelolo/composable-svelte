import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import ManagedAlertPresentation from '../fixtures/ManagedAlertPresentation.svelte';
import Alert from '../../src/lib/navigation-components/Alert.svelte';
import AlertPrimitive from '../../src/lib/navigation-components/primitives/AlertPrimitive.svelte';
import AlertDialog from '../../src/lib/navigation-components/alert-dialog/AlertDialog.svelte';
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
  const app = mount(ManagedAlertPresentation, { target, props });
  flushSync();
  cleanups.push(async () => {
    await unmount(app);
    target.remove();
  });
  return { app, target };
}

describe('DEF-021 Packet B1: Managed Alert Presentation', () => {
  it('genuine Alert Escape and pointer dismissal act on real managed composition', async () => {
    const { app } = setup({ useWrapper: false });
    app.open(1, 'Escape Target');
    flushSync();
    expect(document.querySelector('[data-testid="alert-shell"]')).not.toBeNull();

    // 1. Escape key dismissal
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    flushSync();
    expect(app.getRootStore().state.alert).toBeNull();
    expect(document.querySelector('[data-testid="alert-shell"]')).toBeNull();

    // 2. Outside pointer dismissal
    app.open(2, 'Pointer Target');
    flushSync();
    expect(document.querySelector('[data-testid="alert-shell"]')).not.toBeNull();
    document.body.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
    await vi.waitFor(() => expect(app.getRootStore().state.alert).toBeNull());
    flushSync();
    expect(document.querySelector('[data-testid="alert-shell"]')).toBeNull();
  });

  it('wrapper Alert supports genuine Escape and pointer dismissal', async () => {
    const { app } = setup({ useWrapper: true });
    app.open(10, 'Wrapper Alert');
    flushSync();
    expect(document.querySelector('[data-dialog-type="alert"]')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    flushSync();
    expect(app.getRootStore().state.alert).toBeNull();
    expect(document.querySelector('[data-dialog-type="alert"]')).toBeNull();

    app.open(20, 'Wrapper Alert 2');
    flushSync();
    expect(document.querySelector('[data-dialog-type="alert"]')).not.toBeNull();
    document.body.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
    await vi.waitFor(() => expect(app.getRootStore().state.alert).toBeNull());
    flushSync();
    expect(document.querySelector('[data-dialog-type="alert"]')).toBeNull();
  });

  it('AlertDialog supports genuine Escape and pointer dismissal', async () => {
    const { app } = setup({
      useAlertDialog: true,
      title: 'Alert Dialog Title',
      description: 'Alert Dialog Description'
    });
    app.open(30, 'Dialog Alert');
    flushSync();
    expect(document.querySelector('[data-dialog-type="alert"]')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    flushSync();
    expect(app.getRootStore().state.alert).toBeNull();
    expect(document.querySelector('[data-dialog-type="alert"]')).toBeNull();

    app.open(40, 'Dialog Alert 2');
    flushSync();
    expect(document.querySelector('[data-dialog-type="alert"]')).not.toBeNull();
    document.body.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
    await vi.waitFor(() => expect(app.getRootStore().state.alert).toBeNull());
    flushSync();
    expect(document.querySelector('[data-dialog-type="alert"]')).toBeNull();
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
      mount(AlertPrimitive, { target: targetPrimitive, props: { store: forged as any } });
    }).toThrow(TypeError);
    expect(forged.dismiss).not.toHaveBeenCalled();
    expect(forged.dispatch).not.toHaveBeenCalled();

    const targetWrapper = createTarget();
    cleanups.push(() => targetWrapper.remove());
    expect(() => {
      mount(Alert, { target: targetWrapper, props: { store: forged as any } });
    }).toThrow(TypeError);
    expect(forged.dismiss).not.toHaveBeenCalled();

    const targetDialog = createTarget();
    cleanups.push(() => targetDialog.remove());
    expect(() => {
      mount(AlertDialog, { target: targetDialog, props: { store: forged as any } });
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
      mount(AlertPrimitive, { target: targetLegacy, props: { store: legacy as any } });
    }).toThrow(TypeError);
    expect(legacy.dismiss).not.toHaveBeenCalled();

    const targetNull = createTarget();
    cleanups.push(() => targetNull.remove());
    expect(() => {
      mount(AlertPrimitive, { target: targetNull, props: { store: null as any } });
    }).toThrow(TypeError);
  });

  it('retired view state does not render live content while non-idle presentation shell remains', () => {
    const { app } = setup({ useWrapper: true });
    app.open(1, 'Living View');
    app.setPresentation({ status: 'presented', content: { count: 1, title: 'Living View' } });
    flushSync();

    expect(document.querySelector('[data-dialog-type="alert"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="alert-live-content"]')).not.toBeNull();

    // Transition to dismissing while store state retires
    app.setPresentation({ status: 'dismissing', content: { count: 1, title: 'Living View' } });
    app.retireState();
    flushSync();

    // Live occupant content is removed when state is retired
    expect(document.querySelector('[data-testid="alert-live-content"]')).toBeNull();
    // The presentation shell remains available for exit animation
    expect(document.querySelector('[data-dialog-type="alert"]')).not.toBeNull();

    // Settling to idle unmounts the shell
    app.setPresentation({ status: 'idle' });
    flushSync();
    expect(document.querySelector('[data-dialog-type="alert"]')).toBeNull();
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
    expect(app.getRootStore().state.alert).toEqual({
      count: 2,
      title: 'Second Owner',
      message: 'Replaced Message'
    });
    expect(view2.state).toEqual({
      count: 2,
      title: 'Second Owner',
      message: 'Replaced Message'
    });

    // Fresh pointer gesture correctly dismisses the replacement
    document.body.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
    await vi.waitFor(() => expect(app.getRootStore().state.alert).toBeNull());
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
    expect(app.getRootStore().state.alert).toEqual({
      count: 2,
      title: 'Second',
      message: 'Replaced Message'
    });

    // A fresh Escape must use a newly enrolled callback captured with view2. If the
    // old enrollment remained, its stale captured view would no-op here.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    flushSync();
    expect(app.getRootStore().state.alert).toBeNull();
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
    const inside = document.querySelector<HTMLButtonElement>('[data-testid="alert-dismiss-btn"]')!;
    inside.focus();
    expect(document.activeElement).toBe(inside);

    app.replaceOwner(2, 'Second');
    flushSync();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    flushSync();

    expect(app.getRootStore().state.alert).toBeNull();
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

  it('proves AlertDialog naming emission and action control on real managed store', () => {
    const { app } = setup({
      useAlertDialog: true,
      title: 'Delete Item?',
      description: 'Are you sure you want to delete this?'
    });

    app.open(5, 'Delete Item?');
    flushSync();

    const dialog = document.querySelector<HTMLElement>('[role="alertdialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('data-dialog-type')).toBe('alert');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');

    const labelledby = dialog?.getAttribute('aria-labelledby');
    const describedby = dialog?.getAttribute('aria-describedby');
    expect(labelledby).toBeTruthy();
    expect(describedby).toBeTruthy();

    const titleEl = document.getElementById(labelledby!);
    const descEl = document.getElementById(describedby!);
    expect(titleEl).not.toBeNull();
    expect(descEl).not.toBeNull();
    expect(titleEl?.textContent?.trim()).toBe('Delete Item?');
    expect(descEl?.textContent?.trim()).toBe('Are you sure you want to delete this?');

    // Action control dispatching into managed store
    const actionBtn = document.querySelector<HTMLButtonElement>('[data-testid="alert-action-btn"]');
    expect(actionBtn).not.toBeNull();
    actionBtn?.click();
    flushSync();

    expect(app.getRootStore().state.alert?.count).toBe(15);
  });

  it('preserves family-specific role, default naming, and consumer backdrop cleanup', () => {
    const { app } = setup({ useWrapper: true });
    app.open(1, 'Alert Role Test');
    flushSync();

    const dialog = document.querySelector<HTMLElement>('[data-dialog-type="alert"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('role')).toBe('alertdialog');
    expect(dialog?.getAttribute('aria-label')).toBe('Alert dialog');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');

    // Content and backdrop are mounted
    expect(document.querySelector('[data-testid="alert-shell"]')).not.toBeNull();

    // Closing cleans up both backdrop and content
    app.close();
    flushSync();
    expect(document.querySelector('[data-dialog-type="alert"]')).toBeNull();
    expect(document.querySelector('[data-testid="alert-shell"]')).toBeNull();
  });
});
