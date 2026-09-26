import { flushSync, mount, unmount, type Component } from 'svelte';
import { page, userEvent } from 'vitest/browser';
import { onTestFinished, describe, it, expect } from 'vitest';
import Sheet from '../../src/lib/navigation-components/Sheet.svelte';
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
// Sheet Component Tests
// ============================================================================

describe('Sheet Component', () => {
  it('shows when store is non-null', async () => {
    const parentStore = createManagedStore({
      initialState: {
        destination: { type: 'test', state: { value: 'test' } }
      },
      reducer: (state) => [state, Effect.none()]
    });
    onTestFinished(() => parentStore.destroy());

    const scopedStore = bindPresentation(parentStore);

    renderManaged(Sheet, { store: scopedStore });

    const dialog = page.getByRole('dialog');
    await expect.element(dialog).toBeInTheDocument();
  });

  it('hides when store is undefined', async () => {
    renderManaged(Sheet, { store: undefined });

    // Check that no dialog exists
    const dialogs = page.getByRole('dialog').elements();
    expect(dialogs.length).toBe(0);
  });

  it('dismisses sheet when Escape pressed', async () => {
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

    renderManaged(Sheet, { store: scopedStore });

    // Sheet should be visible
    const dialog = page.getByRole('dialog');
    await expect.element(dialog).toBeInTheDocument();

    // Press Escape
    await userEvent.keyboard('{Escape}');

    await expect.poll(() => dismissCalled).toBe(true);
  });

  it('dismisses sheet when clicking backdrop', async () => {
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

    // This unit runner does not load the Tailwind utility stylesheet. Supply only
    // fixture geometry; keep the actual framework backdrop and native hit-testing.
    const style = document.createElement('style');
    style.textContent = '.b015-backdrop { position: fixed; inset: 0; }';
    document.head.append(style);
    onTestFinished(() => style.remove());
    renderManaged(Sheet, { store: scopedStore, backdropClass: 'b015-backdrop' });

    // Sheet should be visible
    const dialog = page.getByRole('dialog');
    await expect.element(dialog).toBeInTheDocument();

    const backdrop = dialog.element().previousElementSibling;
    expect(backdrop).toBeInstanceOf(HTMLElement);
    // Native hit-testing proves the rendered backdrop is a usable dismissal target.
    await userEvent.click(backdrop as HTMLElement, { position: { x: 8, y: 120 } });
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

    renderManaged(Sheet, { store: scopedStore, disableEscapeKey: true });

    // Press Escape
    await userEvent.keyboard('{Escape}');

    // Sheet should still be visible (Escape disabled)
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
    onTestFinished(() => parentStore.destroy());

    const scopedStore = bindPresentation(parentStore);

    const style = document.createElement('style');
    style.textContent = '.b015-disabled-backdrop { position: fixed; inset: 0; }';
    document.head.append(style);
    onTestFinished(() => style.remove());
    renderManaged(Sheet, { store: scopedStore, disableClickOutside: true, backdropClass: 'b015-disabled-backdrop' });

    const dialog = page.getByRole('dialog');
    await expect.element(dialog).toBeInTheDocument();
    const backdrop = dialog.element().previousElementSibling;
    expect(backdrop).toBeInstanceOf(HTMLElement);
    await userEvent.click(backdrop as HTMLElement, { position: { x: 8, y: 120 } });
    expect(dismissCalled).toBe(false);
    await expect.element(dialog).toBeInTheDocument();
  });

  it('applies custom height', async () => {
    const parentStore = createManagedStore({
      initialState: {
        destination: { type: 'test', state: { value: 'test' } }
      },
      reducer: (state) => [state, Effect.none()]
    });
    onTestFinished(() => parentStore.destroy());

    const scopedStore = bindPresentation(parentStore);

    renderManaged(Sheet, { store: scopedStore, height: '80vh' });

    const dialog = page.getByRole('dialog');
    const style = dialog.element().getAttribute('style');
    expect(style).toContain('height: 80vh');
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

    const screen = renderManaged(Sheet, {
      store: scopedStore,
      class: 'custom-sheet-content',
      backdropClass: 'custom-backdrop'
    });

    const dialog = page.getByRole('dialog');
    await expect.element(dialog).toHaveClass(/custom-sheet-content/);

    const backdrop = dialog.element().previousElementSibling;
    expect(backdrop?.getAttribute('aria-hidden')).toBe('true');
    expect(backdrop).not.toBeNull();
    expect(backdrop?.classList.contains('custom-backdrop')).toBe(true);

    await screen.unmount();
    parentStore.destroy();
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

    renderManaged(Sheet, { store: scopedStore, unstyled: true });

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
    onTestFinished(() => parentStore.destroy());

    const scopedStore = bindPresentation(parentStore);

    // Reset first: body.style is shared across every test in the worker, and
    // a lock leaked by an earlier test made the old form pass on its own.
    resetBodyScroll();
    expect(document.body.style.overflow).toBe('');

    const screen = renderManaged(Sheet, { store: scopedStore });
    try {
      expect(document.body.style.overflow).toBe('hidden');
    } finally {
      screen.unmount();
    }
    expect(document.body.style.overflow).toBe('');
  });
});
