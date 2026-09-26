import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import { describe, it, expect, afterEach } from 'vitest';
import { tick } from 'svelte';
import NavigationStack from '../../src/lib/navigation-components/NavigationStack.svelte';
import { createManagedChildView } from '../helpers/managed-child-view.js';
import { assertPresentationView } from '../../src/lib/navigation/managed-integration.js';

// ============================================================================
// Test Fixtures
// ============================================================================

interface ScreenState {
  id: string;
  title: string;
}

const handles: Array<{ destroy(): void }> = [];

afterEach(() => {
  for (const handle of handles) {
    handle.destroy();
  }
  handles.length = 0;
});

function makeTestStore(stack: ScreenState[]) {
  const handle = createManagedChildView({ stack });
  handles.push(handle);
  return handle.view;
}

// ============================================================================
// NavigationStack Component Tests
// ============================================================================

describe('NavigationStack Component', () => {
  it('renders a live null business state rather than treating it as retirement', async () => {
    const managed = createManagedChildView<null>(null);
    handles.push(managed);
    expect(managed.view.state).toBeNull();
    render(NavigationStack, {
      store: managed.view,
      stack: [{ id: '1', title: 'Screen 1' }],
      onBack: () => {}
    });
    await expect.element(page.getByRole('navigation')).toBeInTheDocument();
  });

  it('shows when store is non-null and stack is not empty', async () => {
    const scopedStore = makeTestStore([{ id: '1', title: 'Screen 1' }]);

    render(NavigationStack, {
        store: scopedStore,
        stack: [{ id: '1', title: 'Screen 1' }],
        onBack: () => {}
      });

    const nav = page.getByRole('navigation');
    await expect.element(nav).toBeInTheDocument();
  });

  it('hides when store is undefined', async () => {
    render(NavigationStack, {
        store: undefined,
        stack: [],
        onBack: () => {}
      });

    // Check that no navigation exists
    const navs = page.getByRole('navigation').elements();
    expect(navs.length).toBe(0);
  });

  it('hides when stack is empty', async () => {
    const scopedStore = makeTestStore([]);
    render(NavigationStack, {
        store: scopedStore,
        stack: [],
        onBack: () => {}
      });

    // Check that no navigation exists
    const navs = page.getByRole('navigation').elements();
    expect(navs.length).toBe(0);
  });

  it('shows back button when stack has multiple screens', async () => {
    const scopedStore = makeTestStore([
      { id: '1', title: 'Screen 1' },
      { id: '2', title: 'Screen 2' }
    ]);
    render(NavigationStack, {
        store: scopedStore,
        stack: [
          { id: '1', title: 'Screen 1' },
          { id: '2', title: 'Screen 2' }
        ],
        onBack: () => {}
      });

    const backButton = page.getByRole('button', { name: 'Go back' });
    await expect.element(backButton).toBeInTheDocument();
  });

  it('hides back button when stack has only one screen', async () => {
    const scopedStore = makeTestStore([{ id: '1', title: 'Screen 1' }]);
    render(NavigationStack, {
        store: scopedStore,
        stack: [{ id: '1', title: 'Screen 1' }],
        onBack: () => {}
      });

    const backButtons = page.getByRole('button', { name: 'Go back' }).elements();
    expect(backButtons.length).toBe(0);
  });

  it('calls onBack when back button is clicked', async () => {
    let backCalled = false;
    const scopedStore = makeTestStore([
      { id: '1', title: 'Screen 1' },
      { id: '2', title: 'Screen 2' }
    ]);
    render(NavigationStack, {
        store: scopedStore,
        stack: [
          { id: '1', title: 'Screen 1' },
          { id: '2', title: 'Screen 2' }
        ],
        onBack: () => {
          backCalled = true;
        }
      });

    const backButton = page.getByRole('button', { name: 'Go back' });
    await userEvent.click(backButton);

    expect(backCalled).toBe(true);
  });

  it('respects showBackButton=false prop', async () => {
    const scopedStore = makeTestStore([
      { id: '1', title: 'Screen 1' },
      { id: '2', title: 'Screen 2' }
    ]);
    render(NavigationStack, {
        store: scopedStore,
        stack: [
          { id: '1', title: 'Screen 1' },
          { id: '2', title: 'Screen 2' }
        ],
        onBack: () => {},
        showBackButton: false
      });

    const backButtons = page.getByRole('button', { name: 'Go back' }).elements();
    expect(backButtons.length).toBe(0);
  });

  it('applies custom classes', async () => {
    const scopedStore = makeTestStore([{ id: '1', title: 'Screen 1' }]);
    render(NavigationStack, {
        store: scopedStore,
        stack: [{ id: '1', title: 'Screen 1' }],
        onBack: () => {},
        class: 'custom-stack'
      });

    const nav = page.getByRole('navigation');
    await expect.element(nav).toHaveClass(/custom-stack/);
  });

  it('respects unstyled prop', async () => {
    const scopedStore = makeTestStore([{ id: '1', title: 'Screen 1' }]);
    render(NavigationStack, {
        store: scopedStore,
        stack: [{ id: '1', title: 'Screen 1' }],
        onBack: () => {},
        unstyled: true
      });

    const nav = page.getByRole('navigation');
    const className = nav.element().className;
    expect(className).toBe('');
  });

  it('does not prevent body scroll (inline component)', async () => {
    // Store initial body overflow value
    const initialOverflow = document.body.style.overflow;
    const scopedStore = makeTestStore([{ id: '1', title: 'Screen 1' }]);
    render(NavigationStack, {
        store: scopedStore,
        stack: [{ id: '1', title: 'Screen 1' }],
        onBack: () => {}
      });

    // Check body overflow is NOT set to hidden (stack doesn't lock scroll)
    const bodyStyle = document.body.style.overflow;
    expect(bodyStyle).toBe(initialOverflow);
  });

  it('hides when managed view is retired after keyed removal and lacks dismiss authority', async () => {
    const stack = [{ id: '1', title: 'Screen 1' }];
    const managed = createManagedChildView({ stack });
    handles.push(managed);

    expect('dismiss' in managed.view).toBe(false);
    expect(() => assertPresentationView(managed.view)).toThrow('Expected a managed presentation view');

    render(NavigationStack, { store: managed.view, stack, onBack: () => {} });
    await expect.element(page.getByRole('navigation')).toBeInTheDocument();
    managed.remove();
    await tick();
    expect(page.getByRole('navigation').elements().length).toBe(0);
  });
});
