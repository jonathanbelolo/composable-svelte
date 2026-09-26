import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { tick } from 'svelte';
import TabsInstances from '../test-components/TabsInstances.svelte';
import Tabs from '../../src/lib/navigation-components/Tabs.svelte';
import { createManagedChildView } from '../helpers/managed-child-view.js';
import { assertPresentationView } from '../../src/lib/navigation/managed-integration.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const handles: Array<{ destroy(): void }> = [];

afterEach(() => {
  for (const handle of handles) {
    handle.destroy();
  }
  handles.length = 0;
});

function makeTestStore(value = 'test') {
  const handle = createManagedChildView({ value });
  handles.push(handle);
  return handle.view;
}

// ============================================================================
// Tabs Component Tests
// ============================================================================

describe('Tabs Component', () => {
  it('shows when store is non-null', async () => {
    const scopedStore = makeTestStore();

    let activeTab = 0;
    const tabs = ['Tab 1', 'Tab 2', 'Tab 3'];

    render(Tabs, {
        store: scopedStore,
        tabs,
        activeTab,
        onTabChange: (index: number) => {
          activeTab = index;
        }
      });

    const tablist = page.getByRole('tablist');
    await expect.element(tablist).toBeInTheDocument();
  });

  it('hides when store is undefined', async () => {
    const tabs = ['Tab 1', 'Tab 2', 'Tab 3'];

    render(Tabs, {
        store: undefined,
        tabs,
        activeTab: 0,
        onTabChange: () => {}
      });

    // Check that no tablist exists
    const tablists = page.getByRole('tablist').elements();
    expect(tablists.length).toBe(0);
  });

  it('renders all tab buttons', async () => {
    const scopedStore = makeTestStore();
    const tabs = ['Tab 1', 'Tab 2', 'Tab 3'];

    render(Tabs, {
        store: scopedStore,
        tabs,
        activeTab: 0,
        onTabChange: () => {}
      });

    const tabButtons = page.getByRole('tab').elements();
    expect(tabButtons.length).toBe(3);
  });

  it('marks active tab with aria-selected="true"', async () => {
    const scopedStore = makeTestStore();
    const tabs = ['Tab 1', 'Tab 2', 'Tab 3'];

    render(Tabs, {
        store: scopedStore,
        tabs,
        activeTab: 1,
        onTabChange: () => {}
      });

    const tabButtons = page.getByRole('tab').elements();
    expect(tabButtons[0]!.getAttribute('aria-selected')).toBe('false');
    expect(tabButtons[1]!.getAttribute('aria-selected')).toBe('true');
    expect(tabButtons[2]!.getAttribute('aria-selected')).toBe('false');
  });

  it('calls onTabChange when tab is clicked', async () => {
    const scopedStore = makeTestStore();
    const tabs = ['Tab 1', 'Tab 2', 'Tab 3'];
    let clickedIndex = -1;

    render(Tabs, {
        store: scopedStore,
        tabs,
        activeTab: 0,
        onTabChange: (index: number) => {
          clickedIndex = index;
        }
      });

    const tabButtons = page.getByRole('tab').elements();
    await userEvent.click(tabButtons[2]!);

    expect(clickedIndex).toBe(2);
  });

  it('renders tabpanel with correct aria attributes', async () => {
    const scopedStore = makeTestStore();
    const tabs = ['Tab 1', 'Tab 2', 'Tab 3'];

    render(Tabs, {
        store: scopedStore,
        tabs,
        activeTab: 1,
        onTabChange: () => {}
      });

    const tabpanel = page.getByRole('tabpanel');
    await expect.element(tabpanel).toBeInTheDocument();
    const active = page.getByRole('tab').elements()[1]!;
    expect(tabpanel.element().id).toBe(active.getAttribute('aria-controls'));
    expect(tabpanel.element().getAttribute('aria-labelledby')).toBe(active.id);
  });

  it('applies custom classes', async () => {
    const scopedStore = makeTestStore();
    const tabs = ['Tab 1', 'Tab 2', 'Tab 3'];

    render(Tabs, {
        store: scopedStore,
        tabs,
        activeTab: 0,
        onTabChange: () => {},
        class: 'custom-content'
      });

    const tabpanel = page.getByRole('tabpanel');
    await expect.element(tabpanel).toHaveClass(/custom-content/);
  });

  it('respects unstyled prop', async () => {
    const scopedStore = makeTestStore();
    const tabs = ['Tab 1', 'Tab 2', 'Tab 3'];

    render(Tabs, {
        store: scopedStore,
        tabs,
        activeTab: 0,
        onTabChange: () => {},
        unstyled: true
      });

    const tablist = page.getByRole('tablist');
    const className = tablist.element().className;
    expect(className).toBe('');
  });

  it('does not prevent body scroll (inline component)', async () => {
    // Store initial body overflow value
    const initialOverflow = document.body.style.overflow;
    const scopedStore = makeTestStore();
    const tabs = ['Tab 1', 'Tab 2', 'Tab 3'];

    render(Tabs, {
        store: scopedStore,
        tabs,
        activeTab: 0,
        onTabChange: () => {}
      });

    // Check body overflow is NOT set to hidden (tabs don't lock scroll)
    const bodyStyle = document.body.style.overflow;
    expect(bodyStyle).toBe(initialOverflow);
  });

  it('hides when managed view is retired after keyed removal and lacks dismiss authority', async () => {
    const managed = createManagedChildView({ value: 'test' });
    handles.push(managed);
    const tabs = ['Tab 1', 'Tab 2', 'Tab 3'];

    expect('dismiss' in managed.view).toBe(false);
    expect(() => assertPresentationView(managed.view)).toThrow('Expected a managed presentation view');

    render(Tabs, { store: managed.view, tabs, activeTab: 0, onTabChange: () => {} });
    await expect.element(page.getByRole('tablist')).toBeInTheDocument();
    managed.remove();
    await tick();
    expect(page.getByRole('tablist').elements().length).toBe(0);
  });
});


describe('Tabs instance identity',()=>{
  it('keeps IDs and panel associations unique across identical tab indexes',()=>{
    const {container}=render(TabsInstances);
    const nodes=[...container.querySelectorAll<HTMLElement>('[id]')];
    expect(nodes).toHaveLength(8);
    expect(new Set(nodes.map(node=>node.id)).size).toBe(8);
    for(const region of container.querySelectorAll('[data-instance]')){
      const active=region.querySelector('[role="tab"][aria-selected="true"]')!;
      const panel=region.querySelector('[role="tabpanel"]')!;
      expect(active.getAttribute('aria-controls')).toBe(panel.id);
      expect(panel.getAttribute('aria-labelledby')).toBe(active.id);
    }
  });
  it('keeps native keyboard focus within the second tab set',async()=>{
    const {container}=render(TabsInstances);
    const first=[...container.querySelectorAll<HTMLElement>('[data-instance="first"] [role="tab"]')];
    const second=[...container.querySelectorAll<HTMLElement>('[data-instance="second"] [role="tab"]')];
    second[0]!.focus();
    for(const [key,index] of [['{ArrowRight}',1],['{End}',2],['{Home}',0],['{ArrowLeft}',2]] as const){
      await userEvent.keyboard(key);
      await expect.poll(()=>document.activeElement).toBe(second[index]);
      expect(second[index]!.getAttribute('aria-selected')).toBe('true');
      expect(first[0]!.getAttribute('aria-selected')).toBe('true');
    }
  });
  it('drops queued focus after synchronous callback unmount',async()=>{
    const managed=createManagedChildView({value:'x'});
    const store=managed.view;
    let dispose=()=>{};
    const changed=vi.fn(()=>dispose());
    const screen=render(Tabs,{store,tabs:['A','B'],activeTab:0,onTabChange:changed});
    dispose=()=>screen.unmount();
    const [first,second]=screen.container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    const focus=vi.spyOn(second!,'focus');
    try{
      first!.focus();
      first!.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
      await tick();
      expect(changed).toHaveBeenCalledExactlyOnceWith(1);
      expect(screen.container.querySelector('[role="tab"]')).toBeNull();
      expect(focus).not.toHaveBeenCalled();
    }finally{focus.mockRestore();managed.destroy();}
  });
});
