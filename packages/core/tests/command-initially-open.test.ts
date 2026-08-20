/**
 * `<Command open={true} />` rendered nothing.
 *
 * The mechanism is not the one the hardening register recorded ("two effects
 * fight; one writes `open = $store.isOpen` and clobbers the incoming prop").
 * That second effect writes `true` over `true` and is inert. The real chain is
 * an initial state that contradicts itself:
 *
 *   - `createInitialCommandState` honours `isOpen` but hardcoded
 *     `presentation: { status: 'idle' }`.
 *   - The markup keys off `visible = $store.presentation.status !== 'idle'`
 *     (`Command.svelte:179`), not off `isOpen`.
 *   - The prop-sync effect is guarded on `$store.isOpen !== open`, which is
 *     already *satisfied* at mount — so `opened` is never dispatched and
 *     nothing ever moves `presentation` off `idle`.
 *
 * State said open, presentation said idle, and the markup followed
 * presentation. `component-mount.test.ts:48` has mounted this exact prop
 * combination all along and only ever asserted that mounting did not throw.
 *
 * Fixed in `command.types.ts` rather than in the component, so that anyone
 * constructing the state directly gets a consistent one too. The trade-off is
 * that an initially-open palette does not animate in, which is right — there is
 * no "before" for it to animate from.
 */

import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Command from '../src/lib/components/command/Command.svelte';
import { createInitialCommandState } from '../src/lib/components/command/command.types.js';

const settle = () => new Promise((r) => setTimeout(r, 150));

describe('createInitialCommandState is internally consistent', () => {
	it('gives an initially-open palette a non-idle presentation', () => {
		const state = createInitialCommandState({ isOpen: true });

		expect(state.isOpen).toBe(true);
		// `idle` here is what made `visible` false while `isOpen` was true.
		expect(state.presentation.status).not.toBe('idle');
		// The exact shape the reducer settles on after an open animation
		// completes (`command.reducer.ts:309-317`) — so a palette that opens via
		// the prop and one that opens via `opened` end in the same state.
		expect(state.presentation).toEqual({ status: 'presented', content: true });
	});

	it('leaves a closed palette idle', () => {
		expect(createInitialCommandState({ isOpen: false }).presentation.status).toBe('idle');
		expect(createInitialCommandState().presentation.status).toBe('idle');
	});
});

describe('<Command open={true} />', () => {
	it('renders the dialog at mount', async () => {
		const { container } = render(Command, {
			props: { open: true, commands: [{ id: 'a', label: 'Alpha' }] }
		});
		await settle();

		// Query the document, not `container`: the backdrop is `position: fixed`
		// but still rendered inside the component's subtree, so either works —
		// container is the tighter assertion and is used deliberately.
		expect(
			container.querySelector('[role="dialog"][aria-label="Command palette"]'),
			'the palette mounted open but rendered nothing'
		).not.toBeNull();
	});

	it('renders nothing when mounted closed', async () => {
		const { container } = render(Command, {
			props: { open: false, commands: [{ id: 'a', label: 'Alpha' }] }
		});
		await settle();

		// The other half. Without this, a `visible` that is simply always true
		// would pass the test above.
		expect(container.querySelector('[role="dialog"]')).toBeNull();
	});
});
