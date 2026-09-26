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
	 * Compound children (`AlertDialogTitle`, `AlertDialogDescription`) register dynamically
	 * in the browser, but have an initial SSR association limit: the root cannot detect
	 * child component registration before serializing root ARIA attributes in SSR.
	 * The additive `title` and `description` props provide synchronous SSR-safe slots
	 * that emit matching `aria-labelledby` and `aria-describedby` IDs without prepasses.
	 *
	 * Note: A named slot prop (`title` or `description`) and matching manual part
	 * (`AlertDialogTitle` or `AlertDialogDescription`) must not be combined.
	 *
	 * @example
	 * ```svelte
	 * <AlertDialog
	 *   store={scoped}
	 *   {presentation}
	 *   title="Delete this project?"
	 *   description="This cannot be undone."
	 * >
	 *   {#snippet children({ store })}
	 *     <AlertDialogFooter>
	 *       <AlertDialogCancel onclick={() => store?.dispatch({ type: 'cancelled' })}>
	 *         Cancel
	 *       </AlertDialogCancel>
	 *       <AlertDialogAction
	 *         variant="destructive"
	 *         onclick={() => store?.dispatch({ type: 'confirmed' })}
	 *       >
	 *         Delete
	 *       </AlertDialogAction>
	 *     </AlertDialogFooter>
	 *   {/snippet}
	 * </AlertDialog>
	 * ```
	 */
	import { setContext, type Snippet } from 'svelte';

	import Alert from '../Alert.svelte';
	import { assertPresentationView, type PresentationView } from '../../navigation/managed-integration.js';
	import type { PresentationState } from '../../navigation/types.js';
	import type { SpringConfig } from '../../animation/spring-config.js';
	import { ALERT_DIALOG_KEY, type AlertDialogContext } from './context.js';
	import AlertDialogDescription from './AlertDialogDescription.svelte';
	import AlertDialogHeader from './AlertDialogHeader.svelte';
	import AlertDialogTitle from './AlertDialogTitle.svelte';

	interface Props<State, Action> {
		store?: PresentationView<State, Action> | undefined;
		presentation?: PresentationState<any> | undefined;
		onPresentationComplete?: (() => void) | undefined;
		onDismissalComplete?: (() => void) | undefined;
		springConfig?: Partial<SpringConfig> | undefined;
		/**
		 * Dialog title as a string or no-arg snippet.
		 *
		 * Synchronously emits `aria-labelledby` during SSR and renders
		 * `AlertDialogTitle` inside `AlertDialogHeader`. Empty strings are treated
		 * as absent.
		 *
		 * Do not combine with a manual `AlertDialogTitle` child.
		 */
		title?: string | Snippet | undefined;
		/**
		 * Dialog description as a string or no-arg snippet.
		 *
		 * Synchronously emits `aria-describedby` during SSR and renders
		 * `AlertDialogDescription` inside `AlertDialogHeader`. Empty strings are
		 * treated as absent.
		 *
		 * Do not combine with a manual `AlertDialogDescription` child.
		 */
		description?: string | Snippet | undefined;
		/**
		 * A name for the dialog when it renders no `AlertDialogTitle`.
		 *
		 * Ignored when there is one — the title names it. There is deliberately
		 * no `labelled` or `described` prop: the parts register themselves, so
		 * the root never emits an `aria-labelledby` or `aria-describedby`
		 * pointing at an element that was not rendered.
		 */
		ariaLabel?: string | undefined;
		unstyled?: boolean | undefined;
		backdropClass?: string | undefined;
		class?: string | undefined;
		disableClickOutside?: boolean | undefined;
		disableEscapeKey?: boolean | undefined;
		children?:
			| Snippet<[{ visible: boolean; store: PresentationView<State, Action> | undefined }]>
			| undefined;
	}

	let {
		store,
		presentation,
		onPresentationComplete,
		onDismissalComplete,
		springConfig,
		title,
		description,
		ariaLabel,
		unstyled = false,
		backdropClass,
		class: className,
		disableClickOutside = false,
		disableEscapeKey = false,
		children: renderContent
	}: Props<unknown, unknown> = $props();

	const admittedStore = $derived.by(() => {
		if (store !== undefined) {
			assertPresentationView(store);
		}
		return store;
	});

	// Unique per instance, so two dialogs on one page cannot claim each other's
	// title.
	const uid = $props.id();
	const titleId = `${uid}-title`;
	const descriptionId = `${uid}-description`;

	// Set by the parts as they initialise. The root emits each attribute only
	// once something has claimed the id it would point at.
	let titleCount = $state(0);
	let descriptionCount = $state(0);
	const hasTitleProp = $derived(
		typeof title === 'string' ? title.trim() !== '' : Boolean(title)
	);
	const hasDescriptionProp = $derived(
		typeof description === 'string' ? description.trim() !== '' : Boolean(description)
	);
	const hasTitle = $derived(hasTitleProp || titleCount > 0);
	const hasDescription = $derived(hasDescriptionProp || descriptionCount > 0);

	setContext<AlertDialogContext>(ALERT_DIALOG_KEY, {
		titleId,
		descriptionId,
		registerTitle: () => {
			titleCount += 1;
			let live = true;
			return () => {
				if (!live) return;
				live = false;
				titleCount -= 1;
			};
		},
		registerDescription: () => {
			descriptionCount += 1;
			let live = true;
			return () => {
				if (!live) return;
				live = false;
				descriptionCount -= 1;
			};
		}
	});
</script>

<Alert
	store={admittedStore}
	{presentation}
	{onPresentationComplete}
	{onDismissalComplete}
	{springConfig}
	{unstyled}
	{backdropClass}
	class={className}
	{disableClickOutside}
	{disableEscapeKey}
	ariaLabelledby={hasTitle ? titleId : undefined}
	{ariaLabel}
	ariaDescribedby={hasDescription ? descriptionId : undefined}
>
	{#snippet children({ visible, store: scoped })}
		{#if hasTitleProp || hasDescriptionProp}
			<AlertDialogHeader>
				{#if hasTitleProp}
					<AlertDialogTitle>
						{#if typeof title === 'string'}
							{title}
						{:else}
							{@render title?.()}
						{/if}
					</AlertDialogTitle>
				{/if}
				{#if hasDescriptionProp}
					<AlertDialogDescription>
						{#if typeof description === 'string'}
							{description}
						{:else}
							{@render description?.()}
						{/if}
					</AlertDialogDescription>
				{/if}
			</AlertDialogHeader>
		{/if}
		{@render renderContent?.({ visible, store: scoped })}
	{/snippet}
</Alert>
