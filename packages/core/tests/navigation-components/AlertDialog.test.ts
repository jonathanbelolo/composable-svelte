/**
 * The dialog names the question, not itself.
 *
 * `Alert` hardcoded `aria-label="Alert dialog"`, so a screen-reader user heard
 * the same three words whether they were being asked to delete an account or
 * discard a draft. Every assertion about naming here carries a **resolution**
 * arm as well as a presence arm: an `aria-labelledby` pointing at an id that
 * does not render announces nothing at all, and "the attribute is there" cannot
 * tell those two apart.
 */

import { flushSync, mount, unmount, type Component } from 'svelte';
import { describe, it, expect, vi, onTestFinished } from 'vitest';

import AlertDialogTestWrapper from './AlertDialogTestWrapper.svelte';
import { createStore } from '../../src/lib/store.svelte.js';
import { Effect } from '../../src/lib/effect.js';
import { ManagedIntegrationBuilder, optionalSlot, type PresentationView } from '../../src/lib/navigation/managed-integration.js';
import type { PresentationAction } from '../../src/lib/navigation/types.js';
import type { Reducer } from '../../src/lib/types.js';

interface ChildState {
	type: 'test';
	state: { value: string };
}

interface ParentState {
	destination: ChildState | null;
}

type ChildAction = { type: 'noop' };
type ParentAction = { type: 'destination'; action: PresentationAction<ChildAction> };

const destinationSlot = optionalSlot<ParentState, ParentAction>()('destination');
const parentReducer: Reducer<ParentState, ParentAction> = (state) => [state, Effect.none()];
const childReducer: Reducer<ChildState, ChildAction> = (state) => [state, Effect.none()];

function parent(): {
	parentStore: ReturnType<typeof createStore<ParentState, ParentAction>>;
	store: PresentationView<ChildState, ChildAction>;
} {
	const composition = new ManagedIntegrationBuilder<ParentState, ParentAction, undefined>(
		parentReducer
	)
		.with(destinationSlot, childReducer)
		.build();
	const parentStore = createStore<ParentState, ParentAction>({
		initialState: { destination: { type: 'test', state: { value: 'x' } } },
		...composition
	});
	onTestFinished(() => parentStore.destroy());
	const store = composition.bind(parentStore, destinationSlot);
	if (!store) throw new Error('Expected the alert-dialog fixture destination to be present');
	return { parentStore, store };
}

function renderManaged<const Props extends Record<string, unknown>>(
	component: Component<Props>,
	props: Props
) {
	const target = document.createElement('div');
	document.body.append(target);
	const instance = mount(component, { target, props });
	flushSync();
	onTestFinished(async () => {
		await unmount(instance);
		target.remove();
	});
}

describe('AlertDialog naming', () => {
	it('is named by its title, and that title actually exists', async () => {
		renderManaged(AlertDialogTestWrapper, { store: parent().store });

		const dialog = document.querySelector('[role="alertdialog"]');
		expect(dialog).not.toBeNull();

		const labelledBy = dialog!.getAttribute('aria-labelledby');
		expect(labelledBy, 'no aria-labelledby at all').toBeTruthy();

		// The arm that matters. A stale or misspelled id passes the check above
		// and announces nothing.
		const title = document.getElementById(labelledBy!);
		expect(title, 'aria-labelledby points at an element that does not exist').not.toBeNull();
		expect(title!.textContent).toContain('Delete this project?');

		expect(dialog!.getAttribute('aria-label'), 'both would let the label win').toBeNull();
	});

	it('is described by its description, which also exists', async () => {
		renderManaged(AlertDialogTestWrapper, { store: parent().store });

		const dialog = document.querySelector('[role="alertdialog"]')!;
		const describedBy = dialog.getAttribute('aria-describedby');
		expect(describedBy).toBeTruthy();

		const description = document.getElementById(describedBy!);
		expect(description).not.toBeNull();
		expect(description!.textContent).toContain('This cannot be undone.');
	});

	it('falls back to a direct name when there is no title', async () => {
		// The inverse. `aria-labelledby` pointing at an absent title is worse than
		// a generic name, so a consumer without a title opts out and names it.
		renderManaged(AlertDialogTestWrapper, { store: parent().store, unlabelled: true });

		const dialog = document.querySelector('[role="alertdialog"]')!;
		expect(dialog.getAttribute('aria-labelledby')).toBeNull();
		expect(dialog.getAttribute('aria-label')).toBe('Named directly');
	});

	it('does not point aria-describedby at a description that is not there', async () => {
		// The asymmetry this review found. `aria-labelledby` was guarded against
		// naming a missing element; `aria-describedby` was not, so a dialog with a
		// title and no description referenced an id that never rendered.
		renderManaged(AlertDialogTestWrapper, { store: parent().store, twice: true });

		for (const dialog of document.querySelectorAll('[role="alertdialog"]')) {
			const describedBy = dialog.getAttribute('aria-describedby');
			if (describedBy === null) continue;
			expect(
				document.getElementById(describedBy),
				'aria-describedby names an element that does not exist'
			).not.toBeNull();
		}
	});

	it('gives two dialogs on one page distinct title ids', async () => {
		renderManaged(AlertDialogTestWrapper, { store: parent().store, twice: true });

		const ids = [...document.querySelectorAll('[role="alertdialog"]')].map((d) =>
			d.getAttribute('aria-labelledby')
		);
		expect(ids).toHaveLength(2);
		expect(ids[0]).not.toBe(ids[1]);
		// And each resolves to its own heading.
		expect(document.getElementById(ids[0]!)!.textContent).toContain('Delete this project?');
		expect(document.getElementById(ids[1]!)!.textContent).toContain('Second dialog');
	});

	it('renders the title as a heading, at rank 2 by default', async () => {
		renderManaged(AlertDialogTestWrapper, { store: parent().store });

		const heading = document.querySelector('[role="alertdialog"] h2');
		expect(heading, 'the title must be a heading, or it is not in the outline').not.toBeNull();
	});
});

describe('AlertDialog actions', () => {
	it('calls onclick for confirm and cancel, and never dismisses by itself', async () => {
		// `Cancel` deliberately has no default. Dismissing would bypass the parent
		// reducer that owns the dismissal transition.
		const onConfirm = vi.fn();
		const onCancel = vi.fn();
		const { parentStore, store } = parent();
		renderManaged(AlertDialogTestWrapper, { store, onConfirm, onCancel });

		// Native `.click()`, not `userEvent.click`. With no `presentation` prop the
		// dialog renders at opacity 0 — it is mounted and interactive, but
		// Playwright's visibility gate never settles, so the locator spends thirty
		// seconds waiting and then reports a working button as a failure.
		const buttons = [...document.querySelectorAll('[role="alertdialog"] button')];
		const find = (label: string) =>
			buttons.find((b) => b.textContent?.trim() === label) as HTMLButtonElement;

		find('Delete').click();
		expect(onConfirm).toHaveBeenCalledTimes(1);
		expect(parentStore.state.destination, 'the dialog dismissed itself').not.toBeNull();

		find('Cancel').click();
		expect(onCancel).toHaveBeenCalledTimes(1);
		expect(parentStore.state.destination).not.toBeNull();
	});

	it('puts the confirming action last in DOM order', async () => {
		// Which is the order the tab key and a screen reader follow, whatever the
		// visual order the footer's flex direction produces.
		renderManaged(AlertDialogTestWrapper, { store: parent().store });

		const labels = [...document.querySelectorAll('[role="alertdialog"] button')].map((b) =>
			b.textContent?.trim()
		);
		expect(labels).toEqual(['Cancel', 'Delete']);
	});
});
