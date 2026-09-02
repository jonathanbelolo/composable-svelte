<script lang="ts">
	/**
	 * A titled, described confirmation dialog.
	 *
	 * `Alert` is a presentation shell — backdrop, container, spring lifecycle,
	 * click-outside and Escape — with a bare `children` snippet and nothing to
	 * say. Every app needing a confirmation therefore wrote its own heading,
	 * paragraph and two buttons inside it, and the only one in this repository
	 * announced itself to a screen reader as "Alert dialog".
	 *
	 * This composes *over* `Alert` rather than over `AlertPrimitive`, so
	 * `role="alertdialog"`, `aria-modal` and the container styling stay in one
	 * place. Declaring them twice is how two components that should agree drift.
	 *
	 * **No `Trigger` part.** Radix needs one because it owns `open` imperatively;
	 * here presentation is state-driven, so a trigger is an ordinary button
	 * dispatching into a reducer. Shipping one would be shipping a second,
	 * imperative way to open a dialog.
	 *
	 * **No `Content` part.** `Alert` is already the box.
	 *
	 * @example
	 * ```svelte
	 * <AlertDialog store={scoped} {presentation}>
	 *   {#snippet children({ store })}
	 *     <AlertDialogHeader>
	 *       <AlertDialogTitle>Delete this project?</AlertDialogTitle>
	 *       <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
	 *     </AlertDialogHeader>
	 *     <AlertDialogFooter>
	 *       <AlertDialogCancel onclick={() => store?.dispatch({ type: 'cancelled' })}>
	 *         Cancel
	 *       </AlertDialogCancel>
	 *       <AlertDialogAction variant="destructive" onclick={() => store?.dispatch({ type: 'confirmed' })}>
	 *         Delete
	 *       </AlertDialogAction>
	 *     </AlertDialogFooter>
	 *   {/snippet}
	 * </AlertDialog>
	 * ```
	 */
	import { setContext, type Snippet } from 'svelte';

	import Alert from '../Alert.svelte';
	import type { ScopedDestinationStore } from '../../navigation/scope-to-destination.js';
	import type { PresentationState } from '../../navigation/types.js';
	import type { SpringConfig } from '../../animation/spring-config.js';
	import { ALERT_DIALOG_KEY, type AlertDialogContext } from './context.js';

	interface Props<State, Action> {
		store: ScopedDestinationStore<State, Action> | null;
		presentation?: PresentationState<any> | undefined;
		onPresentationComplete?: (() => void) | undefined;
		onDismissalComplete?: (() => void) | undefined;
		springConfig?: Partial<SpringConfig> | undefined;
		/**
		 * Whether an `AlertDialogTitle` is rendered inside.
		 *
		 * `true` points `aria-labelledby` at that title. Pass `false` — with an
		 * `ariaLabel` — when there is no title, because `aria-labelledby`
		 * pointing at an id that never renders makes assistive technology
		 * announce **nothing**, which is worse than a generic name.
		 * @default true
		 */
		labelled?: boolean | undefined;
		/** Used when `labelled` is false. */
		ariaLabel?: string | undefined;
		/** Whether an `AlertDialogDescription` is rendered inside. @default true */
		described?: boolean | undefined;
		unstyled?: boolean | undefined;
		backdropClass?: string | undefined;
		class?: string | undefined;
		disableClickOutside?: boolean | undefined;
		disableEscapeKey?: boolean | undefined;
		children?:
			| Snippet<[{ visible: boolean; store: ScopedDestinationStore<State, Action> | null }]>
			| undefined;
	}

	let {
		store,
		presentation,
		onPresentationComplete,
		onDismissalComplete,
		springConfig,
		labelled = true,
		ariaLabel,
		described = true,
		unstyled = false,
		backdropClass,
		class: className,
		disableClickOutside = false,
		disableEscapeKey = false,
		children
	}: Props<unknown, unknown> = $props();

	// Unique per instance, so two dialogs on one page cannot claim each other's
	// title.
	const uid = $props.id();
	const titleId = `${uid}-title`;
	const descriptionId = `${uid}-description`;

	setContext<AlertDialogContext>(ALERT_DIALOG_KEY, { titleId, descriptionId });
</script>

<Alert
	{store}
	{presentation}
	{onPresentationComplete}
	{onDismissalComplete}
	{springConfig}
	{unstyled}
	{backdropClass}
	class={className}
	{disableClickOutside}
	{disableEscapeKey}
	ariaLabelledby={labelled ? titleId : undefined}
	{ariaLabel}
	ariaDescribedby={described ? descriptionId : undefined}
>
	{#snippet children({ visible, store: scoped })}
		{@render children?.({ visible, store: scoped })}
	{/snippet}
</Alert>
