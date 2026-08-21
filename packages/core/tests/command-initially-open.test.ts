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

const settle = (ms = 150) => new Promise((r) => setTimeout(r, ms));

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

describe('<Command /> can be dismissed', () => {
	// These exist because the original two render tests asserted only that the
	// dialog was PRESENT at mount, and a palette that renders but can never be
	// closed passes that. An adversarial review found exactly that hole.
	//
	// The dismissal loop pre-dated the initial-state fix — verified by reverting
	// it, after which a prop-opened palette fails these identically. What the
	// initial-state fix changed was the consequence: an initially-open palette
	// went from rendering nothing to rendering a modal with no way out.
	//
	// Cause: two effects owned one bidirectional binding. After
	// `dismissalCompleted` set `isOpen: false`, the prop-sync effect — declared
	// first — ran before the sync-back effect had written `open = false`, saw
	// `$store.isOpen (false) !== open (true)`, and re-dispatched `opened`.
	// Two independent effects cannot tell "the prop changed" from "the store
	// changed"; one effect with a non-reactive record of the last agreed value
	// can.

	const dialogVisible = () =>
		document.querySelector('[role="dialog"][aria-label="Command palette"]') !== null;

	it('closes on Escape', async () => {
		const { container } = render(Command, {
			props: { open: true, commands: [{ id: 'a', label: 'Alpha' }] }
		});
		await settle();
		expect(dialogVisible(), 'precondition: it opened').toBe(true);

		const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
		dialog.focus();
		dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await settle(800);

		expect(dialogVisible(), 'still visible long after Escape').toBe(false);
	});

	it('closes when the open prop goes false', async () => {
		const { rerender } = render(Command, {
			props: { open: true, commands: [{ id: 'a', label: 'Alpha' }] }
		});
		await settle();
		expect(dialogVisible(), 'precondition: it opened').toBe(true);

		await rerender({ open: false });
		await settle(800);

		expect(dialogVisible(), 'still visible long after open={false}').toBe(false);
	});

	it('reopens after being closed', async () => {
		// The other direction, so a fix that simply nails the palette shut fails.
		const { rerender } = render(Command, {
			props: { open: true, commands: [{ id: 'a', label: 'Alpha' }] }
		});
		await settle();

		await rerender({ open: false });
		await settle(800);
		expect(dialogVisible()).toBe(false);

		await rerender({ open: true });
		await settle(800);
		expect(dialogVisible(), 'could not reopen').toBe(true);
	});

	it('animates out, like a palette opened by a prop change', async () => {
		// An adversarial review found the initially-open palette skipped its
		// dismissal animation. `lastAnimatedContent` was only ever set in the
		// `presenting` branch of the animation effect, so a palette that starts
		// at `presented` left it null, and the `dismissing` branch's
		// `lastAnimatedContent === currentContent` guard never matched.
		//
		// Asserted against a control rather than in absolute terms: what matters
		// is parity with the path that already worked.
		const runningDuringDismissal = async (initiallyOpen: boolean) => {
			const r = render(Command, {
				props: { open: initiallyOpen, commands: [{ id: 'a', label: 'Alpha' }] }
			});
			if (!initiallyOpen) {
				await r.rerender({ open: true });
				await settle(600);
			}
			await settle(400);
			expect(dialogVisible(), 'precondition: open').toBe(true);

			await r.rerender({ open: false });
			await settle(60);
			const count = document.getAnimations().length;
			await settle(800);
			return count;
		};

		const control = await runningDuringDismissal(false);
		expect(control, 'control: a prop-opened palette should animate out').toBeGreaterThan(0);

		const initiallyOpen = await runningDuringDismissal(true);
		expect(
			initiallyOpen,
			'an initially-open palette ran no dismissal animation, unlike the control'
		).toBeGreaterThan(0);
	});
});
