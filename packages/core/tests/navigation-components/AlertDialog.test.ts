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

import { render } from 'vitest-browser-svelte';
import { describe, it, expect, vi } from 'vitest';

import AlertDialogTestWrapper from './AlertDialogTestWrapper.svelte';
import { createStore } from '../../src/lib/store.svelte.js';
import { Effect } from '../../src/lib/effect.js';

interface ParentState {
	destination: { type: 'test'; state: { value: string } } | null;
}
type ParentAction = { type: 'noop' };

function parent() {
	return createStore<ParentState, ParentAction>({
		initialState: { destination: { type: 'test', state: { value: 'x' } } },
		reducer: (state) => [state, Effect.none()]
	});
}

describe('AlertDialog naming', () => {
	it('is named by its title, and that title actually exists', async () => {
		render(AlertDialogTestWrapper, { parentStore: parent() });

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
		render(AlertDialogTestWrapper, { parentStore: parent() });

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
		render(AlertDialogTestWrapper, { parentStore: parent(), unlabelled: true });

		const dialog = document.querySelector('[role="alertdialog"]')!;
		expect(dialog.getAttribute('aria-labelledby')).toBeNull();
		expect(dialog.getAttribute('aria-label')).toBe('Named directly');
	});

	it('does not point aria-describedby at a description that is not there', async () => {
		// The asymmetry this review found. `aria-labelledby` was guarded against
		// naming a missing element; `aria-describedby` was not, so a dialog with a
		// title and no description referenced an id that never rendered.
		render(AlertDialogTestWrapper, { parentStore: parent(), twice: true });

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
		render(AlertDialogTestWrapper, { parentStore: parent(), twice: true });

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
		render(AlertDialogTestWrapper, { parentStore: parent() });

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
		const parentStore = parent();
		render(AlertDialogTestWrapper, { parentStore, onConfirm, onCancel });

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
		render(AlertDialogTestWrapper, { parentStore: parent() });

		const labels = [...document.querySelectorAll('[role="alertdialog"] button')].map((b) =>
			b.textContent?.trim()
		);
		expect(labels).toEqual(['Cancel', 'Delete']);
	});
});
