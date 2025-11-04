import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import { describe, it, expect } from 'vitest';
import NavigationStack from '../../src/lib/navigation-components/NavigationStack.svelte';
import { createStore } from '../../src/lib/store.js';
import { scopeToDestination } from '../../src/lib/navigation/scope-to-destination.js';
import { Effect } from '../../src/lib/effect.js';

// ============================================================================
// Test Fixtures
// ============================================================================

interface ScreenState {
  id: string;
  title: string;
}

interface ParentState {
  destination: { type: 'test'; state: { stack: ScreenState[] } } | null;
}

type ParentAction =
  | { type: 'show' }
  | { type: 'destination'; action: any };

// ============================================================================
// NavigationStack Component Tests
// ============================================================================

describe('NavigationStack Component', () => {
  it('shows when store is non-null and stack is not empty', async () => {
    const parentStore = createStore<ParentState, ParentAction>({
      initialState: {
        destination: {
          type: 'test',
          state: {
            stack: [{ id: '1', title: 'Screen 1' }]
          }
        }
      },
      reducer: (state) => [state, Effect.none()]
    });

    const scopedStore = scopeToDestination(
      parentStore,
      ['destination'],
      'test',
      'destination'
    );

    render(NavigationStack, {
      props: {
        store: scopedStore,
        stack: [{ id: '1', title: 'Screen 1' }],
        onBack: () => {}
      }
    });

    const nav = page.getByRole('navigation');
    await expect.element(nav).toBeInTheDocument();
  });

  it('hides when store is null', async () => {
    render(NavigationStack, {
      props: {
        store: null,
        stack: [],
        onBack: () => {}
      }
    });

    // Check that no navigation exists
    const navs = page.getByRole('navigation').elements();
    expect(navs.length).toBe(0);
  });

  it('hides when stack is empty', async () => {
    const parentStore = createStore<ParentState, ParentAction>({
      initialState: {
        destination: {
          type: 'test',
          state: { stack: [] }
        }
      },
      reducer: (state) => [state, Effect.none()]
    });

    const scopedStore = scopeToDestination(
      parentStore,
      ['destination'],
      'test',
      'destination'
    );

    render(NavigationStack, {
      props: {
        store: scopedStore,
        stack: [],
        onBack: () => {}
      }
    });

    // Check that no navigation exists
    const navs = page.getByRole('navigation').elements();
    expect(navs.length).toBe(0);
  });

  it('shows back button when stack has multiple screens', async () => {
    const parentStore = createStore<ParentState, ParentAction>({
      initialState: {
        destination: {
          type: 'test',
          state: {
            stack: [
              { id: '1', title: 'Screen 1' },
              { id: '2', title: 'Screen 2' }
            ]
          }
        }
      },
      reducer: (state) => [state, Effect.none()]
    });

    const scopedStore = scopeToDestination(
      parentStore,
      ['destination'],
      'test',
      'destination'
    );

    render(NavigationStack, {
      props: {
        store: scopedStore,
        stack: [
          { id: '1', title: 'Screen 1' },
          { id: '2', title: 'Screen 2' }
        ],
        onBack: () => {}
      }
    });

    const backButton = page.getByRole('button', { name: 'Go back' });
    await expect.element(backButton).toBeInTheDocument();
  });

  it('hides back button when stack has only one screen', async () => {
    const parentStore = createStore<ParentState, ParentAction>({
      initialState: {
        destination: {
          type: 'test',
          state: {
            stack: [{ id: '1', title: 'Screen 1' }]
          }
        }
      },
      reducer: (state) => [state, Effect.none()]
    });

    const scopedStore = scopeToDestination(
      parentStore,
      ['destination'],
      'test',
      'destination'
    );

    render(NavigationStack, {
      props: {
        store: scopedStore,
        stack: [{ id: '1', title: 'Screen 1' }],
        onBack: () => {}
      }
    });

    const backButtons = page.getByRole('button', { name: 'Go back' }).elements();
    expect(backButtons.length).toBe(0);
  });

  it('calls onBack when back button is clicked', async () => {
    let backCalled = false;

    const parentStore = createStore<ParentState, ParentAction>({
      initialState: {
        destination: {
          type: 'test',
          state: {
            stack: [
              { id: '1', title: 'Screen 1' },
              { id: '2', title: 'Screen 2' }
            ]
          }
        }
      },
      reducer: (state) => [state, Effect.none()]
    });

    const scopedStore = scopeToDestination(
      parentStore,
      ['destination'],
      'test',
      'destination'
    );

    render(NavigationStack, {
      props: {
        store: scopedStore,
        stack: [
          { id: '1', title: 'Screen 1' },
          { id: '2', title: 'Screen 2' }
        ],
        onBack: () => {
          backCalled = true;
        }
      }
    });

    const backButton = page.getByRole('button', { name: 'Go back' });
    await userEvent.click(backButton);

    expect(backCalled).toBe(true);
  });

  it('respects showBackButton=false prop', async () => {
    const parentStore = createStore<ParentState, ParentAction>({
      initialState: {
        destination: {
          type: 'test',
          state: {
            stack: [
              { id: '1', title: 'Screen 1' },
              { id: '2', title: 'Screen 2' }
            ]
          }
        }
      },
      reducer: (state) => [state, Effect.none()]
    });

    const scopedStore = scopeToDestination(
      parentStore,
      ['destination'],
      'test',
      'destination'
    );

    render(NavigationStack, {
      props: {
        store: scopedStore,
        stack: [
          { id: '1', title: 'Screen 1' },
          { id: '2', title: 'Screen 2' }
        ],
        onBack: () => {},
        showBackButton: false
      }
    });

    const backButtons = page.getByRole('button', { name: 'Go back' }).elements();
    expect(backButtons.length).toBe(0);
  });

  it('applies custom classes', async () => {
    const parentStore = createStore<ParentState, ParentAction>({
      initialState: {
        destination: {
          type: 'test',
          state: {
            stack: [{ id: '1', title: 'Screen 1' }]
          }
        }
      },
      reducer: (state) => [state, Effect.none()]
    });

    const scopedStore = scopeToDestination(
      parentStore,
      ['destination'],
      'test',
      'destination'
    );

    render(NavigationStack, {
      props: {
        store: scopedStore,
        stack: [{ id: '1', title: 'Screen 1' }],
        onBack: () => {},
        class: 'custom-stack'
      }
    });

    const nav = page.getByRole('navigation');
    await expect.element(nav).toHaveClass(/custom-stack/);
  });

  it('respects unstyled prop', async () => {
    const parentStore = createStore<ParentState, ParentAction>({
      initialState: {
        destination: {
          type: 'test',
          state: {
            stack: [{ id: '1', title: 'Screen 1' }]
          }
        }
      },
      reducer: (state) => [state, Effect.none()]
    });

    const scopedStore = scopeToDestination(
      parentStore,
      ['destination'],
      'test',
      'destination'
    );

    render(NavigationStack, {
      props: {
        store: scopedStore,
        stack: [{ id: '1', title: 'Screen 1' }],
        onBack: () => {},
        unstyled: true
      }
    });

    const nav = page.getByRole('navigation');
    const className = nav.element().className;
    expect(className).toBe('');
  });

  it('does not prevent body scroll (inline component)', async () => {
    // Store initial body overflow value
    const initialOverflow = document.body.style.overflow;

    const parentStore = createStore<ParentState, ParentAction>({
      initialState: {
        destination: {
          type: 'test',
          state: {
            stack: [{ id: '1', title: 'Screen 1' }]
          }
        }
      },
      reducer: (state) => [state, Effect.none()]
    });

    const scopedStore = scopeToDestination(
      parentStore,
      ['destination'],
      'test',
      'destination'
    );

    render(NavigationStack, {
      props: {
        store: scopedStore,
        stack: [{ id: '1', title: 'Screen 1' }],
        onBack: () => {}
      }
    });

    // Check body overflow is NOT set to hidden (stack doesn't lock scroll)
    const bodyStyle = document.body.style.overflow;
    expect(bodyStyle).toBe(initialOverflow);
  });
});
