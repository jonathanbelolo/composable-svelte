<script lang="ts" generics="Action = unknown">
	import { cn } from '../../../utils.js';
	import type { Dispatch } from '../../../types.js';
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	/**
	 * Button component with variant system and action dispatch pattern.
	 *
	 * @packageDocumentation
	 *
	 * @example
	 * ```svelte
	 * <!-- With reducer action dispatch -->
	 * <Button
	 *   action={{ type: 'saveButtonTapped' }}
	 *   dispatch={store.dispatch}
	 *   variant="primary"
	 * >
	 *   Save
	 * </Button>
	 *
	 * <!-- With traditional event handler -->
	 * <Button onclick={() => console.log('clicked')}>
	 *   Click Me
	 * </Button>
	 * ```
	 */

	interface ButtonProps<Action> extends Omit<HTMLButtonAttributes, 'class'> {
		/**
		 * Visual variant of the button.
		 */
		variant?: 'default' | 'primary' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'link' | undefined;

		/**
		 * Size of the button.
		 */
		size?: 'sm' | 'md' | 'lg' | 'icon' | undefined;

		/**
		 * Disabled state.
		 */
		disabled?: boolean | undefined;

		/**
		 * Loading state (shows spinner, disables interaction).
		 */
		loading?: boolean | undefined;

		/**
		 * Reducer action to dispatch on click (Composable Architecture pattern).
		 */
		action?: Action | undefined;

		/**
		 * Dispatch function from store (required if action is provided).
		 */
		dispatch?: Dispatch<Action> | undefined;

		/**
		 * Additional CSS classes.
		 */
		class?: string | undefined;

		/**
		 * Button content.
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
	}: ButtonProps<Action> = $props();

	const baseClasses =
		'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50';

	const variantClasses = {
		default: 'bg-primary text-primary-foreground hover:bg-primary/90',
		primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
		secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
		destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
		outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
		ghost: 'hover:bg-accent hover:text-accent-foreground',
		link: 'text-primary underline-offset-4 hover:underline'
	};

	const sizeClasses = {
		sm: 'h-9 rounded-md px-3',
		md: 'h-10 px-4 py-2',
		lg: 'h-11 rounded-md px-8',
		icon: 'h-10 w-10'
	};

	function handleClick(e: MouseEvent & { currentTarget: EventTarget & HTMLButtonElement }) {
		if (loading || disabled) {
			e.preventDefault();
			return;
		}

		// Composable Architecture: dispatch action
		if (action && dispatch) {
			dispatch(action);
		}

		// Traditional: call event handler
		onclick?.(e);
	}

	/**
	 * Look a variant or size up, falling back rather than resolving to nothing.
	 *
	 * `variantClasses[variant]` is `undefined` for anything outside the union,
	 * and `cn()` drops undefined — so an unrecognised size produced a button
	 * with no height and no padding, and an unrecognised variant one with no
	 * background. Invisible, not wrong-looking.
	 *
	 * TypeScript catches a literal. It does not catch a value arriving from a
	 * store, a JSON payload or an untyped call site, and that is where this
	 * actually happened: `product-gallery` passed `size="default"` — a real
	 * shadcn size name, absent from this union — and every share button lost its
	 * sizing. That is recorded as S4.6, and it was fixed in the example while
	 * the component kept the behaviour that allowed it.
	 */
	// A function declaration, not a generic arrow: `<T extends …>` in a `.svelte`
	// file is ambiguous with markup and the parser takes it as a tag.
	function lookup(table: Record<string, string>, key: string, fallback: string): string {
		return table[key] ?? table[fallback]!;
	}

	const buttonClasses = $derived(
		cn(
			baseClasses,
			lookup(variantClasses, variant, 'default'),
			lookup(sizeClasses, size, 'md'),
			className
		)
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
		<!-- Inline loading spinner
		     Note: Uses CSS animate-spin instead of Motion One for simplicity.
		     This is an acceptable exception to the "Motion One everywhere" rule
		     as infinite rotation is better handled by CSS for performance. -->
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
	{/if}
	{@render children()}
</button>
