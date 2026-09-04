<script lang="ts">
	import type { HTMLTextareaAttributes } from 'svelte/elements';
	import { cn } from '../../../utils.js';

	/**
	 * Textarea component - Multi-line text input.
	 *
	 * @example
	 * ```svelte
	 * <Textarea
	 *   bind:value={message}
	 *   placeholder="Enter your message..."
	 *   rows={4}
	 * />
	 * ```
	 */

	// Extends the real textarea attributes, as Input does with HTMLInputAttributes.
	// A hand-rolled interface with an `[key: string]: any` catch-all typechecked,
	// but it swallowed every DOM handler: `oninput={(e) => …}` gave `e` an
	// implicit `any`, so nothing could be read off `e.currentTarget` safely.
	interface Props extends Omit<HTMLTextareaAttributes, 'class' | 'value' | 'rows'> {
		/**
		 * The textarea value
		 */
		value?: string;
		/**
		 * Number of visible text rows
		 */
		rows?: number | undefined;
		/**
		 * Placeholder text
		 */
		placeholder?: string | undefined;
		/**
		 * Whether the textarea is disabled
		 */
		disabled?: boolean | undefined;
		/**
		 * Whether to allow resizing (vertical, horizontal, both, none)
		 */
		resize?: 'none' | 'vertical' | 'horizontal' | 'both' | undefined;
		/**
		 * Optional class name
		 */
		class?: string | undefined;
	}

	let {
		value = $bindable(''),
		rows = 3,
		placeholder,
		disabled = false,
		resize = 'vertical',
		class: className,
		...restProps
	}: Props = $props();

	const resizeClass = {
		none: 'resize-none',
		vertical: 'resize-y',
		horizontal: 'resize-x',
		both: 'resize'
	}[resize];
</script>

<textarea
	bind:value
	{rows}
	{placeholder}
	{disabled}
	class={cn(
		'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
		'ring-offset-background placeholder:text-muted-foreground',
		'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
		'disabled:cursor-not-allowed disabled:opacity-50',
		resizeClass,
		className
	)}
	{...restProps}
></textarea>
