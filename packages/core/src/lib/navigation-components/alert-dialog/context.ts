/**
 * What an `AlertDialog` shares with its parts.
 *
 * Two ids, and two registrations.
 *
 * The registrations exist because the root has to decide whether to emit
 * `aria-labelledby` and `aria-describedby`, and **it cannot know from its own
 * props whether the elements they name were rendered.** An
 * `aria-labelledby` pointing at an id that never appears makes assistive
 * technology announce nothing at all — worse than a generic name — and an
 * `aria-describedby` doing the same drops the description silently.
 *
 * That was first modelled as `labelled` / `described` booleans on the root, and
 * the review found the obvious flaw: the caller has to keep them in sync with
 * their own markup by hand, and the default was wrong for the very common case
 * of a dialog with a title and no description. Letting the parts announce
 * themselves removes the question.
 */
export const ALERT_DIALOG_KEY = Symbol('composable-svelte.alert-dialog');

export interface AlertDialogContext {
	readonly titleId: string;
	readonly descriptionId: string;
	/** Called by `AlertDialogTitle` as it initialises. */
	registerTitle(): void;
	/** Called by `AlertDialogDescription` as it initialises. */
	registerDescription(): void;
}
