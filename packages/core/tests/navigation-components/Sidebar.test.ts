import { flushSync, mount, unmount, type Component } from 'svelte';
import { page, userEvent } from 'vitest/browser';
import { onTestFinished, describe, it, expect } from 'vitest';
import Sidebar from '../../src/lib/navigation-components/Sidebar.svelte';
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
// Sidebar Component Tests
// ============================================================================

describe('Sidebar Component', () => {
  it('shows when store is non-null', async () => {
    const parentStore = createManagedStore({
      initialState: {
        destination: { type: 'test', state: { value: 'test' } }
      },
      reducer: (state) => [state, Effect.none()]
    });
    onTestFinished(() => parentStore.destroy());

    const scopedStore = bindPresentation(parentStore);

    renderManaged(Sidebar, { store: scopedStore });

    const sidebar = page.getByRole('navigation');
    await expect.element(sidebar).toBeInTheDocument();
  });

  it('hides when store is undefined', async () => {
    renderManaged(Sidebar, { store: undefined });

    // Check that no complementary element exists
    const sidebars = page.getByRole('navigation').elements();
    expect(sidebars.length).toBe(0);
  });

  it('dismisses sidebar when Escape pressed', async () => {
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
    onTestFinished(() => parentStore.destroy());

    const scopedStore = bindPresentation(parentStore);

    renderManaged(Sidebar, { store: scopedStore });

    // Sidebar should be visible
    const sidebar = page.getByRole('navigation');
    await expect.element(sidebar).toBeInTheDocument();

    // Press Escape
    await userEvent.keyboard('{Escape}');

    await expect.poll(() => dismissCalled).toBe(true);
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
    onTestFinished(() => parentStore.destroy());

    const scopedStore = bindPresentation(parentStore);

    renderManaged(Sidebar, { store: scopedStore, disableEscapeKey: true });

    // Press Escape
    await userEvent.keyboard('{Escape}');

    // Sidebar should still be visible (Escape disabled)
    const sidebar = page.getByRole('navigation');
    await expect.element(sidebar).toBeInTheDocument();
  });

  it('applies custom width', async () => {
    const parentStore = createManagedStore({
      initialState: {
        destination: { type: 'test', state: { value: 'test' } }
      },
      reducer: (state) => [state, Effect.none()]
    });
    onTestFinished(() => parentStore.destroy());

    const scopedStore = bindPresentation(parentStore);

    renderManaged(Sidebar, { store: scopedStore, width: '300px' });

    const sidebar = page.getByRole('navigation');
    const style = sidebar.element().getAttribute('style');
    expect(style).toContain('width: 300px');
  });

  it('applies left border by default', async () => {
    const parentStore = createManagedStore({
      initialState: {
        destination: { type: 'test', state: { value: 'test' } }
      },
      reducer: (state) => [state, Effect.none()]
    });
    onTestFinished(() => parentStore.destroy());

    const scopedStore = bindPresentation(parentStore);

    renderManaged(Sidebar, { store: scopedStore });

    const sidebar = page.getByRole('navigation');
    await expect.element(sidebar).toHaveClass(/border-r/);
  });

  it('applies right border when side="right"', async () => {
    const parentStore = createManagedStore({
      initialState: {
        destination: { type: 'test', state: { value: 'test' } }
      },
      reducer: (state) => [state, Effect.none()]
    });
    onTestFinished(() => parentStore.destroy());

    const scopedStore = bindPresentation(parentStore);

    renderManaged(Sidebar, { store: scopedStore, side: 'right' });

    const sidebar = page.getByRole('navigation');
    await expect.element(sidebar).toHaveClass(/border-l/);
  });

  it('applies custom classes', async () => {
    const parentStore = createManagedStore({
      initialState: {
        destination: { type: 'test', state: { value: 'test' } }
      },
      reducer: (state) => [state, Effect.none()]
    });
    onTestFinished(() => parentStore.destroy());

    const scopedStore = bindPresentation(parentStore);

    renderManaged(Sidebar, {
        store: scopedStore,
        class: 'custom-sidebar-content'
      });

    const sidebar = page.getByRole('navigation');
    await expect.element(sidebar).toHaveClass(/custom-sidebar-content/);
  });

  it('respects unstyled prop', async () => {
    const parentStore = createManagedStore({
      initialState: {
        destination: { type: 'test', state: { value: 'test' } }
      },
      reducer: (state) => [state, Effect.none()]
    });
    onTestFinished(() => parentStore.destroy());

    const scopedStore = bindPresentation(parentStore);

    renderManaged(Sidebar, { store: scopedStore, unstyled: true });

    const sidebar = page.getByRole('navigation');
    const className = sidebar.element().className;
    expect(className).toBe('');
  });

  it('does not prevent body scroll (persistent sidebar)', async () => {
    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;
    resetBodyScroll();
    expect(document.body.style.overflow).toBe('');

    const parentStore = createManagedStore({
      initialState: {
        destination: { type: 'test', state: { value: 'test' } }
      },
      reducer: (state) => [state, Effect.none()]
    });
    onTestFinished(() => parentStore.destroy());

    try {
      // Closed state: sidebar is hidden and body scroll remains unlocked
      const closedScreen = renderManaged(Sidebar, { store: undefined });
      try {
        expect(document.body.style.overflow).toBe('');
      } finally {
        await closedScreen.unmount();
      }

      // Open state: sidebar is shown and body scroll remains unlocked (persistent sidebar)
      const scopedStore = bindPresentation(parentStore);

      const screen = renderManaged(Sidebar, { store: scopedStore });
      try {
        expect(document.body.style.overflow).toBe('');
      } finally {
        await screen.unmount();
      }
      expect(document.body.style.overflow).toBe('');
    } finally {
      parentStore.destroy();
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
    }
  });
});
