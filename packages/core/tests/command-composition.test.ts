/**
 * `<Command>`'s children drove a different store from the one it configured.
 *
 * `Command.svelte` rendered `{@render children()}` with no arguments, provided
 * no context, and `CommandInput`/`CommandList`/`CommandItem` each *required* a
 * `store` prop — so a consumer had to build their own, and `commands`,
 * `filterFunction`, `maxResults`, `caseSensitive` and `groups` all fed the
 * internal store that nothing rendered. Every one of them was decorative.
 *
 * `CommandList` compounded it: it rendered only `{@render children()}` and
 * never iterated `filteredCommands`, so there was nowhere for any of that
 * configuration to become visible even in principle.
 *
 * Assertions are on the rendered options, never on `filteredCommands` — a store
 * assertion passes with every one of these defects present, which is exactly
 * how they survived.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import CommandCompositionTest from './test-components/CommandCompositionTest.svelte';
import type { CommandItem } from '../src/lib/components/command/command.types.js';

const settle = (ms = 250) => new Promise((r) => setTimeout(r, ms));

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

const five: CommandItem[] = [
	{ id: 'a', label: 'Alpha' },
	{ id: 'b', label: 'Bravo' },
	{ id: 'c', label: 'Charlie' },
	{ id: 'd', label: 'Delta' },
	{ id: 'e', label: 'Echo' }
];

const options = () => [...document.querySelectorAll('[role="option"]')];
const headings = () =>
	[...document.querySelectorAll('.command-group-heading')].map((h) => h.textContent?.trim());

async function type(text: string) {
	const input = document.querySelector('input') as HTMLInputElement;
	expect(input, 'no command input rendered').not.toBeNull();
	input.value = text;
	input.dispatchEvent(new Event('input', { bubbles: true }));
	await settle();
}

describe('the children share the palette store', () => {
	it('renders the configured commands', async () => {
		render(CommandCompositionTest, { props: { commands: five } });
		await settle(400);

		expect(options(), 'CommandList rendered nothing from state').toHaveLength(5);
	});

	it('filters as you type', async () => {
		render(CommandCompositionTest, { props: { commands: five } });
		await settle(400);

		await type('al');

		expect(
			options().map((o) => o.textContent?.trim()),
			'typing did not reach the store the list renders from'
		).toEqual(['Alpha']);
	});

	it('uses a custom filterFunction', async () => {
		const filterFunction = vi.fn((cmds: CommandItem[]) => cmds.slice(0, 1));
		render(CommandCompositionTest, { props: { commands: five, filterFunction } });
		await settle(400);

		await type('x');

		expect(filterFunction, 'the custom filter never ran').toHaveBeenCalled();
		expect(options()).toHaveLength(1);
	});
});

describe('maxResults', () => {
	it('bounds the list at mount and after every reset', async () => {
		// Applied by `queryChanged`/`commandsUpdated` only; six other cases and
		// the state factory reset `filteredCommands` to the unbounded list.
		render(CommandCompositionTest, { props: { commands: five, maxResults: 2 } });
		await settle(400);
		expect(options(), 'unbounded at mount').toHaveLength(2);

		await type('a');
		expect(options().length, 'unbounded after typing').toBeLessThanOrEqual(2);

		await type('');
		expect(options(), 'unbounded after the query was cleared').toHaveLength(2);
	});
});

describe('caseSensitive', () => {
	it('is honoured when set', async () => {
		render(CommandCompositionTest, {
			props: { commands: [{ id: 'x', label: 'ABC' }], caseSensitive: true }
		});
		await settle(400);

		await type('abc');
		expect(options(), 'caseSensitive was ignored — the filter lowercases always').toHaveLength(0);

		await type('ABC');
		expect(options()).toHaveLength(1);
	});

	it('defaults to insensitive', async () => {
		// The other half, so a fix cannot pass by always being case-sensitive.
		render(CommandCompositionTest, { props: { commands: [{ id: 'x', label: 'ABC' }] } });
		await settle(400);

		await type('abc');
		expect(options()).toHaveLength(1);
	});
});

describe('groups', () => {
	it('renders headings in the declared order, ungrouped first', async () => {
		render(CommandCompositionTest, {
			props: {
				commands: [
					{ id: 'loose', label: 'Loose' },
					{ id: 'e1', label: 'Edit one', group: 'edit' },
					{ id: 'f1', label: 'File one', group: 'file' }
				],
				groups: [
					{ id: 'file', label: 'Files' },
					{ id: 'edit', label: 'Edit' }
				]
			}
		});
		await settle(400);

		expect(headings(), 'groups were never rendered').toEqual(['Files', 'Edit']);
		expect(
			options()[0]!.textContent,
			'the ungrouped command should come first, with no heading'
		).toContain('Loose');
	});

	it('keeps keyboard order and visual order in agreement', async () => {
		// The one that matters most. `nextCommand`/`executeCommand` index into
		// `filteredCommands`, so sorting in the VIEW instead of the reducer makes
		// the highlighted item and the executed item disagree — a defect no
		// per-feature test would catch.
		const onCommandExecute = vi.fn();
		render(CommandCompositionTest, {
			props: {
				commands: [
					{ id: 'e1', label: 'Edit one', group: 'edit' },
					{ id: 'f1', label: 'File one', group: 'file' },
					{ id: 'f2', label: 'File two', group: 'file' }
				],
				groups: [
					{ id: 'file', label: 'Files' },
					{ id: 'edit', label: 'Edit' }
				]
			}
		});
		await settle(400);

		const visible = options().map((o) => o.textContent?.trim());
		expect(visible, 'precondition: grouped order').toEqual(['File one', 'File two', 'Edit one']);

		const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
		dialog.focus();
		for (let i = 0; i < 2; i += 1) {
			dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
			await settle(60);
		}

		const selected = document.querySelector('[role="option"][aria-selected="true"]');
		expect(
			selected?.textContent?.trim(),
			'the keyboard highlight disagrees with what the user sees'
		).toBe(visible[2]);
	});
});

describe('grouping cannot produce a duplicate key', () => {
	/**
	 * `CommandList` builds its sections by run-length grouping over
	 * `filteredCommands` and keyed them by label. Any interleaving of the same
	 * group therefore produced a duplicate key, which Svelte throws on
	 * (`each_key_duplicate`) — and the whole palette rendered EMPTY.
	 *
	 * Two independent triggers, both ordinary usage:
	 *  - `groups` omitted entirely. `applyFilter` only bucketed when `groups`
	 *    was non-empty, so interleaved membership survived untouched.
	 *  - an undeclared group when `groups` IS given: every unknown group got the
	 *    same rank (`order.size`), so the tiebreak preserved their interleaving.
	 *    Measured directly: `xx, yy, xx` came back as `xx, yy, xx`.
	 */
	it('renders interleaved groups with no `groups` prop', async () => {
		render(CommandCompositionTest, {
			props: {
				commands: [
					{ id: '1', label: 'One', group: 'alpha' },
					{ id: '2', label: 'Two', group: 'beta' },
					{ id: '3', label: 'Three', group: 'alpha' }
				]
			}
		});
		await settle(400);

		expect(options(), 'the palette rendered nothing — duplicate each key').toHaveLength(3);
		expect(headings()).toEqual(['alpha', 'beta']);
	});

	it('renders interleaved undeclared groups alongside declared ones', async () => {
		render(CommandCompositionTest, {
			props: {
				commands: [
					{ id: '1', label: 'One', group: 'xx' },
					{ id: '2', label: 'Two', group: 'yy' },
					{ id: '3', label: 'Three', group: 'xx' }
				],
				groups: [{ id: 'known', label: 'Known' }]
			}
		});
		await settle(400);

		expect(options(), 'the palette rendered nothing — duplicate each key').toHaveLength(3);
	});

	it('interleaves ungrouped commands without colliding', async () => {
		render(CommandCompositionTest, {
			props: {
				commands: [
					{ id: '1', label: 'Loose one' },
					{ id: '2', label: 'Filed', group: 'file' },
					{ id: '3', label: 'Loose two' }
				]
			}
		});
		await settle(400);

		expect(options()).toHaveLength(3);
	});
});

describe('the initial list uses the same filter as every later one', () => {
	it('applies a custom filterFunction before the user types', async () => {
		// `createInitialCommandState` called `applyFilter` with no deps, so the
		// DEFAULT filter produced the first list. The mount effect then dispatched
		// `commandsUpdated` with the same array references, so `sameCommands` and
		// `sameGroups` both short-circuited and the reducer returned the identical
		// state — the consumer's filter never ran until the first keystroke.
		const filterFunction = vi.fn((cmds: CommandItem[]) => cmds.slice(0, 1));
		render(CommandCompositionTest, { props: { commands: five, filterFunction } });
		await settle(400);

		expect(
			options(),
			'the consumer filter was skipped for the initial list'
		).toHaveLength(1);
		expect(filterFunction).toHaveBeenCalled();
	});
});
