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

	// Motion One is the *only* author of the thumb's transform.
	//
	// It used to share the property with a Tailwind transition class and a
	// reactive inline `style` writing the same translate — three mechanisms on
	// one property. Motion happened to win each frame, so it looked fine, but
	// "looked fine" is not an ownership rule.
	//
	// Plain `let`, not $state: the effect reads and writes it, and a reactive
	// guard re-triggers the effect it lives in.
	// Captured once, never reactive — the thumb's position *before* any animation,
	// and the only thing the server can emit. `$effect` does not run during SSR,
	// so an effect-only transform renders a checked switch with its thumb at rest.
	// Verified by compiling with `generate: 'server'`.
	//
	// Because it never changes, Svelte writes it once and then leaves the property
	// alone: the markup places, Motion One animates. Invariant 6 holds.
	const initialThumbTransform = checked ? 'translateX(100%)' : 'translateX(0%)';

	let lastAnimatedChecked: boolean | undefined = undefined;

	$effect(() => {
		const isChecked = checked;
		if (!thumbRef || lastAnimatedChecked === isChecked) return;

		const first = lastAnimatedChecked === undefined;
		lastAnimatedChecked = isChecked;

		if (first) {
			// A switch that mounts already on has not just been switched on. The
			// effect was previously unguarded, so it sprang the thumb in from zero
			// on first render — indistinguishable from the user toggling it.
			// Placement is the markup's job (see `initialThumbTransform`).
			return;
		}

		animate(
			thumbRef,
			{ x: isChecked ? '100%' : '0%' },
			{
				type: 'spring',
				visualDuration: SPRING_PRESETS.button.visualDuration,
				bounce: SPRING_PRESETS.button.bounce
			}
		);
	});
</script>

<button
	type="button"
	role="switch"
	aria-checked={checked}
	{disabled}
	class={cn(
		'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent',
		'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
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
			'pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0',
			'will-change-transform'
		)}
		style:transform={initialThumbTransform}
	></div>
</button>
