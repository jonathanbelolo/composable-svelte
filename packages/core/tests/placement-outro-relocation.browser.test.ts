import { afterEach, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';
import type { ApplicationInstance } from '../src/lib/application/index.js';
import type { TargetRegistry } from '../src/lib/application/renderer/target-registry.js';
import type { Action, Root } from './fixtures/FeatureViewsModel.js';
import PlacementOutroBoundary from './fixtures/PlacementOutroBoundary.svelte';

type Location = 'first' | 'second';
type Observation = { outgoing: Location[]; lists: number };

const releases: Array<() => Promise<void>> = [];

afterEach(async () => {
	try {
		for (const release of releases.splice(0).reverse()) await release();
	} finally {
		vi.restoreAllMocks();
	}
});

function setup() {
	const target = document.createElement('div');
	document.body.append(target);
	const outgoing = new Set<Location>();
	const events: string[] = [];
	const observations: Observation[] = [];
	const failures: unknown[] = [];
	const boundaryErrors: unknown[] = [];
	const diagnostics: string[] = [];
	let app!: ApplicationInstance<Root, Action>;
	let registry!: TargetRegistry;
	// Root failure ownership reports through console.error; collect it instead of printing it.
	vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
		diagnostics.push(args.map(String).join(' '));
	});
	try {
		const component = mount(PlacementOutroBoundary, {
			target,
			props: {
				onApp: (value) => (app = value),
				onRegistry: (value) => {
					registry = value;
					const validate = value.validatePlacements.bind(value);
					vi.spyOn(value, 'validatePlacements').mockImplementation(() => {
						observations.push({
							outgoing: [...outgoing],
							lists: target.querySelectorAll('[data-structure-list]').length
						});
						validate();
					});
					const fail = value.fail.bind(value);
					vi.spyOn(value, 'fail').mockImplementation((error) => {
						failures.push(error);
						fail(error);
					});
				},
				onTransition: (location, phase) => {
					events.push(`${location}:${phase}`);
					if (phase === 'outrostart') outgoing.add(location);
					else outgoing.delete(location);
				},
				onBoundaryError: (error) => boundaryErrors.push(error)
			}
		});
		releases.push(async () => {
			try {
				await unmount(component);
			} finally {
				target.remove();
			}
		});
		return {
			target,
			events,
			observations,
			failures,
			boundaryErrors,
			diagnostics,
			get app() {
				return app;
			},
			get registry() {
				return registry;
			}
		};
	} catch (error) {
		target.remove();
		throw error;
	}
}

function expectLive(a: ReturnType<typeof setup>) {
	expect(a.failures.map(String)).toEqual([]);
	expect(a.diagnostics).toEqual([]);
	expect(a.boundaryErrors.map(String)).toEqual([]);
	expect(a.target.querySelector('[data-error]')).toBeNull();
	expect(a.registry.isAttached).toBe(true);
}

function rows(target: HTMLElement, location: Location) {
	return Array.from(
		target.querySelectorAll<HTMLLIElement>(`[data-location="${location}"] > li`),
		(row) => row.dataset.row
	);
}

async function mounted() {
	const a = setup();
	await tick();
	await vi.waitFor(() => expect(a.observations.length).toBeGreaterThan(0));
	expect(rows(a.target, 'first')).toEqual(['row1', 'row2']);
	expectLive(a);
	a.observations.length = 0;
	return a;
}

async function move(target: HTMLElement) {
	const button = target.querySelector<HTMLButtonElement>('[data-move]');
	expect(button).not.toBeNull();
	button!.click();
	await tick();
}

async function increment(target: HTMLElement, location: Location, name: string) {
	const row = target.querySelector<HTMLLIElement>(
		`[data-location="${location}"] > li[data-row="${name}"]`
	);
	expect(row).not.toBeNull();
	const button = row!.querySelector<HTMLButtonElement>('[data-increment]');
	expect(button).not.toBeNull();
	button!.click();
	await tick();
	return row!.dataset.count;
}

async function settle(target: HTMLElement) {
	await vi.waitFor(
		async () => {
			for (const list of target.querySelectorAll<HTMLElement>('[data-structure-list]'))
				for (const animation of list.getAnimations()) animation.finish();
			await tick();
			expect(target.querySelectorAll('[data-structure-list]')).toHaveLength(1);
		},
		{ timeout: 5000 }
	);
}

it('keeps a relocated outlet live while a Svelte outro still holds the outgoing branch', async () => {
	const a = await mounted();

	await move(a.target);
	// Control: a framework scan ran while pause_effect still held the outgoing outlet.
	await vi.waitFor(() =>
		expect(a.observations).toContainEqual({ outgoing: ['first'], lists: 2 })
	);
	await tick();

	expectLive(a);
	expect(rows(a.target, 'second')).toEqual(['row1', 'row2']);
	expect(await increment(a.target, 'second', 'row1')).toBe('2');

	await settle(a.target);
	expect(a.events).toContain('first:outroend');
	expect(a.target.querySelector('[data-location="first"]')).toBeNull();
	expect(rows(a.target, 'second')).toEqual(['row1', 'row2']);
	expect(await increment(a.target, 'second', 'row1')).toBe('3');
	expect(a.app.store.state.rows[0]?.state.count).toBe(3);
	expectLive(a);
});

it('keeps the resumed outlet live when the relocation reverses before the outro completes', async () => {
	const a = await mounted();
	const original = a.target.querySelector('[data-location="first"]');

	await move(a.target);
	await vi.waitFor(() =>
		expect(a.observations).toContainEqual({ outgoing: ['first'], lists: 2 })
	);
	await tick();
	expectLive(a);

	a.events.length = 0;
	await move(a.target);
	// Control: Svelte resumed the first branch and paused the second; no outlet was created or destroyed.
	await vi.waitFor(() =>
		expect(a.events).toEqual(expect.arrayContaining(['first:introstart', 'second:outrostart']))
	);
	expectLive(a);

	await settle(a.target);
	expect(a.target.querySelector('[data-location="first"]')).toBe(original);
	expect(a.target.querySelector('[data-location="second"]')).toBeNull();
	expect(rows(a.target, 'first')).toEqual(['row1', 'row2']);
	expect(await increment(a.target, 'first', 'row1')).toBe('2');
	expect(a.app.store.state.rows[0]?.state.count).toBe(2);
	expectLive(a);
});

it('coalesces requests throughout a contested outro handshake into one validation scan',async()=>{
 const a=await mounted();await tick();
 const before=a.observations.length;
 a.target.querySelector<HTMLButtonElement>('[data-move]')!.click();
 for(let i=0;i<10;i++)a.registry.requestPlacementValidation();
 await tick();
 for(let i=0;i<10;i++)a.registry.requestPlacementValidation();
 await tick();await tick();
 expect(a.observations.length-before).toBe(1);
 expectLive(a);
});
