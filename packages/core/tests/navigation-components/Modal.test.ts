import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import { describe, it, expect } from 'vitest';
import Modal from '../../src/navigation-components/Modal.svelte';
import ModalTestWrapper from './ModalTestWrapper.svelte';
import { createStore } from '../../src/store.svelte.js';
import { scopeToDestination } from '../../src/navigation/scope-to-destination.js';
import { Effect } from '../../src/effect.js';

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

    render(Modal, {
      props: { store: scopedStore }
    });

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
    render(Modal, {
      props: { store: null }
    });

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
    render(ModalTestWrapper, {
      props: { parentStore }
    });

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

    render(Modal, {
      props: { store: scopedStore, disableEscapeKey: true }
    });

    // Press Escape
    await userEvent.keyboard('{Escape}');

    // Modal should still be visible (Escape disabled)
    const dialog = page.getByRole('dialog');
    await expect.element(dialog).toBeInTheDocument();
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
      props: {
        store: scopedStore,
        class: 'custom-modal-content',
        backdropClass: 'custom-backdrop'
      }
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

    render(Modal, {
      props: { store: scopedStore, unstyled: true }
    });

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

    render(Modal, {
      props: { store: scopedStore }
    });

    // Check body overflow style directly
    const bodyStyle = document.body.style.overflow;
    expect(bodyStyle).toBe('hidden');
  });
});
