import { createStore } from '../src/lib/store.svelte.js';
import { fileUploadReducer } from '../src/lib/components/ui/file-upload/file-upload.reducer.js';
import { createInitialFileUploadState, type UploadedFile } from '../src/lib/components/ui/file-upload/file-upload.types.js';
import NumericInputBinding from './fixtures/NumericInputBinding.svelte';
import { userEvent } from 'vitest/browser';
import { it, expect, vi, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { flushSync, createRawSnippet, mount, unmount, tick } from 'svelte';
import DropdownMenu from '../src/lib/components/ui/dropdown-menu/DropdownMenu.svelte';
import { dropdownMenuReducer as reduce } from '../src/lib/components/ui/dropdown-menu/dropdown-menu.reducer.js';
import { createInitialDropdownMenuState } from '../src/lib/components/ui/dropdown-menu/dropdown-menu.types.js';
import FileUpload from '../src/lib/components/ui/file-upload/FileUpload.svelte';
import Input from '../src/lib/components/ui/input/Input.svelte';

afterEach(() => vi.restoreAllMocks());

const items = [
	{ id: 'a', label: 'Alpha' },
	{ id: 'b', label: 'Beta' },
	{ id: 'c', label: 'Gamma' }
];
const children = createRawSnippet(() => ({ render: () => '<span>Commands</span>' }));

it.each([
	['ArrowDown', 'Alpha'],
	['ArrowUp', 'Gamma']
])('opens menu with exactly one %s movement', (key, label) => {
	const view = render(DropdownMenu, { items, children });
	const trigger = view.container.querySelector('[role="button"]')!;
	flushSync(() => trigger.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
	const highlighted = [...view.container.querySelectorAll('[role="menuitem"]')].filter((node) =>
		node.classList.contains('bg-accent')
	);
	expect(highlighted).toHaveLength(1);
	expect(highlighted[0]?.textContent).toContain(label);
});

it('handles arrow key navigation when menu is already open', () => {
	const view = render(DropdownMenu, { items, children });
	const trigger = view.container.querySelector<HTMLElement>('[role="button"]')!;
	flushSync(() => trigger.click());
	flushSync(() => trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
	const highlighted = [...view.container.querySelectorAll('[role="menuitem"]')].filter((node) =>
		node.classList.contains('bg-accent')
	);
	expect(highlighted).toHaveLength(1);
	expect(highlighted[0]?.textContent).toContain('Alpha');
});

it('updates live menu props and never selects a removed command', async () => {
	const onSelect = vi.fn();
	const view = render(DropdownMenu, { items, children, onSelect });
	flushSync(() => view.container.querySelector<HTMLElement>('[role="button"]')!.click());
	await view.rerender({ items: [{ id: 'new', label: 'Replacement' }] });
	const buttons = view.container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
	expect(buttons).toHaveLength(1);
	expect(buttons[0]?.textContent).toContain('Replacement');
	flushSync(() => buttons[0]!.click());
	expect(onSelect).toHaveBeenCalledWith({ id: 'new', label: 'Replacement' });
});

it('retains highlight by item id across equivalent arrays/reorder and clears if removed or disabled', () => {
	const state = { ...createInitialDropdownMenuState(items), highlightedIndex: 1 };
	expect(reduce(state, { type: 'itemsChanged', items }, {})[0]).toBe(state);

	const [equivalent] = reduce(
		state,
		{ type: 'itemsChanged', items: [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }, { id: 'c', label: 'Gamma' }] },
		{}
	);
	expect(equivalent.highlightedIndex).toBe(1);

	const [reordered] = reduce(
		state,
		{ type: 'itemsChanged', items: [{ id: 'c', label: 'Gamma' }, { id: 'b', label: 'Beta' }, { id: 'a', label: 'Alpha' }] },
		{}
	);
	expect(reordered.highlightedIndex).toBe(1);

	const [movedToZero] = reduce(
		state,
		{ type: 'itemsChanged', items: [{ id: 'b', label: 'Beta' }, { id: 'a', label: 'Alpha' }] },
		{}
	);
	expect(movedToZero.highlightedIndex).toBe(0);

	const [removed] = reduce(state, { type: 'itemsChanged', items: [items[0]!] }, {});
	expect(removed.highlightedIndex).toBe(-1);

	const [disabled] = reduce(
		state,
		{ type: 'itemsChanged', items: [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta', disabled: true }, { id: 'c', label: 'Gamma' }] },
		{}
	);
	expect(disabled.highlightedIndex).toBe(-1);
});

const drop = (target: HTMLElement, names: string[]) => {
	const dataTransfer = new DataTransfer();
	for (const name of names) {
		dataTransfer.items.add(new File(['x'], name, { type: 'image/png' }));
	}
	flushSync(() => target.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer })));
};

it('applies single-file policy to dropping and cumulative selection', () => {
	const changed = vi.fn();
	const view = render(FileUpload, { multiple: false, onFilesChange: changed });
	const target = view.container.querySelector<HTMLElement>('[role="button"]')!;
	drop(target, ['one.png', 'two.png']);
	expect(changed.mock.lastCall?.[0]).toHaveLength(1);
	drop(target, ['three.png']);
	expect(changed.mock.lastCall?.[0]).toHaveLength(1);
	expect(view.container.textContent).not.toContain('two.png');
	expect(view.container.textContent).not.toContain('three.png');
});

it('renders dropzone limits matching enforcement when multiple is false and when maxFiles is 0', () => {
	const view = render(FileUpload, { multiple: false, maxFiles: 5 });
	expect(view.container.textContent).toContain('Maximum 1 file');
	expect(view.container.textContent).not.toContain('Maximum 5 files');

	const viewZero = render(FileUpload, { maxFiles: 0 });
	expect(viewZero.container.textContent).toContain('Maximum 0 files');
});

it('revokes removed, cleared, and remaining unmounted previews exactly once', () => {
	const revoke = vi.spyOn(URL, 'revokeObjectURL');
	const changed = vi.fn();
	const view = render(FileUpload, { onFilesChange: changed });
	const target = view.container.querySelector<HTMLElement>('[role="button"]')!;
	drop(target, ['one.png', 'two.png']);
	const urls = changed.mock.lastCall![0].map((file: { previewUrl: string }) => file.previewUrl);
	flushSync(() =>
		view.container.querySelector<HTMLButtonElement>('[aria-label="Remove one.png"]')!.click()
	);
	expect(revoke.mock.calls.filter((call) => call[0] === urls[0])).toHaveLength(1);
	flushSync(() =>
		view.container.querySelector<HTMLButtonElement>('[aria-label="Clear all files"]')!.click()
	);
	expect(revoke.mock.calls.filter((call) => call[0] === urls[1])).toHaveLength(1);
	drop(target, ['three.png']);
	const last = changed.mock.lastCall![0][0].previewUrl;
	view.unmount();
	expect(revoke.mock.calls.filter((call) => call[0] === last)).toHaveLength(1);
});

it('keeps numeric binding and dispatched payload aligned, including an empty field', async () => {
	let value: string | number = 5;
	const dispatch = vi.fn();
	const target = document.createElement('div');
	document.body.append(target);
	const component = mount(Input, {
		target,
		props: {
			type: 'number',
			get value() {
				return value;
			},
			set value(next) {
				value = next;
			},
			action: { type: 'changed' },
			dispatch
		}
	});
	try {
		flushSync();
		const input = target.querySelector('input')!;
		for (const [raw, expected] of [
			['12', 12],
			['', '']
		] as const) {
			flushSync(() => {
				input.value = raw;
				input.dispatchEvent(new Event('input', { bubbles: true }));
			});
			await tick();
			expect(value).toBe(expected);
			expect(dispatch).toHaveBeenLastCalledWith({ type: 'changed', value: expected });
			expect(input.value).toBe(raw);
		}
	} finally {
		await unmount(component);
		target.remove();
	}
});

it('preserves real numeric keystrokes and distinguishes partial exponent from clearing', async () => {
 let value: string | number = '';
 const dispatch = vi.fn();
 const target = document.createElement('div'); document.body.append(target);
 const component = mount(Input, { target, props: { type: 'number', get value(){return value;}, set value(next){value=next;}, action:{type:'changed'}, dispatch } });
 try {
  flushSync(); const input=target.querySelector('input')!;
  await userEvent.click(input);
  await userEvent.keyboard('1.50');
  expect(input.value).toBe('1.50'); expect(value).toBe(1.5);
  await userEvent.clear(input); expect(value).toBe('');
  await userEvent.keyboard('007'); expect(input.value).toBe('007'); expect(value).toBe(7);
  await userEvent.clear(input); await userEvent.keyboard('1'); dispatch.mockClear();
  await userEvent.keyboard('e');
  expect(input.validity.badInput).toBe(true); expect(input.value).toBe('');
  expect(value).toBe(1); expect(dispatch).not.toHaveBeenCalled();
  await userEvent.keyboard('2'); expect(input.value).toBe('1e2'); expect(value).toBe(100);
  await userEvent.clear(input); expect(value).toBe(''); expect(dispatch).toHaveBeenLastCalledWith({type:'changed',value:''});
 } finally {await unmount(component);target.remove();}
});

it('preserves lexical edits with a reactive parent binding', async () => {
 const dispatch=vi.fn(); const view=render(NumericInputBinding,{dispatch});
 const input=view.container.querySelector('input')!;
 await userEvent.click(input); await userEvent.keyboard('1.50');
 expect(input.value).toBe('1.50'); expect(view.container.querySelector('output')!.textContent).toBe('1.5');
 await userEvent.clear(input); await userEvent.keyboard('007'); expect(input.value).toBe('007');
 await userEvent.clear(input); await userEvent.keyboard('1');dispatch.mockClear();
 await userEvent.keyboard('e'); expect(input.validity.badInput).toBe(true);
 expect(view.container.querySelector('output')!.textContent).toBe('1');expect(dispatch).not.toHaveBeenCalled();
 await userEvent.keyboard('2');expect(input.value).toBe('1e2');expect(view.container.querySelector('output')!.textContent).toBe('100');
});

it('owns previews in a standalone store and releases on remove, clear, and destroy', () => {
 const revoke=vi.spyOn(URL,'revokeObjectURL'); const changed=vi.fn();
 const store=createStore({initialState:createInitialFileUploadState(),reducer:fileUploadReducer,dependencies:{onFilesChange:changed}});
 const add=()=>store.dispatch({type:'filesSelected',files:[new File(['x'],'a.png',{type:'image/png'})]});
 add();let file=store.state.files[0]!;const first=file.previewUrl!;
 expect(changed.mock.lastCall![0][0].previewUrl).toBe(first);
 store.dispatch({type:'fileRemoved',fileId:file.id});expect(revoke.mock.calls.filter(c=>c[0]===first)).toHaveLength(1);
 add();const second=store.state.files[0]!.previewUrl!;store.dispatch({type:'allFilesCleared'});
 expect(revoke.mock.calls.filter(c=>c[0]===second)).toHaveLength(1);
 add();const third=store.state.files[0]!.previewUrl!;store.destroy();store.destroy();
 expect(revoke.mock.calls.filter(c=>c[0]===third)).toHaveLength(1);
});

it.each(['remove','destroy'] as const)('releases setup-acquired preview when callback synchronously requests %s', kind => {
 const revoke=vi.spyOn(URL,'revokeObjectURL');let url:string|undefined;
 const store=createStore({initialState:createInitialFileUploadState(),reducer:fileUploadReducer,dependencies:{onFilesChange(files:UploadedFile[]){
  const file=files.find(f=>f.previewUrl);if(!file)return;url=file.previewUrl;
  if(kind==='destroy')store.destroy();else store.dispatch({type:'fileRemoved',fileId:file.id});
 }}});
 store.dispatch({type:'filesSelected',files:[new File(['x'],'x.png',{type:'image/png'})]});
 expect(url).toBeTruthy();expect(revoke.mock.calls.filter(c=>c[0]===url)).toHaveLength(1);store.destroy();
 expect(revoke.mock.calls.filter(c=>c[0]===url)).toHaveLength(1);
});

it('does not require a preview for non-images or a failed URL factory', () => {
 const create=vi.spyOn(URL,'createObjectURL').mockImplementation(()=>{throw Error('denied');});
 const revoke=vi.spyOn(URL,'revokeObjectURL');
 const store=createStore({initialState:createInitialFileUploadState(),reducer:fileUploadReducer,dependencies:{}});
 store.dispatch({type:'filesSelected',files:[new File(['x'],'a.txt',{type:'text/plain'})]});expect(create).not.toHaveBeenCalled();
 store.dispatch({type:'filesSelected',files:[new File(['x'],'b.png',{type:'image/png'})]});expect(create).toHaveBeenCalledTimes(1);
 expect(store.state.files).toHaveLength(2);expect(store.state.files.every(f=>!f.previewUrl)).toBe(true);store.destroy();expect(revoke).not.toHaveBeenCalled();
});

it('keeps keyboard interaction local, exposes active command, and restores focus on escape', async () => {
 const select=vi.fn();const view=render(DropdownMenu,{items,children,onSelect:select});
 const trigger=view.container.querySelector<HTMLElement>('[role="button"]')!;
 await userEvent.click(trigger);const menu=view.container.querySelector<HTMLElement>('[role="menu"]')!;
 expect(document.activeElement).toBe(menu);
 await userEvent.keyboard('{ArrowDown}');
 expect(menu.getAttribute('aria-activedescendant')).toBe(view.container.querySelector('[role="menuitem"]')!.id);
 const foreign=document.createElement('input');document.body.append(foreign);
 const event=new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});foreign.dispatchEvent(event);
 expect(event.defaultPrevented).toBe(false);expect(select).not.toHaveBeenCalled();
 await userEvent.keyboard('{Escape}');expect(document.activeElement).toBe(trigger);expect(trigger.getAttribute('aria-expanded')).toBe('false');foreign.remove();
});

it('does not resurrect a file removed before preview setup or retain its URL', () => {
 const create=vi.spyOn(URL,'createObjectURL');const revoke=vi.spyOn(URL,'revokeObjectURL');
 const store=createStore({initialState:createInitialFileUploadState(),reducer:fileUploadReducer,dependencies:{onFilesChange(files:UploadedFile[]){
  if(files.length && !files[0]!.previewUrl) store.dispatch({type:'allFilesCleared'});
 }}});
 store.dispatch({type:'filesSelected',files:[new File(['x'],'x.png',{type:'image/png'})]});
 expect(store.state.files).toHaveLength(0);expect(create).toHaveBeenCalledTimes(1);
 const url=create.mock.results[0]!.value;expect(revoke.mock.calls.filter(c=>c[0]===url)).toHaveLength(1);
 store.destroy();expect(revoke.mock.calls.filter(c=>c[0]===url)).toHaveLength(1);
});

it('keeps active identity through mounted array replacement and closes on focus departure', async () => {
 const view=render(DropdownMenu,{items,children});const trigger=view.container.querySelector<HTMLElement>('[role="button"]')!;
 await userEvent.click(trigger);await userEvent.keyboard('{ArrowDown}{ArrowDown}');
 await view.rerender({items:[{id:'b',label:'New Beta'},{id:'a',label:'Alpha'}]});
 const menu=view.container.querySelector<HTMLElement>('[role="menu"]')!;
 const active=document.getElementById(menu.getAttribute('aria-activedescendant')!);
 expect(active?.textContent).toContain('New Beta');
 const next=document.createElement('button');document.body.append(next);next.focus();await tick();
 expect(trigger.getAttribute('aria-expanded')).toBe('false');expect(document.activeElement).toBe(next);next.remove();
});

it('closes on Tab without trapping keyboard focus', async () => {
 const view=render(DropdownMenu,{items,children});const trigger=view.container.querySelector<HTMLElement>('[role="button"]')!;
 const next=document.createElement('button');next.textContent='After';view.container.append(next);
 await userEvent.click(trigger);await userEvent.keyboard('{Tab}');
 expect(trigger.getAttribute('aria-expanded')).toBe('false');expect(document.activeElement).toBe(next);
});
