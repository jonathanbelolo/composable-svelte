import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import { describe, it, expect } from 'vitest';
import Sidebar from '../../src/lib/navigation-components/Sidebar.svelte';
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
// Sidebar Component Tests
// ============================================================================

describe('Sidebar Component', () => {
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

    render(Sidebar, {
      props: { store: scopedStore }
    });

    const sidebar = page.getByRole('navigation');
    await expect.element(sidebar).toBeInTheDocument();
  });

  it('hides when store is null', async () => {
    render(Sidebar, {
      props: { store: null }
    });

    // Check that no complementary element exists
    const sidebars = page.getByRole('navigation').elements();
    expect(sidebars.length).toBe(0);
  });

  it('dismisses sidebar when Escape pressed', async () => {
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

    render(Sidebar, {
      props: { store: scopedStore }
    });

    // Sidebar should be visible
    const sidebar = page.getByRole('navigation');
    await expect.element(sidebar).toBeInTheDocument();

    // Press Escape
    await userEvent.keyboard('{Escape}');

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

    render(Sidebar, {
      props: { store: scopedStore, disableEscapeKey: true }
    });

    // Press Escape
    await userEvent.keyboard('{Escape}');

    // Sidebar should still be visible (Escape disabled)
    const sidebar = page.getByRole('navigation');
    await expect.element(sidebar).toBeInTheDocument();
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

    render(Sidebar, {
      props: { store: scopedStore, width: '300px' }
    });

    const sidebar = page.getByRole('navigation');
    const style = sidebar.element().getAttribute('style');
    expect(style).toContain('width: 300px');
  });

  it('applies left border by default', async () => {
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

    render(Sidebar, {
      props: { store: scopedStore }
    });

    const sidebar = page.getByRole('navigation');
    await expect.element(sidebar).toHaveClass(/border-r/);
  });

  it('applies right border when side="right"', async () => {
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

    render(Sidebar, {
      props: { store: scopedStore, side: 'right' }
    });

    const sidebar = page.getByRole('navigation');
    await expect.element(sidebar).toHaveClass(/border-l/);
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

    render(Sidebar, {
      props: {
        store: scopedStore,
        class: 'custom-sidebar-content'
      }
    });

    const sidebar = page.getByRole('navigation');
    await expect.element(sidebar).toHaveClass(/custom-sidebar-content/);
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

    render(Sidebar, {
      props: { store: scopedStore, unstyled: true }
    });

    const sidebar = page.getByRole('navigation');
    const className = sidebar.element().className;
    expect(className).toBe('');
  });

  it('does not prevent body scroll (persistent sidebar)', async () => {
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

    render(Sidebar, {
      props: { store: scopedStore }
    });

    // Check body overflow is NOT set to hidden (sidebars don't lock scroll)
    const bodyStyle = document.body.style.overflow;
    expect(bodyStyle).toBe(initialOverflow);
  });
});
