<script lang="ts" generics="Action = unknown">
	import { cn } from '$lib/utils.js';
	import type { Dispatch } from '../../../types.js';
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	/**
	 * IconButton component - Button specifically designed for icon-only content.
	 *
	 * @packageDocumentation
	 *
	 * @example
	 * ```svelte
	 * <!-- With reducer action -->
	 * <IconButton
	 *   action={{ type: 'closeButtonTapped' }}
	 *   dispatch={store.dispatch}
	 *   aria-label="Close"
	 * >
	 *   <CloseIcon />
	 * </IconButton>
	 *
	 * <!-- With event handler -->
	 * <IconButton onclick={handleClick} aria-label="Menu">
	 *   <MenuIcon />
	 * </IconButton>
	 *
	 * <!-- Different sizes -->
	 * <IconButton size="sm" aria-label="Info">
	 *   <InfoIcon />
	 * </IconButton>
	 * ```
	 */

	interface IconButtonProps<Action> extends Omit<HTMLButtonAttributes, 'class'> {
		/**
		 * Visual variant.
		 */
		variant?: 'default' | 'primary' | 'secondary' | 'destructive' | 'outline' | 'ghost';

		/**
		 * Size of the button.
		 */
		size?: 'sm' | 'md' | 'lg';

		/**
		 * Disabled state.
		 */
		disabled?: boolean;

		/**
		 * Loading state.
		 */
		loading?: boolean;

		/**
		 * Reducer action to dispatch on click.
		 */
		action?: Action;

		/**
		 * Dispatch function from store.
		 */
		dispatch?: Dispatch<Action>;

		/**
		 * Additional CSS classes.
		 */
		class?: string;

		/**
		 * Icon content (must provide aria-label for accessibility).
		 */
		children: Snippet;
	}

	let {
		variant = 'default',
		size = 'md',
		disabled = false,
		loading = false,
		action,
		dispatch,
		class: className,
		children,
		onclick,
		...restProps
	}: IconButtonProps<Action> = $props();

	const baseClasses =
		'inline-flex items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50';

	const variantClasses = {
		default: 'bg-primary text-primary-foreground hover:bg-primary/90',
		primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
		secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
		destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
		outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
		ghost: 'hover:bg-accent hover:text-accent-foreground'
	};

	const sizeClasses = {
		sm: 'h-8 w-8',
		md: 'h-10 w-10',
		lg: 'h-12 w-12'
	};

	function handleClick(e: MouseEvent) {
		if (loading || disabled) {
			e.preventDefault();
			return;
		}

		if (action && dispatch) {
			dispatch(action);
		}

		onclick?.(e);
	}

	const buttonClasses = $derived(
		cn(baseClasses, variantClasses[variant], sizeClasses[size], className)
	);
</script>

<button
	type="button"
	class={buttonClasses}
	disabled={disabled || loading}
	onclick={handleClick}
	{...restProps}
>
	{#if loading}
		<svg
			class="h-4 w-4 animate-spin"
			xmlns="http://www.w3.org/2000/svg"
			fill="none"
			viewBox="0 0 24 24"
			role="status"
			aria-label="Loading"
		>
			<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
			></circle>
			<path
				class="opacity-75"
				fill="currentColor"
				d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
			></path>
		</svg>
	{:else}
		{@render children()}
	{/if}
</button>
