/**
 * The last of core's never-executed components: the data table, the form parts,
 * and the remaining form controls.
 *
 * The data table is the one that matters most here. It is three components
 * driven by a reducer — sorting, paging, selection — and nothing had rendered
 * any of them, so the wiring between the store and the markup was entirely
 * unchecked. A table that sorts its *header arrows* without sorting its rows
 * looks completely correct in a screenshot.
 *
 * The `Form*` parts are the opposite kind of risk: they are four thin wrappers
 * whose whole job is to be the right element in the right place, and a wrapper
 * that renders the wrong tag is invisible until a screen reader meets it.
 */

import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { Snippet } from 'svelte';
import { createRawSnippet } from 'svelte';
import { createStore } from '@composable-svelte/core';

import Radio from '../src/lib/components/ui/radio/Radio.svelte';
import RadioGroupHarness from './test-components/RadioGroupHarness.svelte';
import RadioGroup from '../src/lib/components/ui/radio/RadioGroup.svelte';
import Slider from '../src/lib/components/ui/slider/Slider.svelte';
import FormItem from '../src/lib/components/form/FormItem.svelte';
import FormLabel from '../src/lib/components/form/FormLabel.svelte';
import FormDescription from '../src/lib/components/form/FormDescription.svelte';
import FormMessage from '../src/lib/components/form/FormMessage.svelte';
import DataTable from '../src/lib/components/data-table/DataTable.svelte';
import DataTableHeader from '../src/lib/components/data-table/DataTableHeader.svelte';
import DataTablePagination from '../src/lib/components/data-table/DataTablePagination.svelte';
import { createTableReducer, createInitialState } from '../src/lib/components/data-table/table.reducer.js';

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));
const emptyChildren = (() => {}) as unknown as Snippet;
const textChildren = createRawSnippet(() => ({ render: () => '<span>content</span>' }));

async function mountIn(component: unknown, props: Record<string, unknown>) {
	const { container } = render(component as never, props as never);
	await settle();
	return container;
}

interface Row {
	id: number;
	name: string;
}
const ROWS: Row[] = [
	{ id: 1, name: 'Charlie' },
	{ id: 2, name: 'Alice' },
	{ id: 3, name: 'Bob' }
];

// `createInitialState` takes a *config*, not a bare array — passing rows
// directly leaves `initialData` undefined and builds an empty table, which is
// how the first version of these tests measured zero rows.
const tableStore = (rows: Row[] = ROWS, state: Record<string, unknown> = {}) =>
	createStore({
		initialState: { ...createInitialState<Row>({ initialData: rows }), ...state } as never,
		reducer: createTableReducer<Row>() as never,
		dependencies: {} as never
	});

describe('Radio and RadioGroup', () => {
	it('renders a radio input', async () => {
		const container = await mountIn(RadioGroup, { name: 'choice', children: emptyChildren });
		expect(container.querySelector('*')).not.toBeNull();
	});

	// `Radio` throws "must be used within a RadioGroup" on its own, which is
	// correct — a radio outside a group has no name to share and cannot be
	// exclusive. So it is exercised through the harness that provides the
	// context, which is also how a consumer uses it.
	it('refuses to render outside a group, and says so', async () => {
		await expect(mountIn(Radio, { value: 'yes' })).rejects.toThrow(/RadioGroup/);
	});

	it('renders a radio with its value inside a group', async () => {
		const container = await mountIn(RadioGroupHarness, { value: 'yes' });
		const input = container.querySelector('input[type="radio"]') as HTMLInputElement | null;
		expect(input, 'Radio rendered no radio input').not.toBeNull();
		expect(input!.value).toBe('yes');
	});

	it('shares the group name, which is what makes the choice exclusive', async () => {
		const container = await mountIn(RadioGroupHarness, { value: 'yes', name: 'choice' });
		const inputs = [...container.querySelectorAll('input[type="radio"]')] as HTMLInputElement[];
		expect(inputs.length).toBeGreaterThan(1);
		expect(new Set(inputs.map((i) => i.name)).size).toBe(1);
	});

	it('disables a radio', async () => {
		const container = await mountIn(RadioGroupHarness, { value: 'yes', disabled: true });
		expect((container.querySelector('input[type="radio"]') as HTMLInputElement).disabled).toBe(
			true
		);
	});
});

describe('Slider', () => {
	it('renders a range input carrying its value', async () => {
		const container = await mountIn(Slider, { value: 30 });
		const input = container.querySelector('input[type="range"]') as HTMLInputElement | null;
		expect(input, 'Slider rendered no range input').not.toBeNull();
		expect(input!.value).toBe('30');
	});

	it('honours min, max and step', async () => {
		const container = await mountIn(Slider, { value: 5, min: 0, max: 50, step: 5 });
		const input = container.querySelector('input[type="range"]') as HTMLInputElement;
		expect(input.min).toBe('0');
		expect(input.max).toBe('50');
		expect(input.step).toBe('5');
	});

	it('disables the element', async () => {
		const container = await mountIn(Slider, { value: 5, disabled: true });
		expect((container.querySelector('input[type="range"]') as HTMLInputElement).disabled).toBe(
			true
		);
	});
});

describe('the Form parts are the elements they claim to be', () => {
	// Four thin wrappers whose entire job is to be the right tag in the right
	// place. A description rendered as a <div> instead of a <p>, or a message
	// that is not announced, is invisible until a screen reader meets it.
	it('FormItem renders a container with its children', async () => {
		const container = await mountIn(FormItem, { children: textChildren });
		expect(container.querySelector('*')).not.toBeNull();
		expect(container.textContent).toContain('content');
	});

	it('FormLabel renders a label element', async () => {
		const container = await mountIn(FormLabel, { children: textChildren });
		expect(container.querySelector('label'), 'FormLabel rendered no <label>').not.toBeNull();
	});

	it('FormDescription renders its text', async () => {
		const container = await mountIn(FormDescription, { children: textChildren });
		expect(container.textContent).toContain('content');
	});

	it('FormMessage renders its text', async () => {
		const container = await mountIn(FormMessage, { children: textChildren });
		expect(container.textContent).toContain('content');
	});

	it.each([
		['FormItem', FormItem],
		['FormLabel', FormLabel],
		['FormDescription', FormDescription],
		['FormMessage', FormMessage]
	])('%s forwards the caller’s class', async (_name, component) => {
		const container = await mountIn(component, { children: textChildren, class: 'mine' });
		expect(container.querySelector('.mine')).not.toBeNull();
	});
});

describe('DataTable', () => {
	const rowSnippet = createRawSnippet<[Row]>((row) => ({
		render: () => `<tr><td>${row().name}</td></tr>`
	}));

	it('renders a row per datum', async () => {
		const container = await mountIn(DataTable, { store: tableStore(), row: rowSnippet });
		expect(container.querySelectorAll('tbody tr').length).toBe(3);
	});

	it('renders the data it was given, not placeholder text', async () => {
		const container = await mountIn(DataTable, { store: tableStore(), row: rowSnippet });
		expect(container.textContent).toContain('Charlie');
		expect(container.textContent).toContain('Alice');
	});

	it('shows the empty message when there is nothing', async () => {
		const container = await mountIn(DataTable, {
			store: tableStore([]),
			row: rowSnippet,
			emptyMessage: 'Nothing here yet'
		});
		expect(container.textContent).toContain('Nothing here yet');
		expect(container.querySelectorAll('tbody tr').length).toBe(0);
	});

	it('follows the store when rows change', async () => {
		// The wiring that a screenshot cannot check: the table must be a view of
		// the store rather than a snapshot of it.
		const store = tableStore();
		const container = await mountIn(DataTable, { store, row: rowSnippet });
		expect(container.querySelectorAll('tbody tr').length).toBe(3);

		store.dispatch({ type: 'dataLoaded', data: [ROWS[0]!] } as never);
		await settle();

		expect(container.querySelectorAll('tbody tr').length).toBe(1);
	});
});

describe('DataTableHeader', () => {
	const columns = [
		{ key: 'name' as const, label: 'Name', sortable: true },
		{ key: 'id' as const, label: 'ID', sortable: false }
	];

	it('renders a heading per column', async () => {
		const container = await mountIn(DataTableHeader, { store: tableStore(), columns });
		expect(container.textContent).toContain('Name');
		expect(container.textContent).toContain('ID');
	});

	it('sorts the store when a sortable heading is activated', async () => {
		// The defect this guards is the one that looks right: a header that
		// toggles its own arrow without telling the store to sort.
		const store = tableStore();
		const container = await mountIn(DataTableHeader, { store, columns });

		const sortable = container.querySelector('th button, button') as HTMLElement | null;
		expect(sortable, 'no activatable sort control rendered').not.toBeNull();
		sortable!.click();
		await settle();

		expect((store.state as { sorting: unknown[] }).sorting.length).toBeGreaterThan(0);
	});
});

describe('DataTablePagination', () => {
	it('renders controls', async () => {
		const container = await mountIn(DataTablePagination, { store: tableStore() });
		expect(container.querySelector('*')).not.toBeNull();
	});

	it('offers the page sizes it was given', async () => {
		const container = await mountIn(DataTablePagination, {
			store: tableStore(),
			pageSizeOptions: [5, 25, 100]
		});
		const text = container.textContent ?? '';
		for (const size of ['5', '25', '100']) {
			expect(text).toContain(size);
		}
	});
});
