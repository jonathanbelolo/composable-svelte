<script lang="ts">
	import { getContext } from 'svelte';
	import type { Snippet } from 'svelte';

	import { cn } from '../../utils.js';
	import { ALERT_DIALOG_KEY, type AlertDialogContext } from './context.js';

	interface Props {
		/**
		 * Heading rank.
		 *
		 * A dialog is not always the top of its document's outline, and a rank
		 * that skips a level makes a screen-reader outline unusable.
		 * @default 2
		 */
		headingLevel?: 1 | 2 | 3 | 4 | 5 | 6 | undefined;
		class?: string | undefined;
		children?: Snippet | undefined;
	}

	let { headingLevel = 2, class: className, children }: Props = $props();

	// The root generated this id and pointed `aria-labelledby` at it. This is the
	// element that has to carry it, or the dialog names something that does not
	// exist and assistive technology announces nothing at all.
	const ctx = getContext<AlertDialogContext | undefined>(ALERT_DIALOG_KEY);
</script>

<svelte:element
	this={`h${headingLevel}`}
	id={ctx?.titleId}
	class={cn('text-lg font-semibold', className)}
>
	{@render children?.()}
</svelte:element>
