<script lang="ts">
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

	interface Props {
		/**
		 * The textarea value
		 */
		value?: string;
		/**
		 * Number of visible text rows
		 */
		rows?: number;
		/**
		 * Placeholder text
		 */
		placeholder?: string;
		/**
		 * Whether the textarea is disabled
		 */
		disabled?: boolean;
		/**
		 * Whether to allow resizing (vertical, horizontal, both, none)
		 */
		resize?: 'none' | 'vertical' | 'horizontal' | 'both';
		/**
		 * Optional class name
		 */
		class?: string;
		/**
		 * All other textarea attributes
		 */
		[key: string]: any;
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
