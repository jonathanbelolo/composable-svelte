/**
 * `CommandItem` rendered its icon with `<svelte:component this={…} />`, which is
 * deprecated in runes mode. `command.icon` is typed `any` and may be either a
 * string or a component, so the replacement has to keep both paths working.
 * The component had no rendering coverage at all.
 */

import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import CommandItem from '../src/lib/components/command/CommandItem.svelte';
import IconStub from './test-components/IconStub.svelte';
import { createStore } from '../src/lib/store.svelte.js';
import { commandReducer } from '../src/lib/components/command/command.reducer.js';
import { createInitialCommandState } from '../src/lib/components/command/command.types.js';

const settle = () => new Promise((r) => setTimeout(r, 50));
const makeStore = (icon: unknown) =>
	createStore({
		initialState: createInitialCommandState({
			commands: [{ id: 'a', label: 'Alpha', icon } as any]
		}),
		reducer: commandReducer
	});

describe('<command.icon /> replaces <svelte:component>', () => {
	it('renders a component icon', async () => {
		const store = makeStore(IconStub);
		const { container } = render(CommandItem, { store, command: { id: 'a', label: 'Alpha', icon: IconStub } as any, index: 0 });
		await settle();
		expect(container.querySelector('[data-testid="icon-stub"]')).not.toBeNull();
	});

	it('renders a string icon', async () => {
		const store = makeStore('STARICON');
		const { container } = render(CommandItem, { store, command: { id: 'a', label: 'Alpha', icon: 'STARICON' } as any, index: 0 });
		await settle();
		expect(container.textContent).toContain('STARICON');
	});
});
