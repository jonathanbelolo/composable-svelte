import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import { describe, it, expect } from 'vitest';
import Drawer from '../../src/lib/navigation-components/Drawer.svelte';
import { createStore } from '../../src/lib/store.js';
import { scopeToDestination } from '../../src/lib/navigation/scope-to-destination.js';
import { Effect } from '../../src/lib/effect.js';

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
// Drawer Component Tests
// ============================================================================

describe('Drawer Component', () => {
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

    render(Drawer, {
      props: { store: scopedStore }
    });

    const drawer = page.getByRole('dialog');
    await expect.element(drawer).toBeInTheDocument();
  });

  it('hides when store is null', async () => {
    render(Drawer, {
      props: { store: null }
    });

    // Check that no dialog exists
    const drawers = page.getByRole('dialog').elements();
    expect(drawers.length).toBe(0);
  });

  it('dismisses drawer when Escape pressed', async () => {
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

    render(Drawer, {
      props: { store: scopedStore }
    });

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

    render(Drawer, {
      props: { store: scopedStore }
    });

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

    render(Drawer, {
      props: { store: scopedStore, disableEscapeKey: true }
    });

    // Press Escape
    await userEvent.keyboard('{Escape}');

    // Drawer should still be visible (Escape disabled)
    const drawer = page.getByRole('dialog');
    await expect.element(drawer).toBeInTheDocument();
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

    render(Drawer, {
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

    // Drawer should still be visible (click-outside disabled)
    const drawer = page.getByRole('dialog');
    await expect.element(drawer).toBeInTheDocument();
    expect(dismissCalled).toBe(false);
  });

  it('applies custom width', async () => {
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

    render(Drawer, {
      props: { store: scopedStore, width: '400px' }
    });

    const drawer = page.getByRole('dialog');
    const style = drawer.element().getAttribute('style');
    expect(style).toContain('width: 400px');
  });

  it('applies left positioning by default', async () => {
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

    render(Drawer, {
      props: { store: scopedStore }
    });

    const drawer = page.getByRole('dialog');
    await expect.element(drawer).toHaveClass(/left-0/);
    await expect.element(drawer).toHaveClass(/border-r/);
  });

  it('applies right positioning when side="right"', async () => {
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

    render(Drawer, {
      props: { store: scopedStore, side: 'right' }
    });

    const drawer = page.getByRole('dialog');
    await expect.element(drawer).toHaveClass(/right-0/);
    await expect.element(drawer).toHaveClass(/border-l/);
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

    render(Drawer, {
      props: {
        store: scopedStore,
        class: 'custom-drawer-content',
        backdropClass: 'custom-backdrop'
      }
    });

    const drawer = page.getByRole('dialog');
    await expect.element(drawer).toHaveClass(/custom-drawer-content/);
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

    render(Drawer, {
      props: { store: scopedStore, unstyled: true }
    });

    const drawer = page.getByRole('dialog');
    const className = drawer.element().className;
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

    render(Drawer, {
      props: { store: scopedStore }
    });

    // Check body overflow style directly
    const bodyStyle = document.body.style.overflow;
    expect(bodyStyle).toBe('hidden');
  });
});
