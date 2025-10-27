<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { Snippet } from 'svelte';
	import type { HTMLLabelAttributes } from 'svelte/elements';

	/**
	 * Label component for form fields with accessibility support.
	 *
	 * @packageDocumentation
	 *
	 * @example
	 * ```svelte
	 * <Label for="email">Email Address</Label>
	 * <Input id="email" type="email" />
	 *
	 * <!-- With error state -->
	 * <Label for="password" error={!!passwordError}>
	 *   Password
	 * </Label>
	 *
	 * <!-- With required indicator -->
	 * <Label for="username" required>
	 *   Username
	 * </Label>
	 * ```
	 */

	interface LabelProps extends Omit<HTMLLabelAttributes, 'class'> {
		/**
		 * ID of the associated form element.
		 */
		for?: string;

		/**
		 * Error state (changes styling to destructive color).
		 */
		error?: boolean;

		/**
		 * Required field indicator (shows red asterisk).
		 */
		required?: boolean;

		/**
		 * Additional CSS classes.
		 */
		class?: string;

		/**
		 * Label content.
		 */
		children: Snippet;
	}

	let {
		for: htmlFor,
		error = false,
		required = false,
		class: className,
		children,
		...restProps
	}: LabelProps = $props();

	const baseClasses =
		'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70';

	const errorClasses = 'text-destructive';

	const labelClasses = $derived(cn(baseClasses, error && errorClasses, className));
</script>

<label for={htmlFor} class={labelClasses} {...restProps}>
	{@render children()}
	{#if required}
		<span class="text-destructive ml-1" aria-label="required">*</span>
	{/if}
</label>
