import { flushSync, mount, unmount, type Component } from 'svelte';
import { page, userEvent } from 'vitest/browser';
import { onTestFinished, describe, it, expect } from 'vitest';
import Alert from '../../src/lib/navigation-components/Alert.svelte';
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
// Alert Component Tests
// ============================================================================

describe('Alert Component', () => {
  it('shows when store is non-null', async () => {
    const parentStore = createManagedStore({
      initialState: {
        destination: { type: 'test', state: { value: 'test' } }
      },
      reducer: (state) => [state, Effect.none()]
    });

    const scopedStore = bindPresentation(parentStore);

    renderManaged(Alert, { store: scopedStore });

    const alert = page.getByRole('alertdialog');
    await expect.element(alert).toBeInTheDocument();
  });

  it('hides when store is undefined', async () => {
    renderManaged(Alert, { store: undefined });

    // Check that no alertdialog exists
    const alerts = page.getByRole('alertdialog').elements();
    expect(alerts.length).toBe(0);
  });

  it('dismisses alert when Escape pressed', async () => {
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

    renderManaged(Alert, { store: scopedStore });

    // Alert should be visible
    const alert = page.getByRole('alertdialog');
    await expect.element(alert).toBeInTheDocument();

    // Press Escape
    await userEvent.keyboard('{Escape}');

    // Give time for event to process
    await new Promise(resolve => setTimeout(resolve, 50));

    // Verify dismiss was called
    expect(dismissCalled).toBe(true);
  });

  it('dismisses alert when clicking backdrop', async () => {
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

    renderManaged(Alert, { store: scopedStore });

    // Alert should be visible
    const alert = page.getByRole('alertdialog');
    await expect.element(alert).toBeInTheDocument();

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

    renderManaged(Alert, { store: scopedStore, disableEscapeKey: true });

    // Press Escape
    await userEvent.keyboard('{Escape}');

    // Alert should still be visible (Escape disabled)
    const alert = page.getByRole('alertdialog');
    await expect.element(alert).toBeInTheDocument();
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

    renderManaged(Alert, { store: scopedStore, disableClickOutside: true });

    // Trigger pointerdown event on document
    const pointerEvent = new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      button: 0
    });
    document.dispatchEvent(pointerEvent);

    // Give time for event to process
    await new Promise(resolve => setTimeout(resolve, 50));

    // Alert should still be visible (click-outside disabled)
    const alert = page.getByRole('alertdialog');
    await expect.element(alert).toBeInTheDocument();
    expect(dismissCalled).toBe(false);
  });

  it('applies custom classes', async () => {
    const parentStore = createManagedStore({
      initialState: {
        destination: { type: 'test', state: { value: 'test' } }
      },
      reducer: (state) => [state, Effect.none()]
    });

    const scopedStore = bindPresentation(parentStore);

    renderManaged(Alert, {
        store: scopedStore,
        class: 'custom-alert-content',
        backdropClass: 'custom-backdrop'
      });

    const alert = page.getByRole('alertdialog');
    await expect.element(alert).toHaveClass(/custom-alert-content/);
  });

  it('respects unstyled prop', async () => {
    const parentStore = createManagedStore({
      initialState: {
        destination: { type: 'test', state: { value: 'test' } }
      },
      reducer: (state) => [state, Effect.none()]
    });

    const scopedStore = bindPresentation(parentStore);

    renderManaged(Alert, { store: scopedStore, unstyled: true });

    const alert = page.getByRole('alertdialog');
    const className = alert.element().className;
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

    const screen = renderManaged(Alert, { store: scopedStore });
    expect(document.body.style.overflow).toBe('hidden');

    screen.unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('uses max-w-md (smaller than modal)', async () => {
    const parentStore = createManagedStore({
      initialState: {
        destination: { type: 'test', state: { value: 'test' } }
      },
      reducer: (state) => [state, Effect.none()]
    });

    const scopedStore = bindPresentation(parentStore);

    renderManaged(Alert, { store: scopedStore });

    const alert = page.getByRole('alertdialog');
    await expect.element(alert).toHaveClass(/max-w-md/);
  });
});
