<script lang="ts">
	import { cn } from '../../../lib/utils.js';

	/**
	 * Checkbox component - Binary choice input.
	 *
	 * @example
	 * ```svelte
	 * <Checkbox bind:checked={acceptTerms} />
	 * ```
	 *
	 * @example With indeterminate state
	 * ```svelte
	 * <Checkbox
	 *   bind:checked={selectAll}
	 *   indeterminate={someSelected && !allSelected}
	 * />
	 * ```
	 */

	interface Props {
		/**
		 * Whether the checkbox is checked
		 */
		checked?: boolean;
		/**
		 * Whether the checkbox is in indeterminate state (dash instead of check)
		 */
		indeterminate?: boolean;
		/**
		 * Whether the checkbox is disabled
		 */
		disabled?: boolean;
		/**
		 * Optional class name
		 */
		class?: string;
		/**
		 * All other input attributes
		 */
		[key: string]: any;
	}

	let {
		checked = $bindable(false),
		indeterminate = false,
		disabled = false,
		class: className,
		...restProps
	}: Props = $props();

	let inputRef: HTMLInputElement;

	// Update indeterminate property on the DOM element
	$effect(() => {
		if (inputRef) {
			inputRef.indeterminate = indeterminate;
		}
	});
</script>

<div class="relative inline-flex items-center">
	<input
		bind:this={inputRef}
		bind:checked
		type="checkbox"
		{disabled}
		class={cn(
			'peer h-4 w-4 shrink-0 rounded-sm border border-primary',
			'ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
			'disabled:cursor-not-allowed disabled:opacity-50',
			'data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
			className
		)}
		data-state={checked ? 'checked' : indeterminate ? 'indeterminate' : 'unchecked'}
		role="checkbox"
		aria-checked={indeterminate ? 'mixed' : checked}
		{...restProps}
	/>

	<!-- Checkmark icon -->
	{#if checked && !indeterminate}
		<svg
			class="pointer-events-none absolute left-0 top-0 h-4 w-4 text-primary-foreground"
			viewBox="0 0 16 16"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path
				d="M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z"
				fill="currentColor"
			/>
		</svg>
	{/if}

	<!-- Indeterminate dash -->
	{#if indeterminate}
		<svg
			class="pointer-events-none absolute left-0 top-0 h-4 w-4 text-primary-foreground"
			viewBox="0 0 16 16"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path d="M4 8h8" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
		</svg>
	{/if}
</div>
