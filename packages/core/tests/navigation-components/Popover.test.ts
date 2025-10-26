import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import { describe, it, expect } from 'vitest';
import Popover from '../../src/navigation-components/Popover.svelte';
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
// Popover Component Tests
// ============================================================================

describe('Popover Component', () => {
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

    render(Popover, {
      props: { store: scopedStore }
    });

    const popover = page.getByRole('dialog');
    await expect.element(popover).toBeInTheDocument();
  });

  it('hides when store is null', async () => {
    render(Popover, {
      props: { store: null }
    });

    // Check that no dialog exists
    const popovers = page.getByRole('dialog').elements();
    expect(popovers.length).toBe(0);
  });

  it('dismisses popover when Escape pressed', async () => {
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

    render(Popover, {
      props: { store: scopedStore }
    });

    // Popover should be visible
    const popover = page.getByRole('dialog');
    await expect.element(popover).toBeInTheDocument();

    // Press Escape
    await userEvent.keyboard('{Escape}');

    // Give time for event to process
    await new Promise(resolve => setTimeout(resolve, 50));

    // Verify dismiss was called
    expect(dismissCalled).toBe(true);
  });

  it('dismisses popover when clicking outside', async () => {
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

    render(Popover, {
      props: { store: scopedStore }
    });

    // Popover should be visible
    const popover = page.getByRole('dialog');
    await expect.element(popover).toBeInTheDocument();

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

    render(Popover, {
      props: { store: scopedStore, disableEscapeKey: true }
    });

    // Press Escape
    await userEvent.keyboard('{Escape}');

    // Popover should still be visible (Escape disabled)
    const popover = page.getByRole('dialog');
    await expect.element(popover).toBeInTheDocument();
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

    render(Popover, {
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

    // Popover should still be visible (click-outside disabled)
    const popover = page.getByRole('dialog');
    await expect.element(popover).toBeInTheDocument();
    expect(dismissCalled).toBe(false);
  });

  it('applies custom positioning style', async () => {
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

    render(Popover, {
      props: { store: scopedStore, style: 'top: 100px; left: 200px;' }
    });

    const popover = page.getByRole('dialog');
    const style = popover.element().getAttribute('style');
    expect(style).toContain('top: 100px');
    expect(style).toContain('left: 200px');
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

    render(Popover, {
      props: {
        store: scopedStore,
        class: 'custom-popover-content'
      }
    });

    const popover = page.getByRole('dialog');
    await expect.element(popover).toHaveClass(/custom-popover-content/);
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

    render(Popover, {
      props: { store: scopedStore, unstyled: true }
    });

    const popover = page.getByRole('dialog');
    const className = popover.element().className;
    expect(className).toBe('');
  });

  it('does not prevent body scroll (unlike Modal/Sheet)', async () => {
    // Store initial body overflow value
    const initialOverflow = document.body.style.overflow;

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

    render(Popover, {
      props: { store: scopedStore }
    });

    // Check body overflow is NOT set to hidden (popovers don't lock scroll)
    const bodyStyle = document.body.style.overflow;
    expect(bodyStyle).toBe(initialOverflow);
  });

  it('uses aria-modal="false" (not a modal dialog)', async () => {
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

    render(Popover, {
      props: { store: scopedStore }
    });

    const popover = page.getByRole('dialog');
    const ariaModal = popover.element().getAttribute('aria-modal');
    expect(ariaModal).toBe('false');
  });
});
