<script lang="ts" generics="Action = unknown">
	import { cn } from '../../../utils.js';
	import type { Dispatch } from '../../../types.js';
	import type { HTMLInputAttributes } from 'svelte/elements';

	/**
	 * Input component for form fields.
	 *
	 * Supports both controlled (with value binding) and action dispatch patterns.
	 *
	 * @packageDocumentation
	 *
	 * @example
	 * ```svelte
	 * <!-- Controlled input with action dispatch -->
	 * <Input
	 *   type="text"
	 *   value={state.name}
	 *   action={{ type: 'nameChanged' }}
	 *   dispatch={store.dispatch}
	 * />
	 *
	 * <!-- With error state and ARIA -->
	 * <Input
	 *   type="email"
	 *   value={state.email}
	 *   error={!!state.emailError}
	 *   errorId="email-error"
	 * />
	 * <p id="email-error" class="text-destructive text-sm">
	 *   {state.emailError}
	 * </p>
	 *
	 * <!-- Traditional event handler -->
	 * <Input
	 *   type="text"
	 *   oninput={(e) => console.log(e.currentTarget.value)}
	 * />
	 * ```
	 */

	interface InputProps<Action> extends Omit<HTMLInputAttributes, 'class'> {
		/**
		 * Input type.
		 */
		type?: 'text' | 'email' | 'password' | 'number' | 'tel' | 'url' | 'search';

		/**
		 * Current value (supports two-way binding).
		 */
		value?: string | number;

		/**
		 * Disabled state.
		 */
		disabled?: boolean;

		/**
		 * Error state (for styling).
		 */
		error?: boolean;

		/**
		 * ID of error message element (sets aria-describedby automatically).
		 */
		errorId?: string;

		/**
		 * Manual aria-describedby override (use if not using errorId).
		 */
		describedBy?: string;

		/**
		 * Reducer action to dispatch on input (Composable Architecture pattern).
		 * The action will be enriched with the current value.
		 */
		action?: Action;

		/**
		 * Dispatch function from store (required if action is provided).
		 */
		dispatch?: Dispatch<Action>;

		/**
		 * Additional CSS classes.
		 */
		class?: string;
	}

	let {
		type = 'text',
		value = $bindable(''),
		disabled = false,
		error = false,
		errorId,
		describedBy,
		action,
		dispatch,
		class: className,
		oninput,
		onblur,
		...restProps
	}: InputProps<Action> = $props();

	const baseClasses =
		'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

	const errorClasses = 'border-destructive focus-visible:ring-destructive';

	const inputClasses = $derived(cn(baseClasses, error && errorClasses, className));

	// ARIA: Automatically set aria-describedby if errorId provided
	const ariaDescribedBy = $derived(error && errorId ? errorId : describedBy);

	/**
	 * Handle input change event.
	 * Updates bindable value and dispatches action if provided.
	 */
	function handleInput(e: Event & { currentTarget: HTMLInputElement }) {
		// Update bindable value
		value = type === 'number' ? Number(e.currentTarget.value) : e.currentTarget.value;

		// Dispatch action if provided (Composable Architecture pattern)
		if (action && dispatch) {
			// Enrich action with value
			const enrichedAction =
				typeof action === 'object' && action !== null
					? { ...action, value: e.currentTarget.value }
					: action;
			dispatch(enrichedAction as Action);
		}

		// Call traditional handler
		oninput?.(e);
	}

	/**
	 * Handle blur event.
	 * Dispatches blur-specific action if provided.
	 */
	function handleBlur(e: FocusEvent & { currentTarget: HTMLInputElement }) {
		// Call traditional handler
		onblur?.(e);

		// Note: For blur-specific actions, use separate blurAction prop
		// or handle in parent reducer based on action type
	}
</script>

<input
	{type}
	bind:value
	{disabled}
	class={inputClasses}
	aria-invalid={error}
	aria-describedby={ariaDescribedBy}
	oninput={handleInput}
	onblur={handleBlur}
	{...restProps}
/>
