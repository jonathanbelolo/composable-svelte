import { flushSync, mount, unmount, type Component } from 'svelte';
import { page, userEvent } from 'vitest/browser';
import { onTestFinished, describe, it, expect } from 'vitest';
import Drawer from '../../src/lib/navigation-components/Drawer.svelte';
import { createStore } from '../../src/lib/store.svelte.js';
import { ManagedIntegrationBuilder, optionalSlot, type PresentationView } from '../../src/lib/navigation/managed-integration.js';
import type { Reducer, Store } from '../../src/lib/types.js';
import type { PresentationAction } from '../../src/lib/navigation/types.js';
import { Effect } from '../../src/lib/effect.js';
import { resetBodyScroll } from '../helpers/body-scroll.js';

// ============================================================================
// Test Fixtures
// ============================================================================

interface TestState {
  value: string;
}

type TestAction = { type: 'update'; value: string };

interface ParentState {
  destination: { type: 'test'; state: TestState } | null;
}

type ParentAction =
  | { type: 'show' }
  | { type: 'destination'; action: PresentationAction<TestAction> };

const destinationSlot = optionalSlot<ParentState, ParentAction>()('destination');
const childReducer: Reducer<NonNullable<ParentState['destination']>, TestAction> = (state) => [state, Effect.none()];
const presentationBinders = new WeakMap<object, () => PresentationView<NonNullable<ParentState['destination']>, TestAction> | undefined>();

function createManagedStore(config: {
  initialState: ParentState;
  reducer: Reducer<ParentState, ParentAction>;
}): Store<ParentState, ParentAction> {
  const composition = new ManagedIntegrationBuilder<ParentState, ParentAction, undefined>(config.reducer)
    .with(destinationSlot, childReducer)
    .build();
  const store = createStore({ initialState: config.initialState, ...composition });
  presentationBinders.set(store, () => composition.bind(store, destinationSlot));
  onTestFinished(() => store.destroy());
  return store;
}

function bindPresentation(store: Store<ParentState, ParentAction>): PresentationView<NonNullable<ParentState['destination']>, TestAction> | undefined {
  const bind = presentationBinders.get(store);
  if (!bind) throw new Error('Expected a managed test store');
  return bind();
}

function renderManaged<const Props extends Record<string, unknown>>(component: Component<Props>, props: Props) {
  const target = document.createElement('div');
  document.body.append(target);
  const instance = mount(component, { target, props });
  flushSync();
  let disposed = false;
  const cleanup = async () => {
    if (disposed) return;
    disposed = true;
    await unmount(instance);
    target.remove();
  };
  onTestFinished(cleanup);
  return { unmount: cleanup };
}

// ============================================================================
// Drawer Component Tests
// ============================================================================

describe('Drawer Component', () => {
  it('shows when store is non-null', async () => {
    const parentStore = createManagedStore({
      initialState: {
        destination: { type: 'test', state: { value: 'test' } }
      },
      reducer: (state) => [state, Effect.none()]
    });

    const scopedStore = bindPresentation(parentStore);

    renderManaged(Drawer, { store: scopedStore });

    const drawer = page.getByRole('dialog');
    await expect.element(drawer).toBeInTheDocument();
  });

  it('hides when store is undefined', async () => {
    renderManaged(Drawer, { store: undefined });

    // Check that no dialog exists
    const drawers = page.getByRole('dialog').elements();
    expect(drawers.length).toBe(0);
  });

  it('dismisses drawer when Escape pressed', async () => {
    let dismissCalled = false;

    const parentStore = createManagedStore({
      initialState: {
        destination: { type: 'test', state: { value: 'test' } }
      },
      reducer: (state, action) => {
        if (
          action.type === 'destination' &&
          action.action.type === 'dismiss'
        ) {
          dismissCalled = true;
          return [{ ...state, destination: null }, Effect.none()];
        }
        return [state, Effect.none()];
      }
    });

    const scopedStore = bindPresentation(parentStore);

    renderManaged(Drawer, { store: scopedStore });

    // Drawer should be visible
    const drawer = page.getByRole('dialog');
    await expect.element(drawer).toBeInTheDocument();

    // Press Escape
    await userEvent.keyboard('{Escape}');

    // Give time for event to process
    await new Promise(resolve => setTimeout(resolve, 50));

    // Verify dismiss was called
    expect(dismissCalled).toBe(true);
  });

  it('dismisses drawer when clicking backdrop', async () => {
    let dismissCalled = false;

    const parentStore = createManagedStore({
      initialState: {
        destination: { type: 'test', state: { value: 'test' } }
      },
      reducer: (state, action) => {
        if (
          action.type === 'destination' &&
          action.action.type === 'dismiss'
        ) {
          dismissCalled = true;
          return [{ ...state, destination: null }, Effect.none()];
        }
        return [state, Effect.none()];
      }
    });

    const scopedStore = bindPresentation(parentStore);

    renderManaged(Drawer, { store: scopedStore });

    // Drawer should be visible
    const drawer = page.getByRole('dialog');
    await expect.element(drawer).toBeInTheDocument();

    // Trigger pointerdown event on document (simulates clicking outside)
    const pointerEvent = new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      button: 0
    });
    document.dispatchEvent(pointerEvent);

    // Give time for event to process
    await new Promise(resolve => setTimeout(resolve, 50));

    // Verify dismiss was called
    expect(dismissCalled).toBe(true);
  });

  it('respects disableEscapeKey prop', async () => {
    const parentStore = createManagedStore({
      initialState: {
        destination: { type: 'test', state: { value: 'test' } }
      },
      reducer: (state, action) => {
        if (
          action.type === 'destination' &&
          action.action.type === 'dismiss'
        ) {
          return [{ ...state, destination: null }, Effect.none()];
        }
        return [state, Effect.none()];
      }
    });

    const scopedStore = bindPresentation(parentStore);

    renderManaged(Drawer, { store: scopedStore, disableEscapeKey: true });

    // Press Escape
    await userEvent.keyboard('{Escape}');

    // Drawer should still be visible (Escape disabled)
    const drawer = page.getByRole('dialog');
    await expect.element(drawer).toBeInTheDocument();
  });

  it('respects disableClickOutside prop', async () => {
    let dismissCalled = false;

    const parentStore = createManagedStore({
      initialState: {
        destination: { type: 'test', state: { value: 'test' } }
      },
      reducer: (state, action) => {
        if (
          action.type === 'destination' &&
          action.action.type === 'dismiss'
        ) {
          dismissCalled = true;
          return [{ ...state, destination: null }, Effect.none()];
        }
        return [state, Effect.none()];
      }
    });

    const scopedStore = bindPresentation(parentStore);

    renderManaged(Drawer, { store: scopedStore, disableClickOutside: true });

    // Trigger pointerdown event on document
    const pointerEvent = new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      button: 0
    });
    document.dispatchEvent(pointerEvent);

    // Give time for event to process
    await new Promise(resolve => setTimeout(resolve, 50));

    // Drawer should still be visible (click-outside disabled)
    const drawer = page.getByRole('dialog');
    await expect.element(drawer).toBeInTheDocument();
    expect(dismissCalled).toBe(false);
  });

  it('applies custom width', async () => {
    const parentStore = createManagedStore({
      initialState: {
        destination: { type: 'test', state: { value: 'test' } }
      },
      reducer: (state) => [state, Effect.none()]
    });

    const scopedStore = bindPresentation(parentStore);

    renderManaged(Drawer, { store: scopedStore, width: '400px' });

    const drawer = page.getByRole('dialog');
    const style = drawer.element().getAttribute('style');
    expect(style).toContain('width: 400px');
  });

  it('applies left positioning by default', async () => {
    const parentStore = createManagedStore({
      initialState: {
        destination: { type: 'test', state: { value: 'test' } }
      },
      reducer: (state) => [state, Effect.none()]
    });

    const scopedStore = bindPresentation(parentStore);

    renderManaged(Drawer, { store: scopedStore });

    const drawer = page.getByRole('dialog');
    await expect.element(drawer).toHaveClass(/left-0/);
    await expect.element(drawer).toHaveClass(/border-r/);
  });

  it('applies right positioning when side="right"', async () => {
    const parentStore = createManagedStore({
      initialState: {
        destination: { type: 'test', state: { value: 'test' } }
      },
      reducer: (state) => [state, Effect.none()]
    });

    const scopedStore = bindPresentation(parentStore);

    renderManaged(Drawer, { store: scopedStore, side: 'right' });

    const drawer = page.getByRole('dialog');
    await expect.element(drawer).toHaveClass(/right-0/);
    await expect.element(drawer).toHaveClass(/border-l/);
  });

  it('applies custom classes', async () => {
    const parentStore = createManagedStore({
      initialState: {
        destination: { type: 'test', state: { value: 'test' } }
      },
      reducer: (state) => [state, Effect.none()]
    });

    const scopedStore = bindPresentation(parentStore);

    renderManaged(Drawer, {
        store: scopedStore,
        class: 'custom-drawer-content',
        backdropClass: 'custom-backdrop'
      });

    const drawer = page.getByRole('dialog');
    await expect.element(drawer).toHaveClass(/custom-drawer-content/);
  });

  it('respects unstyled prop', async () => {
    const parentStore = createManagedStore({
      initialState: {
        destination: { type: 'test', state: { value: 'test' } }
      },
      reducer: (state) => [state, Effect.none()]
    });

    const scopedStore = bindPresentation(parentStore);

    renderManaged(Drawer, { store: scopedStore, unstyled: true });

    const drawer = page.getByRole('dialog');
    const className = drawer.element().className;
    expect(className).toBe('');
  });

  it('prevents body scroll when visible', async () => {
    const parentStore = createManagedStore({
      initialState: {
        destination: { type: 'test', state: { value: 'test' } }
      },
      reducer: (state) => [state, Effect.none()]
    });

    const scopedStore = bindPresentation(parentStore);

    // Reset first: body.style is shared across every test in the worker, and
    // a lock leaked by an earlier test made the old form pass on its own.
    resetBodyScroll();
    expect(document.body.style.overflow).toBe('');

    const screen = renderManaged(Drawer, { store: scopedStore });
    expect(document.body.style.overflow).toBe('hidden');

    screen.unmount();
    expect(document.body.style.overflow).toBe('');
  });
});
