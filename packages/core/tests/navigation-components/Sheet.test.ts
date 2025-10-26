import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import { describe, it, expect } from 'vitest';
import Sheet from '../../src/navigation-components/Sheet.svelte';
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
// Sheet Component Tests
// ============================================================================

describe('Sheet Component', () => {
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

    render(Sheet, {
      props: { store: scopedStore }
    });

    const dialog = page.getByRole('dialog');
    await expect.element(dialog).toBeInTheDocument();
  });

  it('hides when store is null', async () => {
    render(Sheet, {
      props: { store: null }
    });

    // Check that no dialog exists
    const dialogs = page.getByRole('dialog').elements();
    expect(dialogs.length).toBe(0);
  });

  it('dismisses sheet when Escape pressed', async () => {
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

    render(Sheet, {
      props: { store: scopedStore }
    });

    // Sheet should be visible
    const dialog = page.getByRole('dialog');
    await expect.element(dialog).toBeInTheDocument();

    // Press Escape
    await userEvent.keyboard('{Escape}');

    // Give time for event to process
    await new Promise(resolve => setTimeout(resolve, 50));

    // Verify dismiss was called
    expect(dismissCalled).toBe(true);
  });

  it('dismisses sheet when clicking backdrop', async () => {
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

    render(Sheet, {
      props: { store: scopedStore }
    });

    // Sheet should be visible
    const dialog = page.getByRole('dialog');
    await expect.element(dialog).toBeInTheDocument();

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

    render(Sheet, {
      props: { store: scopedStore, disableEscapeKey: true }
    });

    // Press Escape
    await userEvent.keyboard('{Escape}');

    // Sheet should still be visible (Escape disabled)
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

    render(Sheet, {
      props: { store: scopedStore, disableClickOutside: true }
    });

    // Trigger pointerdown event on document
    const pointerEvent = new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      button: 0
    });
    document.dispatchEvent(pointerEvent);

    // Give time for event to process
    await new Promise(resolve => setTimeout(resolve, 50));

    // Sheet should still be visible (click-outside disabled)
    const dialog = page.getByRole('dialog');
    await expect.element(dialog).toBeInTheDocument();
    expect(dismissCalled).toBe(false);
  });

  it('applies custom height', async () => {
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

    render(Sheet, {
      props: { store: scopedStore, height: '80vh' }
    });

    const dialog = page.getByRole('dialog');
    const style = dialog.element().getAttribute('style');
    expect(style).toContain('height: 80vh');
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

    render(Sheet, {
      props: {
        store: scopedStore,
        class: 'custom-sheet-content',
        backdropClass: 'custom-backdrop'
      }
    });

    const dialog = page.getByRole('dialog');
    await expect.element(dialog).toHaveClass(/custom-sheet-content/);
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

    render(Sheet, {
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

    render(Sheet, {
      props: { store: scopedStore }
    });

    // Check body overflow style directly
    const bodyStyle = document.body.style.overflow;
    expect(bodyStyle).toBe('hidden');
  });
});
