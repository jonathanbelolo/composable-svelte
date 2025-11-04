<script lang="ts">
	import { cn } from '../../../utils.js';
	import { animate } from '../../../animation/animate.js';
	import { SPRING_PRESETS } from '../../../animation/spring-config.js';

	/**
	 * Switch component - Toggle between on/off states with smooth animation.
	 *
	 * @example
	 * ```svelte
	 * <Switch bind:checked={isEnabled} />
	 * ```
	 *
	 * @example With label
	 * ```svelte
	 * <label class="flex items-center gap-2">
	 *   <Switch bind:checked={notifications} />
	 *   <span>Enable notifications</span>
	 * </label>
	 * ```
	 */

	interface Props {
		/**
		 * Whether the switch is checked/on
		 */
		checked?: boolean;
		/**
		 * Whether the switch is disabled
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
		disabled = false,
		class: className,
		...restProps
	}: Props = $props();

	let thumbRef: HTMLDivElement;

	// Animate the thumb when checked state changes
	$effect(() => {
		if (thumbRef) {
			animate(thumbRef, {
				x: checked ? '100%' : '0%'
			}, {
				spring: SPRING_PRESETS.button,
				duration: 0.2
			});
		}
	});
</script>

<button
	type="button"
	role="switch"
	aria-checked={checked}
	{disabled}
	class={cn(
		'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent',
		'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
		'disabled:cursor-not-allowed disabled:opacity-50',
		checked ? 'bg-primary' : 'bg-input',
		className
	)}
	onclick={() => {
		if (!disabled) {
			checked = !checked;
		}
	}}
	{...restProps}
>
	<div
		bind:this={thumbRef}
		class={cn(
			'pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform',
			'will-change-transform'
		)}
		style="transform: translateX({checked ? '100%' : '0%'})"
	></div>
</button>
