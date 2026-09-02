/**
 * Ids shared between an `AlertDialog` and its parts.
 *
 * The parts render the title and description; the root has to point
 * `aria-labelledby` and `aria-describedby` at them. Passing ids down through
 * context rather than props is what lets a consumer write the parts in any
 * order, or wrap them, without the naming silently breaking.
 */
export const ALERT_DIALOG_KEY = Symbol('composable-svelte.alert-dialog');

export interface AlertDialogContext {
	readonly titleId: string;
	readonly descriptionId: string;
}
