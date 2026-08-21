<script lang="ts">
	import { tick } from 'svelte';
	import { animateAccordionExpand, animateAccordionCollapse } from '../../../animation/animate.js';
	import { getCollapsibleContext } from './Collapsible.svelte';
	import { cn } from '../../../utils.js';

	/**
	 * CollapsibleContent component - Collapsible content section.
	 *
	 * Uses centralized animation system for smooth expand/collapse animations.
	 * Content is mounted while expanded *and* for the duration of the collapse,
	 * then unmounted — see `renderContent` below.
	 *
	 * @example
	 * ```svelte
	 * <CollapsibleContent>
	 *   This is the content that will expand and collapse.
	 * </CollapsibleContent>
	 * ```
	 */

	interface CollapsibleContentProps {
		/**
		 * Additional CSS classes.
		 */
		class?: string;

		/**
		 * Children content.
		 */
		children?: import('svelte').Snippet;
	}

	let {
		class: className,
		children
	}: CollapsibleContentProps = $props();

	const context = getCollapsibleContext();
	const { store, contentId, triggerId } = context;

	let contentElement: HTMLDivElement | null = $state(null);
	// Not $state: the effect below reads and writes this. A reactive guard
	// re-triggers the effect it lives in (effect_update_depth_exceeded).
	let previousExpandedState = $store.isExpanded;

	// What the markup renders, deliberately lagging `isExpanded` on the way out.
	//
	// The `{#if}` used to test `$store.isExpanded` directly, from *inside* the
	// element this component animates. Svelte empties the element during the DOM
	// update, and the `$effect` runs afterwards — so `animateAccordionCollapse`
	// measured `scrollHeight` on an empty box, got ~0, and animated 0 → 0. The
	// content just vanished. Measured before the fix: five consecutive height
	// samples of exactly 0.
	//
	// Accordion never had this because its content is always rendered; expanding
	// was never broken here either, since the content is already mounted by the
	// time the effect runs.
	//
	// This is invariant 5 in guides/ANIMATION-GUIDELINES.md.
	let renderContent = $state($store.isExpanded);

	// Animate expand/collapse when isExpanded changes
	$effect(() => {
		const isExpanded = $store.isExpanded;

		// Skip animation on initial render
		if (previousExpandedState === isExpanded) {
			return;
		}

		previousExpandedState = isExpanded;

		if (isExpanded) {
			// Mount first, measure second. Both helpers size themselves from
			// `scrollHeight`, so the content has to be in the DOM before either
			// runs — `tick()` is what guarantees that.
			renderContent = true;
			tick().then(() => {
				if (contentElement && $store.isExpanded) animateAccordionExpand(contentElement);
			});
			return;
		}

		if (!contentElement) return;

		// Unmount only once the collapse has finished, so the measurement it makes
		// has something to measure.
		animateAccordionCollapse(contentElement).then(() => {
			if (!$store.isExpanded) renderContent = false;
		});
	});

	// The resting appearance, captured once and never reactive.
	//
	// This element has exactly one author for height, opacity and overflow after
	// mount: Motion One. It used to have three. A reactive style attribute
	// compiles to `set_style`, which assigns `cssText` — a total wipe of every
	// inline style Motion had written — and it fires exactly on an expand or
	// collapse, i.e. while an animation is starting or being interrupted. The
	// Tailwind height/overflow/opacity utilities were a third author, and an
	// unreliable one: `cn` is `twMerge`, so a consumer className setting its own
	// height deletes them outright.
	//
	// They cannot simply be dropped, either: `$effect` does not run on the server,
	// so without a declarative resting value a collapsed section is sent at full
	// height anywhere Tailwind is not compiled. Bound per-property below, which
	// Svelte diffs rather than rebuilding — and since this never changes, it is
	// written once and then left to Motion One.
	const initialContentStyle = $store.isExpanded
		? { height: 'auto', overflow: undefined, opacity: undefined }
		: { height: '0px', overflow: 'hidden', opacity: '0' };
</script>

<div
	bind:this={contentElement}
	id={contentId}
	role="region"
	aria-labelledby={triggerId}
	class={cn('text-sm', className)}
	style:height={initialContentStyle.height}
	style:overflow={initialContentStyle.overflow}
	style:opacity={initialContentStyle.opacity}
>
	{#if renderContent}
		<div class="pb-4 pt-0">
			{@render children?.()}
		</div>
	{/if}
</div>
