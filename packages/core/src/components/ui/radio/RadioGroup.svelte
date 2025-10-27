<script lang="ts">
	import { setContext } from 'svelte';
	import { cn } from '../../../lib/utils.js';

	/**
	 * RadioGroup component - Container for radio buttons.
	 * Manages selection state for a group of radio options.
	 *
	 * @example
	 * ```svelte
	 * <RadioGroup bind:value={selectedValue}>
	 *   <Radio value="option1">Option 1</Radio>
	 *   <Radio value="option2">Option 2</Radio>
	 *   <Radio value="option3">Option 3</Radio>
	 * </RadioGroup>
	 * ```
	 */

	interface Props {
		/**
		 * The currently selected value
		 */
		value?: string | null;
		/**
		 * The name attribute for the radio group
		 */
		name?: string;
		/**
		 * Optional class name
		 */
		class?: string;
		/**
		 * Radio options (children)
		 */
		children?: import('svelte').Snippet;
	}

	let {
		value = $bindable(null),
		name = `radio-group-${Math.random().toString(36).substr(2, 9)}`,
		class: className,
		children
	}: Props = $props();

	// Provide context for child Radio components
	const groupValue = $state({ current: value });
	setContext('radioGroupValue', groupValue);
	setContext('radioGroupName', name);

	// Sync bindable value with internal state
	$effect(() => {
		groupValue.current = value;
	});
</script>

<div
	class={cn('grid gap-2', className)}
	role="radiogroup"
	onchange={(e) => {
		const target = e.target as HTMLInputElement;
		if (target.type === 'radio') {
			value = target.value;
		}
	}}
>
	{#if children}
		{@render children()}
	{/if}
</div>
