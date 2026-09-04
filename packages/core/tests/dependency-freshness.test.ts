/**
 * Store dependencies must be read live, not frozen at mount.
 *
 * `createStore` re-reads `config.dependencies` on every dispatch, so a plain
 * object literal — `dependencies: { onSelect }` — captures whichever function
 * the prop held when the component set up, forever. Swap the callback and the
 * component keeps calling the old one. Nothing catches this: it typechecks, it
 * renders, and `svelte-check` cannot see it. `FileUpload.svelte:43-59` and
 * `Tooltip.svelte:65-71` already use the getter form and are the positive
 * controls at the bottom of this file.
 *
 * READ THIS BEFORE TRUSTING A GREEN RUN. Every case here works by mounting with
 * one callback, calling `rerender` with a second, then triggering the component
 * and asserting the second fired and the first did not. If `rerender` ever
 * remounts instead of updating props in place, the component rebuilds its
 * dependencies object, the bug disappears, and **every test in this file passes
 * while testing nothing**. H0 is the guard against that, and it is deliberately
 * the first test in the file.
 *
 * NOTE when this fails: a runaway effect poisons Svelte's error state for the
 * rest of the file, so one real failure can show up as several. Re-run the
 * first failing case alone (`vitest -t "<name>"`) before assuming the rest are
 * real — see `component-mount.test.ts` for the same warning.
 */

import { describe, it, expect, vi, type Mock } from 'vitest';
import { render } from 'vitest-browser-svelte';
import RerenderProbe, { probe, resetProbe } from './test-components/RerenderProbe.svelte';
import RerenderProbeParent from './test-components/RerenderProbeParent.svelte';
import Toaster from '../src/lib/components/toast/Toaster.svelte';
import { createToastStore } from '../src/lib/components/toast/index.js';
import TreeView from '../src/lib/components/ui/tree-view/TreeView.svelte';
import Carousel from '../src/lib/components/ui/carousel/Carousel.svelte';
import ImageGallery from '../src/lib/components/image-gallery/ImageGallery.svelte';
import Combobox from '../src/lib/components/ui/combobox/Combobox.svelte';
import Command from '../src/lib/components/command/Command.svelte';
import FileUpload from '../src/lib/components/ui/file-upload/FileUpload.svelte';
import AccordionCallbackTest from './test-components/AccordionCallbackTest.svelte';
import DropdownMenuCallbackTest from './test-components/DropdownMenuCallbackTest.svelte';
import TooltipDelayTest from './test-components/TooltipDelayTest.svelte';
import type { CommandItem } from '../src/lib/components/command/command.types.js';

const settle = (ms = 250) => new Promise((r) => setTimeout(r, ms));

const first = () => 'FIRST';
const second = () => 'SECOND';

describe('H0 — the methodology itself', () => {
	it('rerender updates props in place and can tell the two shapes apart', async () => {
		resetProbe();
		const { rerender, container } = render(RerenderProbe, { cb: first, marker: 'a' });
		await settle(50);

		await rerender({ cb: second, marker: 'b' });
		await settle(50);

		expect(
			probe.setups,
			'rerender remounted the component. Every case in this file is vacuous ' +
				'until this is fixed: a remount rebuilds the dependencies object, so ' +
				'the frozen-literal bug cannot be observed at all.'
		).toBe(1);

		expect(
			container.querySelector('[data-testid="probe-marker"]')?.textContent,
			'the new prop never reached the component'
		).toBe('b');

		// The load-bearing assertion: the same mount, both shapes side by side.
		// This is the one guard that cannot share the blind spot of the thing it
		// guards.
		expect(probe.frozen!.cb()).toBe('FIRST');
		expect(probe.live!.cb()).toBe('SECOND');
	});

	it('props reach a child component the same way', async () => {
		// Licenses the wrapper-based cases below (Accordion, DropdownMenu,
		// Tooltip), which cannot be expressed as props from a .ts file because
		// they need a `children` snippet.
		resetProbe();
		const { rerender } = render(RerenderProbeParent, { cb: first, marker: 'a' });
		await settle(50);

		await rerender({ cb: second, marker: 'b' });
		await settle(50);

		expect(probe.setups, 'the child remounted').toBe(1);
		expect(probe.frozen!.cb()).toBe('FIRST');
		expect(probe.live!.cb()).toBe('SECOND');
	});
});

/**
 * Both halves matter. Asserting only `second` passes if the component calls
 * both callbacks; asserting only `first` passes vacuously when the trigger
 * never reached the reducer at all.
 */
function expectSwapped(a: Mock, b: Mock, what: string) {
	// Reported as a pair, deliberately. `(first=1, second=0)` is the frozen
	// dependency — the defect. `(first=0, second=0)` is a trigger that never
	// reached the reducer — a broken test, which would otherwise be
	// indistinguishable from the defect and would "pass" the moment someone
	// applied a fix.
	const counts = `(first=${a.mock.calls.length}, second=${b.mock.calls.length})`;
	expect(
		b,
		`${what} ${counts}: the post-rerender callback must fire. If first=0 too, the trigger never reached the reducer and this test proves nothing.`
	).toHaveBeenCalledTimes(1);
	expect(
		a,
		`${what} ${counts}: the mount-time callback must NOT fire — a frozen dependencies literal keeps calling it`
	).not.toHaveBeenCalled();
}

const click = (el: Element | null) => {
	expect(el, 'trigger element not found — the test cannot prove anything').not.toBeNull();
	(el as HTMLElement).click();
};

describe('dependencies are read live', () => {
	it('TreeView onSelect', async () => {
		const a = vi.fn();
		const b = vi.fn();
		const { rerender, container } = render(TreeView, { nodes: [{ id: '1', label: 'One' }], onSelect: a });
		await settle();

		// `nodes` deliberately omitted: rerender merges, so leaving it out keeps
		// the array identity and avoids re-firing the nodes-sync effect.
		await rerender({ onSelect: b });
		await settle();

		click(container.querySelector('[role="treeitem"]'));
		await settle();

		expectSwapped(a, b, 'TreeView.onSelect');
	});

	it('Carousel onSlideChange', async () => {
		const a = vi.fn();
		const b = vi.fn();
		const { rerender, container } = render(Carousel, {
				// `CarouselSlide` is `{ id, data? }` — there is no `content` field, and
				// nothing here reads one. Two slides is all this test needs.
				slides: [{ id: '1' }, { id: '2' }],
				onSlideChange: a
			});
		await settle();

		await rerender({ onSlideChange: b });
		await settle();

		click(container.querySelector('[aria-label="Next slide"]'));
		await settle();

		expectSwapped(a, b, 'Carousel.onSlideChange');
	});

	it('ImageGallery onImageClick', async () => {
		const a = vi.fn();
		const b = vi.fn();
		const { rerender, container } = render(ImageGallery, { images: [{ id: '1', url: '/a.jpg', alt: 'A' }], onImageClick: a });
		await settle();

		await rerender({ onImageClick: b });
		await settle();

		click(container.querySelector('[aria-label="View A"]'));
		await settle();

		// `enableLightbox` is left at its default `true` on purpose. Passing
		// `false` takes the template's `else` branch, which reads the callback
		// straight off the live rest-props proxy — the spy would fire with the new
		// function and the store path, the thing under test, would never run.
		expect(
			document.querySelector('[aria-label="Image viewer"]'),
			'the click did not open the lightbox, so it never went through the store'
		).not.toBeNull();
		expectSwapped(a, b, 'ImageGallery.onImageClick');
	});

	it('Combobox loadOptions', async () => {
		const a = vi.fn(async () => []);
		const b = vi.fn(async () => []);
		const { rerender, container } = render(Combobox, { options: [], loadOptions: a, debounceDelay: 20 });
		await settle();

		await rerender({ loadOptions: b });
		await settle();

		const input = container.querySelector('[role="combobox"]') as HTMLInputElement;
		expect(input, 'no combobox input').not.toBeNull();
		input.value = 'ab';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		await settle(400);

		expectSwapped(a, b, 'Combobox.loadOptions');
	});

	it('Command onCommandExecute, arriving after mount', async () => {
		// The shape the frozen literal made worst, and the one nothing covered.
		// `dependencies.onCommandExecute` was built from a *ternary* evaluated at
		// setup, so a palette mounted without the prop kept `undefined` forever
		// even after the prop arrived. Note the plain swap (a -> b) passes even
		// with the frozen literal, because the wrapped closure body reads the
		// live prop — the ternary is the only observable half, so this test goes
		// undefined -> function deliberately.
		const onCommandExecute = vi.fn();
		// The reducer falls through `deps?.onCommandExecute` to `command.onSelect`.
		// If the fallback fires, the dependency was still undefined.
		const sentinel = vi.fn();

		const { rerender, container } = render(Command, {
				open: false,
				commands: [{ id: 'a', label: 'Alpha', onSelect: sentinel }]
			});
		await settle();

		await rerender({ open: true, onCommandExecute });
		await settle(400);

		const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
		expect(dialog, 'the palette did not open, so nothing was triggered').not.toBeNull();
		dialog.focus();
		dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		await settle();

		expect(
			onCommandExecute,
			'the late-arriving onCommandExecute must fire'
		).toHaveBeenCalledTimes(1);
		expect(
			sentinel,
			'the command.onSelect fallback fired, which means dependencies.onCommandExecute was still undefined'
		).not.toHaveBeenCalled();
	});

	it('Command filterFunction', async () => {
		// `filterFunction` is `(commands: CommandItem[], query: string) => CommandItem[]`;
		// typing the spies as `(c: unknown[]) => unknown[]` did not match it.
		const a = vi.fn((c: CommandItem[], _query: string) => c);
		const b = vi.fn((c: CommandItem[], _query: string) => c);
		const { rerender } = render(Command, { open: true, commands: [{ id: 'a', label: 'Alpha' }], filterFunction: a });
		await settle();

		// The commands-sync effect is the trigger here, so `commands` must differ
		// by value or `sameCommands` short-circuits it. (`filterFunction` has no
		// DOM route of its own: `CommandInput` takes `store` as a prop and
		// `Command` renders `{@render children()}` with no arguments and provides
		// no context, so a child cannot reach the store. `onCommandExecute` does
		// have one — see the next test.)
		a.mockClear();
		await rerender({ commands: [{ id: 'b', label: 'Beta' }], filterFunction: b });
		await settle();

		expectSwapped(a, b, 'Command.filterFunction');
	});
});

describe('dependencies are read live — snippet-taking components', () => {
	it('Accordion onExpand', async () => {
		const a = vi.fn();
		const b = vi.fn();
		const { rerender, container } = render(AccordionCallbackTest, { onExpand: a });
		await settle();

		await rerender({ onExpand: b });
		await settle();

		click(container.querySelector('button'));
		await settle();

		expectSwapped(a, b, 'Accordion.onExpand');
	});

	it('DropdownMenu onSelect', async () => {
		const a = vi.fn();
		const b = vi.fn();
		const { rerender, container } = render(DropdownMenuCallbackTest, { onSelect: a });
		await settle();

		await rerender({ onSelect: b });
		await settle();

		click(container.querySelector('[aria-haspopup="true"]'));
		// The menu is `opacity: 0` while presenting; wait past animateDropdownIn
		// before clicking through it.
		await settle(450);

		click(document.querySelector('[role="menuitem"]'));
		await settle();

		expectSwapped(a, b, 'DropdownMenu.onSelect');
	});
});

describe('Toaster', () => {
	it('dependencies fire, now that the store is reachable', async () => {
		// This was `it.skip` with a comment explaining that `Toaster`'s
		// `dependencies` prop was entirely dead — nothing could put a toast into
		// the store they were attached to, so `onToastAdded`/`onToastDismissed`/
		// `generateId` could never fire. A gate someone had already written and
		// could not close.
		//
		// `dependencies` is gone from the component; `createToastStore` is the
		// path that works, and this asserts it does.
		const onToastAdded = vi.fn();
		const store = createToastStore({ dependencies: { onToastAdded } });
		render(Toaster, { store });
		await settle();

		store.dispatch({ type: 'toastAdded', toast: { variant: 'info', description: 'x' } });
		await settle();

		expect(onToastAdded).toHaveBeenCalledTimes(1);
	});
});

describe('positive controls — components already carrying the fix', () => {
	// These two are the automatic distinction between "the product is broken"
	// and "my test is broken". If a control fails while the cases above pass,
	// the harness or the trigger is wrong, not the component.

	it('FileUpload onUpload (already fixed)', async () => {
		const a = vi.fn();
		const b = vi.fn();
		const { rerender, container } = render(FileUpload, { accept: 'image/*', maxSize: 1024, onUpload: a });
		await settle();

		await rerender({ onUpload: b });
		await settle();

		const dropzone = container.querySelector('[aria-label="File upload dropzone"]');
		expect(dropzone, 'no dropzone').not.toBeNull();
		const dt = new DataTransfer();
		dt.items.add(new File(['x'], 'a.png', { type: 'image/png' }));
		dropzone!.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
		await settle(400);

		expectSwapped(a, b, 'FileUpload.onUpload — ALREADY FIXED, so a failure here is the harness');
	});

	it('Tooltip delay, both directions (already fixed)', async () => {
		// A numeric dependency has no first/second, so it is checked in both
		// directions. The second half is what stops the first from passing for a
		// component that simply always used a short delay.
		const long = render(TooltipDelayTest, { delay: 5000 });
		await settle();
		await long.rerender({ delay: 0 });
		await settle();
		(long.container.querySelector('button') as HTMLElement).focus();
		await settle(250);
		expect(
			document.querySelector('[role="tooltip"]'),
			'delay 5000 -> 0: the tooltip should appear immediately — ALREADY FIXED, so this is the harness'
		).not.toBeNull();
		long.unmount();
		await settle(50);

		const short = render(TooltipDelayTest, { delay: 0 });
		await settle();
		await short.rerender({ delay: 5000 });
		await settle();
		(short.container.querySelector('button') as HTMLElement).focus();
		await settle(250);
		expect(
			document.querySelector('[role="tooltip"]'),
			'delay 0 -> 5000: the tooltip should NOT have appeared yet'
		).toBeNull();
	});
});
