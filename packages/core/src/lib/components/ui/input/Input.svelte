<script lang="ts" generics="Action = unknown">
	import { cn } from '../../../utils.js';
	import { isServer } from '../../../ssr/utils.js';
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

	type InputAction<A> = A extends object ? Omit<A, 'value'> : A;

	interface InputProps<Action> extends Omit<HTMLInputAttributes, 'class'> {
		/**
		 * Input type.
		 */
		type?: 'text' | 'email' | 'password' | 'number' | 'tel' | 'url' | 'search' | undefined;

		/**
		 * Current value (supports two-way binding). Numeric clear emits an empty string; invalid partial edits emit nothing.
		 */
		value?: string | number;

		/**
		 * Bad input status (e.g. invalid numeric entry like incomplete exponent).
		 */
		badInput?: boolean | undefined;

		/**
		 * Disabled state.
		 */
		disabled?: boolean | undefined;

		/**
		 * Error state (for styling).
		 */
		error?: boolean | undefined;

		/**
		 * ID of error message element (sets aria-describedby automatically).
		 */
		errorId?: string | undefined;

		/**
		 * Manual aria-describedby override (use if not using errorId).
		 */
		describedBy?: string | undefined;

		/**
		 * Reducer action to dispatch on input (Composable Architecture pattern).
		 * The action will be enriched with the current value.
		 */
		action?: Action | InputAction<Action> | undefined;

		/**
		 * Dispatch function from store (required if action is provided).
		 */
		dispatch?: Dispatch<Action> | undefined;

		/**
		 * Additional CSS classes.
		 */
		class?: string | undefined;
	}

	let {
		type = 'text',
		value = $bindable(''),
		badInput = $bindable(false),
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

	const inputClasses = $derived(cn(baseClasses, (error || badInput) && errorClasses, className));

	// ARIA: Automatically set aria-describedby if errorId provided
	const ariaDescribedBy = $derived(error && errorId ? errorId : describedBy);

	let inputElement: HTMLInputElement | undefined = $state();
	$effect(() => {
		if (!inputElement) return;
		// Preserve numeric lexical edits while reflecting external model changes.
		const next = value == null ? '' : String(value);
		if (type === 'number' && next !== '' && inputElement.value !== '' &&
			Number(inputElement.value) === Number(next)) {
			badInput = inputElement.validity.badInput;
			return;
		}
		if (inputElement.value !== next) inputElement.value = next;
		badInput = inputElement.validity.badInput;
	});

	/**
	 * Handle input change event.
	 * Updates bindable value and dispatches action if provided.
	 */
	function handleInput(e: Event & { currentTarget: HTMLInputElement }) {
		badInput = e.currentTarget.validity.badInput;
		if (type === 'number' && e.currentTarget.validity.badInput) {
			oninput?.(e);
			return;
		}
		// Update bindable value
		value = type === 'number' && e.currentTarget.value !== '' ? Number(e.currentTarget.value) : e.currentTarget.value;

		// Dispatch action if provided (Composable Architecture pattern)
		if (action && dispatch) {
			// Enrich action with value
			const enrichedAction =
				typeof action === 'object' && action !== null
					? { ...action, value }
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
		badInput = e.currentTarget.validity.badInput;
		// Call traditional handler
		onblur?.(e);

		// Note: For blur-specific actions, use separate blurAction prop
		// or handle in parent reducer based on action type
	}
</script>

<input
	{type}
	bind:this={inputElement}
	value={isServer() ? (value ?? '') : undefined}
	{disabled}
	class={inputClasses}
	aria-invalid={error || badInput}
	aria-describedby={ariaDescribedBy}
	oninput={handleInput}
	onblur={handleBlur}
	{...restProps}
/>
