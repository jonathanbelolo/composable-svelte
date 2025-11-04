<script lang="ts">
	import { getContext } from 'svelte';
	import { cn } from '../../../lib/utils.js';

	/**
	 * Radio component - Single choice from a set of options.
	 * Must be used within a RadioGroup.
	 *
	 * @example
	 * ```svelte
	 * <RadioGroup bind:value={selectedOption}>
	 *   <Radio value="option1">Option 1</Radio>
	 *   <Radio value="option2">Option 2</Radio>
	 * </RadioGroup>
	 * ```
	 */

	interface Props {
		/**
		 * The value of this radio option
		 */
		value: string;
		/**
		 * Whether the radio is disabled
		 */
		disabled?: boolean;
		/**
		 * Optional class name
		 */
		class?: string;
		/**
		 * Label content
		 */
		children?: import('svelte').Snippet;
		/**
		 * All other input attributes
		 */
		[key: string]: any;
	}

	let {
		value,
		disabled = false,
		class: className,
		children,
		...restProps
	}: Props = $props();

	// Get group context
	const groupValue = getContext<{ current: string | null }>('radioGroupValue');
	const groupName = getContext<string>('radioGroupName');

	if (!groupValue || !groupName) {
		throw new Error('Radio must be used within a RadioGroup');
	}

	const isChecked = $derived(groupValue.current === value);
</script>

<label class="inline-flex items-center gap-2 cursor-pointer">
	<div class="relative inline-flex items-center">
		<input
			type="radio"
			name={groupName}
			{value}
			checked={isChecked}
			{disabled}
			class={cn(
				'peer h-4 w-4 shrink-0 rounded-full border border-primary',
				'text-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
				'disabled:cursor-not-allowed disabled:opacity-50',
				className
			)}
			role="radio"
			aria-checked={isChecked}
			{...restProps}
		/>

		<!-- Radio dot when checked -->
		{#if isChecked}
			<div
				class="pointer-events-none absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary"
			></div>
		{/if}
	</div>

	{#if children}
		<span class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
			{@render children()}
		</span>
	{/if}
</label>
