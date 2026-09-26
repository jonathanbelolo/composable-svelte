import CollapsibleHydration from './fixtures/CollapsibleHydration.svelte';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { flushSync, mount, unmount } from 'svelte';
import { comboboxReducer as reduce } from '../src/lib/components/ui/combobox/combobox.reducer.js';
import { createInitialComboboxState } from '../src/lib/components/ui/combobox/combobox.types.js';
import { createInitialCalendarState } from '../src/lib/components/ui/calendar/calendar.types.js';
import { createStore } from '../src/lib/store.svelte.js';
import Combobox from '../src/lib/components/ui/combobox/Combobox.svelte';
import Calendar from '../src/lib/components/ui/calendar/Calendar.svelte';
import Checkbox from '../src/lib/components/ui/checkbox/Checkbox.svelte';

const initial = () => createInitialComboboxState([{ value: 'old', label: 'Old' }]);
describe('correlated Combobox work', () => {
  it('rejects stale completion after open-close-open, not only a different phase', () => {
    const [opening] = reduce(initial(), { type: 'opened' }, {});
    const [closing] = reduce(opening, { type: 'closed' }, {});
    const [reopening] = reduce(closing, { type: 'opened' }, {});
    const [stale] = reduce(reopening, { type: 'openingCompleted', generation: opening.transitionGeneration! }, {});
    expect(stale).toBe(reopening);
    const [done] = reduce(reopening, { type: 'openingCompleted', generation: reopening.transitionGeneration! }, {});
    expect(done.dropdown.status).toBe('open');
  });
  it('ignores terminal actions in the wrong phase while accepting legacy same-phase completion', () => {
    const state = initial();
    expect(reduce(state, { type: 'openingCompleted' }, {})[0]).toBe(state);
    const [opening] = reduce(state, { type: 'opened' }, {});
    expect(reduce(opening, { type: 'closingCompleted' }, {})[0]).toBe(opening);
    expect(reduce(opening, { type: 'openingCompleted' }, {})[0].dropdown.status).toBe('open');
  });
  it('rejects old debounce even when the text returns to the same query', () => {
    const deps = { loadOptions: vi.fn(async () => []) };
    const [a] = reduce(initial(), { type: 'searchChanged', query: 'a' }, deps);
    const [b] = reduce(a, { type: 'searchChanged', query: 'b' }, deps);
    const [a2] = reduce(b, { type: 'searchChanged', query: 'a' }, deps);
    const [next] = reduce(a2, { type: 'searchDebounced', query: 'a', generation: a.searchGeneration! }, deps);
    expect(next).toBe(a2);
  });
  it('keeps latest results when real store requests resolve out of order for identical queries', async () => {
    const pending: Array<{ resolve: (value: Array<{value:string;label:string}>) => void; reject: (error: Error) => void }> = [];
    const store = createStore({ initialState: { ...initial(), searchQuery: 'a' }, reducer: reduce,
      dependencies: { loadOptions: () => new Promise<Array<{value:string;label:string}>>((resolve, reject) => pending.push({resolve,reject})) } });
    try {
      store.dispatch({ type: 'searchDebounced', query: 'a' });
      store.dispatch({ type: 'searchDebounced', query: 'a' });
      expect(pending).toHaveLength(2);
      pending[1]!.resolve([{ value: 'new', label: 'New' }]);
      await Promise.resolve(); await Promise.resolve();
      expect(store.state.options[0]?.value).toBe('new');
      pending[0]!.resolve([{ value: 'stale', label: 'Stale' }]);
      await Promise.resolve(); await Promise.resolve();
      expect(store.state.options[0]?.value).toBe('new');
      expect(store.state.isLoading).toBe(false);
    } finally { store.destroy(); }
  });
  it('does not let old errors clear latest results, and invalidates work on clear', () => {
    const deps = { loadOptions: async () => [] };
    const [loading] = reduce({ ...initial(), searchQuery: 'a' }, { type: 'searchDebounced', query: 'a' }, deps);
    const [loading2] = reduce(loading, { type: 'searchDebounced', query: 'a' }, deps);
    expect(reduce(loading2, { type: 'loadingFailed', error: 'old', query: 'a', generation: loading.loadGeneration! }, deps)[0]).toBe(loading2);
    const [cleared] = reduce(loading2, { type: 'cleared' }, deps);
    expect(reduce(cleared, { type: 'loadingCompleted', options: [], query: 'a', generation: loading2.loadGeneration! }, deps)[0]).toBe(cleared);
  });
  it('keeps loading visible across async keystrokes', () => {
    const deps={loadOptions:async()=>[]};
    const [next]=reduce({...initial(),isLoading:true},{type:'searchChanged',query:'next'},deps);
    expect(next.isLoading).toBe(true);
  });
  it('typing while closing reopens and rejects the pending close', () => {
    const store=createStore({initialState:initial(),reducer:reduce,ssr:{deferEffects:false}});
    try {
      store.dispatch({type:'opened'});store.dispatch({type:'openingCompleted'});store.dispatch({type:'closed'});
      const generation=store.state.transitionGeneration!;
      store.dispatch({type:'searchChanged',query:'typed'});
      expect(store.state.dropdown.status).toBe('opening');
      store.dispatch({type:'closingCompleted',generation});
      expect(store.state.searchQuery).toBe('typed');
    }finally{store.destroy();}
  });
});
it.each([''])('displays and clears a selected falsy value %s', async (value) => {
  const onchange = vi.fn();
  const view = render(Combobox, { options: [{ value, label: 'Selected' }], value, onchange });
  expect(view.container.querySelector('input')?.value).toBe('Selected');
  const clear = view.container.querySelector<HTMLButtonElement>('[aria-label="Clear selection"]')!;
  expect(clear).not.toBeNull();
  flushSync(() => clear.click());
  expect(onchange).toHaveBeenCalledWith(null);
});
it('links distinct comboboxes and highlights only existing options', () => {
  const views=[render(Combobox,{options:[{value:'a',label:'Apple'},{value:'b',label:'Banana'}]}),render(Combobox,{options:[{value:'c',label:'Cherry'}]})];
  const ids:string[]=[];
  for(const view of views){
    const input=view.container.querySelector('input')!;
    expect(input.getAttribute('aria-controls')).toBeNull();
    flushSync(()=>input.focus());
    const id=input.getAttribute('aria-controls')!;ids.push(id);
    const dropdown=document.getElementById(id);expect(dropdown).not.toBeNull();
    flushSync(()=>input.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})));
    const active=input.getAttribute('aria-activedescendant');expect(active).toBeTruthy();
    expect(dropdown?.querySelector(`[id="${active}"]`)).not.toBeNull();
  }
  expect(new Set(ids).size).toBe(2);
});
it.each(['single', 'range'] as const)('clears actual parent binding in %s mode', async (mode) => {
  let selectedDate: Date | null = new Date(2025, 5, 15);
  let selectedRange: {from:Date|null;to:Date|null} = { from: new Date(2025, 5, 1), to: new Date(2025, 5, 5) };
  const target = document.createElement('div'); document.body.append(target);
  const component = mount(Calendar, { target, props: {
    mode,
    get selectedDate() { return selectedDate; }, set selectedDate(value) { selectedDate = value; },
    get selectedRange() { return selectedRange; }, set selectedRange(value) { selectedRange = value; }
  } });
  try {
    flushSync();
    const clear = target.querySelector<HTMLButtonElement>('.calendar-clear-button')!;
    expect(clear).not.toBeNull();
    flushSync(() => clear.click());
    expect(selectedDate).toBeNull();
    expect(selectedRange).toEqual({from:null,to:null});
  } finally { await unmount(component); target.remove(); }
});
it('initializes Calendar store and month with selectedRange in range mode', () => {
  const from = new Date(2025, 5, 10);
  const to = new Date(2025, 5, 15);
  const state = createInitialCalendarState('range', null, null, null, { from, to });
  expect(state.selectedRange).toEqual({ from, to });
  expect(state.currentMonth.getFullYear()).toBe(2025);
  expect(state.currentMonth.getMonth()).toBe(5);
  const target = document.createElement('div'); document.body.append(target);
  const component = mount(Calendar, { target, props: { mode: 'range', selectedRange: { from, to } } });
  try {
    flushSync();
    const selectedDays = target.querySelectorAll('.calendar-day--selected');
    expect(selectedDays.length).toBe(2);
  } finally { unmount(component); target.remove(); }
});
it('styles the indeterminate surface consistently with its foreground glyph', () => {
  const view = render(Checkbox, { checked: false, indeterminate: true });
  const input = view.container.querySelector('input')!;
  expect(input.getAttribute('aria-checked')).toBe('mixed');
  expect(input.getAttribute('data-state')).toBe('indeterminate');
  expect(input.classList.contains('data-[state=indeterminate]:bg-primary')).toBe(true);
});
it('renders only named Collapsible content landmarks', () => {
  const view=render(CollapsibleHydration);
  const regions=[...view.container.querySelectorAll('[role="region"]')];expect(regions).toHaveLength(2);
  for(const region of regions){const id=region.getAttribute('aria-labelledby');expect(id).toBeTruthy();expect(document.getElementById(id!)?.textContent).toContain('Section');}
});
it('assigns distinct linked IDs to multiple Collapsibles', () => {
  const view = render(CollapsibleHydration);
  const triggers = [...view.container.querySelectorAll<HTMLButtonElement>('button[aria-controls]')];
  expect(triggers).toHaveLength(2);
  expect(new Set(triggers.map(trigger => trigger.id)).size).toBe(2);
  for (const trigger of triggers) {
    const content = document.getElementById(trigger.getAttribute('aria-controls')!);
    expect(content).not.toBeNull();
    expect(content?.getAttribute('aria-labelledby')).toBe(trigger.id);
  }
});

it('keeps controlled mixed Checkbox semantics synchronized after click', () => {
  const view=render(Checkbox,{indeterminate:true,checked:false});const input=view.container.querySelector('input')!;
  flushSync(()=>input.click());
  expect(input.checked).toBe(true);expect(input.indeterminate).toBe(true);expect(input.getAttribute('aria-checked')).toBe('mixed');expect(input.getAttribute('data-state')).toBe('indeterminate');
});

it('omits active descendant while loading or when no option exists', async () => {
  let complete!: (value:Array<{value:string;label:string}>)=>void;
  const loadOptions=vi.fn(()=>new Promise<Array<{value:string;label:string}>>(resolve=>{complete=resolve;}));
  const view=render(Combobox,{options:[{value:'a',label:'Apple'}],loadOptions,debounceDelay:0});
  const input=view.container.querySelector('input')!;
  flushSync(()=>{input.focus();input.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));});
  expect(input.getAttribute('aria-activedescendant')).toBeTruthy();
  flushSync(()=>{input.value='ap';input.dispatchEvent(new Event('input',{bubbles:true}));});
  await vi.waitFor(()=>expect(loadOptions).toHaveBeenCalledTimes(1));flushSync();
  expect(input.getAttribute('aria-activedescendant')).toBeNull();
  complete([]);await Promise.resolve();flushSync();expect(input.getAttribute('aria-activedescendant')).toBeNull();
});

it('cancels pending async search when its owning Combobox unmounts', async () => {
  const loadOptions=vi.fn(async()=>[]);
  const target=document.createElement('div');document.body.append(target);
  const component=mount(Combobox,{target,props:{options:[],loadOptions,debounceDelay:20}});
  flushSync();const input=target.querySelector('input')!;
  flushSync(()=>{input.value='pending';input.dispatchEvent(new Event('input',{bubbles:true}));});
  await unmount(component);target.remove();
  await new Promise(resolve=>setTimeout(resolve,60));
  expect(loadOptions).not.toHaveBeenCalled();
});
