import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import { describe, it, expect } from 'vitest';
import Modal from '../../src/lib/navigation-components/Modal.svelte';
import ModalTestWrapper from './ModalTestWrapper.svelte';
import { createStore } from '../../src/lib/store.svelte.js';
import { scopeToDestination } from '../../src/lib/navigation/scope-to-destination.js';
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
  | { type: 'destination'; action: any };

// ============================================================================
// Modal Component Tests
// ============================================================================

describe('Modal Component', () => {
  it('shows when store is non-null', async () => {
    const parentStore = createStore<ParentState, ParentAction>({
      initialState: {
        destination: { type: 'test', state: { value: 'test' } }
      },
      reducer: (state) => [state, Effect.none()]
    });

    const scopedStore = scopeToDestination(
      parentStore,
      ['destination'],
      'test',
      'destination'
    );

    render(Modal, { store: scopedStore });

    const dialog = page.getByRole('dialog');
    await expect.element(dialog).toBeInTheDocument();
  });

  it('hides when store is null', async () => {
    const parentStore = createStore<ParentState, ParentAction>({
      initialState: { destination: null },
      reducer: (state) => [state, Effect.none()]
    });

    const scopedStore = scopeToDestination(
      parentStore,
      ['destination'],
      'test',
      'destination'
    );

    // When destination is null, scopedStore is null
    // So we pass null to Modal
    render(Modal, { store: null });

    // Check that no dialog exists
    const dialogs = page.getByRole('dialog').elements();
    expect(dialogs.length).toBe(0);
  });

  it('dismisses modal and removes from DOM when Escape pressed', async () => {
    const parentStore = createStore<ParentState, ParentAction>({
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
    render(ModalTestWrapper, { parentStore });

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

    const parentStore = createStore<ParentState, ParentAction>({
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

    const scopedStore = scopeToDestination(
      parentStore,
      ['destination'],
      'test',
      'destination'
    );

    render(Modal, { store: scopedStore });

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
    const parentStore = createStore<ParentState, ParentAction>({
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

    const scopedStore = scopeToDestination(
      parentStore,
      ['destination'],
      'test',
      'destination'
    );

    render(Modal, { store: scopedStore, disableEscapeKey: true });

    // Press Escape
    await userEvent.keyboard('{Escape}');

    // Modal should still be visible (Escape disabled)
    const dialog = page.getByRole('dialog');
    await expect.element(dialog).toBeInTheDocument();
  });

  it('respects disableClickOutside prop', async () => {
    let dismissCalled = false;

    const parentStore = createStore<ParentState, ParentAction>({
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

    const scopedStore = scopeToDestination(
      parentStore,
      ['destination'],
      'test',
      'destination'
    );

    render(Modal, { store: scopedStore, disableClickOutside: true });

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
    const parentStore = createStore<ParentState, ParentAction>({
      initialState: {
        destination: { type: 'test', state: { value: 'test' } }
      },
      reducer: (state) => [state, Effect.none()]
    });

    const scopedStore = scopeToDestination(
      parentStore,
      ['destination'],
      'test',
      'destination'
    );

    render(Modal, {
        store: scopedStore,
        class: 'custom-modal-content',
        backdropClass: 'custom-backdrop'
      });

    const dialog = page.getByRole('dialog');
    await expect.element(dialog).toHaveClass(/custom-modal-content/);
  });

  it('respects unstyled prop', async () => {
    const parentStore = createStore<ParentState, ParentAction>({
      initialState: {
        destination: { type: 'test', state: { value: 'test' } }
      },
      reducer: (state) => [state, Effect.none()]
    });

    const scopedStore = scopeToDestination(
      parentStore,
      ['destination'],
      'test',
      'destination'
    );

    render(Modal, { store: scopedStore, unstyled: true });

    const dialog = page.getByRole('dialog');
    const className = dialog.element().className;
    expect(className).toBe('');
  });

  it('prevents body scroll when visible', async () => {
    const parentStore = createStore<ParentState, ParentAction>({
      initialState: {
        destination: { type: 'test', state: { value: 'test' } }
      },
      reducer: (state) => [state, Effect.none()]
    });

    const scopedStore = scopeToDestination(
      parentStore,
      ['destination'],
      'test',
      'destination'
    );

    // Reset first: body.style is shared across every test in the worker, and
    // a lock leaked by an earlier test made the old form pass on its own.
    resetBodyScroll();
    expect(document.body.style.overflow).toBe('');

    const screen = render(Modal, { store: scopedStore });
    expect(document.body.style.overflow).toBe('hidden');

    screen.unmount();
    expect(document.body.style.overflow).toBe('');
  });
});
