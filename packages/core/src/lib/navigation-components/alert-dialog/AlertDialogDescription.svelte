<script lang="ts">
	import { getContext, onDestroy } from 'svelte';
	import type { Snippet } from 'svelte';

	import { cn } from '../../utils.js';
	import { ALERT_DIALOG_KEY, type AlertDialogContext } from './context.js';

	interface Props {
		class?: string | undefined;
		children?: Snippet | undefined;
	}

	let { class: className, children }: Props = $props();

	const ctx = getContext<AlertDialogContext | undefined>(ALERT_DIALOG_KEY);
	const unregister = ctx?.registerDescription();
	if (unregister) onDestroy(unregister);
</script>

<p id={ctx?.descriptionId} class={cn('text-sm text-muted-foreground', className)}>
	{@render children?.()}
</p>
