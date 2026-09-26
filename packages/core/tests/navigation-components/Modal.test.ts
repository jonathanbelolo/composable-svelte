import { flushSync, mount, unmount, type Component } from 'svelte';
import { page, userEvent } from 'vitest/browser';
import { onTestFinished, describe, it, expect } from 'vitest';
import Modal from '../../src/lib/navigation-components/Modal.svelte';
import ModalTestWrapper from './ModalTestWrapper.svelte';
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
// Modal Component Tests
// ============================================================================

describe('Modal Component', () => {
  it('shows when store is non-null', async () => {
    const parentStore = createManagedStore({
      initialState: {
        destination: { type: 'test', state: { value: 'test' } }
      },
      reducer: (state) => [state, Effect.none()]
    });

    const scopedStore = bindPresentation(parentStore);

    renderManaged(Modal, { store: scopedStore });

    const dialog = page.getByRole('dialog');
    await expect.element(dialog).toBeInTheDocument();
  });

  it('hides when an existing scoped store has no destination', async () => {
    const parentStore = createManagedStore({
      initialState: { destination: null },
      reducer: (state) => [state, Effect.none()]
    });

    const scopedStore = bindPresentation(parentStore);

    onTestFinished(() => parentStore.destroy());
    // Managed binding exposes absence as no view rather than a live nullable scope.
    expect(scopedStore).toBeUndefined();
    expect(parentStore.state.destination).toBeNull();
    renderManaged(Modal, { store: scopedStore });

    // Check that no dialog exists
    const dialogs = page.getByRole('dialog').elements();
    expect(dialogs.length).toBe(0);
  });

  it('hides when store is explicitly undefined', () => {
    renderManaged(Modal, { store: undefined });
    expect(page.getByRole('dialog').elements()).toHaveLength(0);
  });

  it('dismisses modal and removes from DOM when Escape pressed', async () => {
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

    // Use wrapper component that reactively renders Modal based on store state
    renderManaged(ModalTestWrapper, { store: bindPresentation(parentStore) });

    // Modal should be visible
    const dialog = page.getByRole('dialog');
    await expect.element(dialog).toBeInTheDocument();

    // Press Escape using userEvent
    await userEvent.keyboard('{Escape}');

    // Wait for modal to be removed from DOM
    // This verifies the complete end-to-end flow:
    // 1. Escape key pressed
    // 2. Component calls store.dismiss()
    // 3. Reducer sets destination to null
    // 4. Wrapper reactively hides Modal
    // 5. Modal removed from DOM
    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
  });

  it('dismisses modal when clicking backdrop', async () => {
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

    renderManaged(Modal, { store: scopedStore });

    // Modal should be visible
    const dialog = page.getByRole('dialog');
    await expect.element(dialog).toBeInTheDocument();

    // Trigger pointerdown event on document (simulates clicking outside)
    // The clickOutside action listens for pointerdown events
    const pointerEvent = new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      button: 0
    });
    document.dispatchEvent(pointerEvent);

    // Give time for event to process (clickOutside uses setTimeout)
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

    renderManaged(Modal, { store: scopedStore, disableEscapeKey: true });

    // Press Escape
    await userEvent.keyboard('{Escape}');

    // Modal should still be visible (Escape disabled)
    const dialog = page.getByRole('dialog');
    await expect.element(dialog).toBeInTheDocument();
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

    renderManaged(Modal, { store: scopedStore, disableClickOutside: true });

    // Trigger pointerdown event on document (simulates clicking outside)
    const pointerEvent = new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      button: 0
    });
    document.dispatchEvent(pointerEvent);

    // Give time for event to process
    await new Promise(resolve => setTimeout(resolve, 50));

    // Modal should still be visible (click-outside disabled)
    const dialog = page.getByRole('dialog');
    await expect.element(dialog).toBeInTheDocument();
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

    renderManaged(Modal, {
        store: scopedStore,
        class: 'custom-modal-content',
        backdropClass: 'custom-backdrop'
      });

    const dialog = page.getByRole('dialog');
    await expect.element(dialog).toHaveClass(/custom-modal-content/);
  });

  it('respects unstyled prop', async () => {
    const parentStore = createManagedStore({
      initialState: {
        destination: { type: 'test', state: { value: 'test' } }
      },
      reducer: (state) => [state, Effect.none()]
    });

    const scopedStore = bindPresentation(parentStore);

    renderManaged(Modal, { store: scopedStore, unstyled: true });

    const dialog = page.getByRole('dialog');
    const className = dialog.element().className;
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

    const screen = renderManaged(Modal, { store: scopedStore });
    expect(document.body.style.overflow).toBe('hidden');

    screen.unmount();
    expect(document.body.style.overflow).toBe('');
  });
});
