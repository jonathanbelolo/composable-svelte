import { it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { flushSync, tick } from 'svelte';
import Pagination from '../src/lib/components/ui/pagination/Pagination.svelte';
import Progress from '../src/lib/components/ui/progress/Progress.svelte';
import Select from '../src/lib/components/ui/select/Select.svelte';
it('keeps user page-size changes and still accepts later external changes', async () => {
    const callback = vi.fn();
    const view = render(Pagination, { totalItems: 100, showItemsPerPage: true, onItemsPerPageChange: callback });
    const select = view.container.querySelector('select')!;
    flushSync(() => { select.value = '20'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    await tick();
    expect(select.value).toBe('20');
    expect(callback).toHaveBeenLastCalledWith(20);
    await view.rerender({ itemsPerPage: 50 });
    expect(select.value).toBe('50');
});
it('renders a nonzero indeterminate indicator without a determinate ARIA value', async () => {
    const view = render(Progress);
    const bar = view.container.querySelector('[role="progressbar"]')!;
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('100%');
    expect(bar.hasAttribute('aria-valuenow')).toBe(false);
    await view.rerender({ value: 25, max: 50 });
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('50%');
    expect(bar.getAttribute('aria-valuenow')).toBe('25');
});
it.each(['click', 'Enter', 'ArrowDown'])('focuses searchable Select on %s opening', async (method) => {
    const view = render(Select, { searchable: true, options: [{ value: 'a', label: 'Apple' }] });
    const trigger = view.container.querySelector<HTMLButtonElement>('[aria-haspopup="listbox"]')!;
    flushSync(() => { if (method === 'click')
        trigger.click();
    else
        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: method, bubbles: true })); });
    await tick();
    const input = view.container.querySelector('input');
    expect(input).not.toBeNull();
    expect(document.activeElement).toBe(input);
});
it('renders a selected empty-string label and supports clearing it', () => {
    const onchange = vi.fn();
    const view = render(Select, { options: [{ value: '', label: 'Empty value' }], value: '', onchange });
    const trigger = view.container.querySelector('[aria-haspopup="listbox"]')!;
    expect(trigger.textContent).toContain('Empty value');
    const clear = view.container.querySelector<HTMLButtonElement>('[aria-label="Clear selection"]')!;
    expect(clear).not.toBeNull();
    flushSync(() => clear.click());
    expect(onchange).toHaveBeenCalledWith(null);
});
it('treats an empty multiple-selection array as no selection', () => {
    const view = render(Select, { options: [{ value: 'a', label: 'Apple' }], value: [], multiple: true, placeholder: 'Choose' });
    expect(view.container.querySelector('[aria-haspopup="listbox"]')?.textContent).toContain('Choose');
    expect(view.container.querySelector('[aria-label="Clear selection"]')).toBeNull();
});

it('does not reclaim focus on unrelated state notifications while open', async () => {
 const view=render(Select,{searchable:true,options:[{value:'a',label:'Apple'}]});
 const trigger=view.container.querySelector<HTMLButtonElement>('[aria-haspopup="listbox"]')!;
 flushSync(()=>trigger.click());await tick();const input=view.container.querySelector('input')!;
 input.blur();expect(document.activeElement).not.toBe(input);
 flushSync(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})));await tick();
 expect(document.activeElement).not.toBe(input);
});
it('opening keys do not select and navigate exactly once', async () => {
 const onChange=vi.fn();const view=render(Select,{options:[{value:'a',label:'Apple'},{value:'b',label:'Banana'}],onchange:onChange});
 const trigger=view.container.querySelector<HTMLButtonElement>('[aria-haspopup="listbox"]')!;
 flushSync(()=>trigger.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})));await tick();expect(onChange).not.toHaveBeenCalled();
});
it('does not animate backwards from a full indeterminate bar',async()=>{
 const style=document.createElement('style');style.textContent='[role="progressbar"] {width:200px} [role="progressbar"] > div {transition:width 1s linear}';document.head.append(style);
 try {
  const view=render(Progress);const bar=view.container.querySelector('[role="progressbar"]')!;
  expect(bar.firstElementChild!.getBoundingClientRect().width).toBe(200);
  await view.rerender({value:25});
  expect(bar.firstElementChild!.getBoundingClientRect().width).toBe(50);
 } finally {style.remove();}
});
