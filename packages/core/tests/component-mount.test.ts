/**
 * Every store-owning component must mount without a runaway effect.
 *
 * Several components sync an array prop into their store from an unguarded
 * `$effect`. `dispatch` reads store state inside that effect's tracking scope,
 * so a reducer case that returns a fresh object on every dispatch re-triggers
 * the effect forever — `effect_update_depth_exceeded`, on mount, with no
 * workaround for the consumer.
 *
 * `Select` and `Command` both shipped that way and neither was caught, because
 * their suites are reducer-level and never render. Props here are written as
 * inline literals on purpose: that is what a consumer writes, and it is a fresh
 * array identity on every render, which is exactly what a reference-equality
 * guard fails to absorb.
 */

import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';

import Select from '../src/lib/components/ui/select/Select.svelte';
import Combobox from '../src/lib/components/ui/combobox/Combobox.svelte';
import TreeView from '../src/lib/components/ui/tree-view/TreeView.svelte';
import Command from '../src/lib/components/command/Command.svelte';
import Pagination from '../src/lib/components/ui/pagination/Pagination.svelte';
import Calendar from '../src/lib/components/ui/calendar/Calendar.svelte';
import Carousel from '../src/lib/components/ui/carousel/Carousel.svelte';
import Accordion from '../src/lib/components/ui/accordion/Accordion.svelte';
import FileUpload from '../src/lib/components/ui/file-upload/FileUpload.svelte';

const settle = () => new Promise((resolve) => setTimeout(resolve, 120));

/** Each entry builds its props fresh, so every render gets new array identities. */
const cases: Array<[string, any, () => Record<string, unknown>]> = [
	['Select', Select, () => ({ options: [{ value: 'a', label: 'A' }], value: 'a' })],
	['Combobox', Combobox, () => ({ options: [{ value: 'a', label: 'A' }], value: 'a' })],
	['TreeView', TreeView, () => ({ nodes: [{ id: '1', label: 'One' }] })],
	['Command', Command, () => ({ open: true, commands: [{ id: 'a', label: 'Alpha' }] })],
	['Pagination', Pagination, () => ({ totalItems: 50, pageSize: 10 })],
	['Calendar', Calendar, () => ({ mode: 'single' as const })],
	['Carousel', Carousel, () => ({ slides: [{ id: '1', content: 'one' }] })],
	['Accordion', Accordion, () => ({ items: [{ id: '1', title: 'One', content: 'c' }] })],
	['FileUpload', FileUpload, () => ({ accept: 'image/*', maxSize: 1024 })]
];

describe('store-owning components mount cleanly', () => {
	it.each(cases)('%s mounts with inline props', async (_name, Component, makeProps) => {
		// A runaway effect surfaces as a thrown Svelte error, failing this before
		// any assertion runs.
		const { container } = render(Component, { props: makeProps() });
		await settle();
		expect(container).toBeTruthy();
	});
});
