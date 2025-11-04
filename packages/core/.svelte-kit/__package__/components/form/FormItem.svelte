<script lang="ts">
	import { cn } from '../../utils.js';

	/**
	 * FormItem component - Wrapper for form field elements.
	 * Provides consistent spacing and layout for form fields.
	 *
	 * @example
	 * ```svelte
	 * <FormItem>
	 *   <FormLabel>Email</FormLabel>
	 *   <FormControl>
	 *     <Input type="email" />
	 *   </FormControl>
	 *   <FormDescription>Enter your email address</FormDescription>
	 *   <FormMessage />
	 * </FormItem>
	 * ```
	 */

	interface Props {
		/**
		 * Optional class name
		 */
		class?: string;
		/**
		 * Children elements
		 */
		children?: import('svelte').Snippet;
	}

	let { class: className, children }: Props = $props();
</script>

<div class={cn('space-y-2', className)}>
	{#if children}
		{@render children()}
	{/if}
</div>
