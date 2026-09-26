import { afterEach, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';
import type { TargetRegistry } from '../src/lib/application/renderer/target-registry.js';
import PlacementStructure from './fixtures/PlacementStructure.svelte';

const releases: Array<() => Promise<void>> = [];

afterEach(async () => {
	try {
		for (const release of releases.splice(0).reverse()) await release();
	} finally {
		vi.restoreAllMocks();
	}
});

function setup(
	count = 2,
	onRegistry: (registry: TargetRegistry) => void = () => {}
) {
	const target = document.createElement('div');
	document.body.append(target);
	try {
		const component = mount(PlacementStructure, { target, props: { count, onRegistry } });
		releases.push(async () => {
			try {
				await unmount(component);
			} finally {
				target.remove();
			}
		});
		return target;
	} catch (error) {
		target.remove();
		throw error;
	}
}

it('keeps business rows addressable by first-child, nth-child, and adjacent selectors', async () => {
	const target = setup();
	await tick();

	const list = target.querySelector<HTMLUListElement>('[data-structure-list]');
	expect(list).not.toBeNull();
	const rows = list!.querySelectorAll<HTMLLIElement>(':scope > li');
	expect(rows).toHaveLength(2);
	expect(Array.from(rows, (row) => row.dataset.row)).toEqual(['row1', 'row2']);

	const firstRow = list!.querySelector<HTMLLIElement>(':scope > li[data-row="row1"]');
	expect(firstRow).not.toBeNull();
	const increment = firstRow!.querySelector<HTMLButtonElement>('[data-increment]');
	expect(increment).not.toBeNull();
	increment!.click();
	await tick();
	expect(firstRow!.dataset.count).toBe('2');

	expect.soft(list!.querySelector(':scope > li:first-child')).toBe(firstRow);
	expect.soft(list!.querySelector(':scope > li:nth-child(2)')).toBe(rows.item(1));
	expect.soft(Array.from(list!.querySelectorAll(':scope > li + li'))).toEqual([rows.item(1)]);
});

it('coalesces real mounted placement scans during a 120-row mount and relocation', async () => {
	let scans = 0;
	const target = setup(120, (registry) => {
		const validate = registry.validatePlacements.bind(registry);
		vi.spyOn(registry, 'validatePlacements').mockImplementation(() => {
			scans += 1;
			validate();
		});
	});

	await vi.waitFor(() => expect(scans).toBeGreaterThan(0));
	expect(target.querySelectorAll('[data-location="first"] > li')).toHaveLength(120);
	expect(scans).toBeLessThanOrEqual(2);

	scans = 0;
	const move = target.querySelector<HTMLButtonElement>('[data-move]');
	expect(move).not.toBeNull();
	move!.click();
	await tick();
	await vi.waitFor(() => expect(scans).toBeGreaterThan(0));
	expect(target.querySelectorAll('[data-location="second"] > li')).toHaveLength(120);
	expect(scans).toBeLessThanOrEqual(2);
});
