/**
 * `DestinationRouter` — the last of core's never-executed components, and the
 * only one of the thirty-nine that is a *navigation API* rather than a widget.
 *
 * It is exported from the package root and documented in the navigation DSL
 * spec: hand it a store, the name of the destination field, and a map from
 * destination type to component-and-presentation, and it renders the right one.
 * Nothing had ever constructed it, so nothing checked the thing it exists to do
 * — that exactly the route matching the current destination renders, and the
 * others do not.
 *
 * The failure that matters is not a crash. It is rendering *every* route at
 * once, or none: both look like a styling problem from the outside.
 */

import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createStore } from '@composable-svelte/core';
import { Effect } from '@composable-svelte/core';
import DestinationRouter from '../src/lib/navigation-components/DestinationRouter.svelte';
import RouterChild from './test-components/RouterChild.svelte';

// Long enough for the presentation animation Modal and Sheet run on mount:
// content is rendered behind a `visible` gate that the lifecycle opens.
const settle = () => new Promise((resolve) => setTimeout(resolve, 500));

type Destination = { type: 'edit'; state: { id: string } } | { type: 'create'; state: object };
interface AppState {
	destination: Destination | null;
}
type AppAction = { type: 'dismiss' } | { type: 'destination'; action: unknown };

const appStore = (destination: Destination | null) =>
	createStore<AppState, AppAction>({
		initialState: { destination },
		reducer: (state, action) => {
			if (action.type === 'dismiss') return [{ ...state, destination: null }, Effect.none()];
			return [state, Effect.none()];
		},
		dependencies: {}
	});

/**
 * `presentationProps` carries the `presentation` lifecycle state through to
 * Modal and Sheet. Without it they never leave `idle`, so their content is
 * never made visible — which is the whole point of the dual-field pattern in
 * the animation spec, and the reason a router test cannot just hand over a
 * destination and expect markup.
 */
const presented = { status: 'presented' as const, content: null };

const routes = {
	edit: {
		component: RouterChild as never,
		presentation: 'modal' as const,
		presentationProps: { presentation: presented },
		componentProps: { label: 'edit' }
	},
	create: {
		component: RouterChild as never,
		presentation: 'sheet' as const,
		presentationProps: { presentation: presented },
		componentProps: { label: 'create' }
	}
};

/**
 * Modal, Sheet and Drawer render into `document.body`, not into the component's
 * own container — so the router's container holds only comment markers and
 * every assertion has to look at the document. Finding that out is most of what
 * writing this file cost, and it is exactly the sort of thing that stays
 * unknown while nothing renders the component.
 */
async function renderRouter(destination: Destination | null) {
	const store = appStore(destination);
	render(DestinationRouter as never, { store, field: 'destination', routes } as never);
	await settle();
	return { store, container: document.body };
}

describe('it renders the route matching the destination', () => {
	it('renders the edit route when the destination is edit', async () => {
		const { container } = await renderRouter({ type: 'edit', state: { id: '1' } });
		expect(container.querySelector('[data-routed="edit"]'), 'the edit route did not render').not.toBeNull();
	});

	it('renders the create route when the destination is create', async () => {
		const { container } = await renderRouter({ type: 'create', state: {} });
		expect(container.querySelector('[data-routed="create"]'), 'the create route did not render').not.toBeNull();
	});

	it('renders only the matching route, not every one', async () => {
		// The defect that would look like a styling problem: both destinations
		// present at once, one of them stacked invisibly over the other.
		const { container } = await renderRouter({ type: 'edit', state: { id: '1' } });
		expect(container.querySelector('[data-routed="create"]')).toBeNull();
	});

	it('renders no route when there is no destination', async () => {
		const { container } = await renderRouter(null);
		expect(container.querySelector('[data-routed]')).toBeNull();
	});
});

describe('it follows the store', () => {
	it('swaps the rendered route when the destination changes', async () => {
		const { store, container } = await renderRouter({ type: 'edit', state: { id: '1' } });
		expect(container.querySelector('[data-routed="edit"]')).not.toBeNull();

		store.dispatch({ type: 'dismiss' });
		await settle();

		expect(container.querySelector('[data-routed="edit"]')).toBeNull();
	});
});
