import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import { describe, it, expect } from 'vitest';
import Tabs from '../../src/navigation-components/Tabs.svelte';
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
// Tabs Component Tests
// ============================================================================

describe('Tabs Component', () => {
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

    let activeTab = 0;
    const tabs = ['Tab 1', 'Tab 2', 'Tab 3'];

    render(Tabs, {
      props: {
        store: scopedStore,
        tabs,
        activeTab,
        onTabChange: (index: number) => {
          activeTab = index;
        }
      }
    });

    const tablist = page.getByRole('tablist');
    await expect.element(tablist).toBeInTheDocument();
  });

  it('hides when store is null', async () => {
    const tabs = ['Tab 1', 'Tab 2', 'Tab 3'];

    render(Tabs, {
      props: {
        store: null,
        tabs,
        activeTab: 0,
        onTabChange: () => {}
      }
    });

    // Check that no tablist exists
    const tablists = page.getByRole('tablist').elements();
    expect(tablists.length).toBe(0);
  });

  it('renders all tab buttons', async () => {
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

    const tabs = ['Tab 1', 'Tab 2', 'Tab 3'];

    render(Tabs, {
      props: {
        store: scopedStore,
        tabs,
        activeTab: 0,
        onTabChange: () => {}
      }
    });

    const tabButtons = page.getByRole('tab').elements();
    expect(tabButtons.length).toBe(3);
  });

  it('marks active tab with aria-selected="true"', async () => {
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

    const tabs = ['Tab 1', 'Tab 2', 'Tab 3'];

    render(Tabs, {
      props: {
        store: scopedStore,
        tabs,
        activeTab: 1,
        onTabChange: () => {}
      }
    });

    const tabButtons = page.getByRole('tab').elements();
    expect(tabButtons[0].getAttribute('aria-selected')).toBe('false');
    expect(tabButtons[1].getAttribute('aria-selected')).toBe('true');
    expect(tabButtons[2].getAttribute('aria-selected')).toBe('false');
  });

  it('calls onTabChange when tab is clicked', async () => {
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

    const tabs = ['Tab 1', 'Tab 2', 'Tab 3'];
    let clickedIndex = -1;

    render(Tabs, {
      props: {
        store: scopedStore,
        tabs,
        activeTab: 0,
        onTabChange: (index: number) => {
          clickedIndex = index;
        }
      }
    });

    const tabButtons = page.getByRole('tab').elements();
    await userEvent.click(tabButtons[2]);

    expect(clickedIndex).toBe(2);
  });

  it('renders tabpanel with correct aria attributes', async () => {
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

    const tabs = ['Tab 1', 'Tab 2', 'Tab 3'];

    render(Tabs, {
      props: {
        store: scopedStore,
        tabs,
        activeTab: 1,
        onTabChange: () => {}
      }
    });

    const tabpanel = page.getByRole('tabpanel');
    await expect.element(tabpanel).toBeInTheDocument();
    expect(tabpanel.element().getAttribute('id')).toBe('tabpanel-1');
    expect(tabpanel.element().getAttribute('aria-labelledby')).toBe('tab-1');
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

    const tabs = ['Tab 1', 'Tab 2', 'Tab 3'];

    render(Tabs, {
      props: {
        store: scopedStore,
        tabs,
        activeTab: 0,
        onTabChange: () => {},
        class: 'custom-content'
      }
    });

    const tabpanel = page.getByRole('tabpanel');
    await expect.element(tabpanel).toHaveClass(/custom-content/);
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

    const tabs = ['Tab 1', 'Tab 2', 'Tab 3'];

    render(Tabs, {
      props: {
        store: scopedStore,
        tabs,
        activeTab: 0,
        onTabChange: () => {},
        unstyled: true
      }
    });

    const tablist = page.getByRole('tablist');
    const className = tablist.element().className;
    expect(className).toBe('');
  });

  it('does not prevent body scroll (inline component)', async () => {
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

    const tabs = ['Tab 1', 'Tab 2', 'Tab 3'];

    render(Tabs, {
      props: {
        store: scopedStore,
        tabs,
        activeTab: 0,
        onTabChange: () => {}
      }
    });

    // Check body overflow is NOT set to hidden (tabs don't lock scroll)
    const bodyStyle = document.body.style.overflow;
    expect(bodyStyle).toBe(initialOverflow);
  });
});
