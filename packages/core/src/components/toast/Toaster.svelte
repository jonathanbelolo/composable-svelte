<script lang="ts">
	import { cn } from '$lib/utils.js';
	import { createStore } from '../../store.svelte.js';
	import { toastReducer } from './toast.reducer.js';
	import { createInitialToastState, type Toast, type ToastDependencies } from './toast.types.js';
	import ToastComponent from './Toast.svelte';

	/**
	 * Toaster container component.
	 *
	 * Manages toast notifications with queue management and auto-dismiss.
	 *
	 * @packageDocumentation
	 *
	 * @example
	 * ```svelte
	 * <script>
	 *   import { Toaster } from '@composable-svelte/core';
	 *
	 *   const store = createStore({
	 *     initialState: createInitialToastState(),
	 *     reducer: toastReducer
	 *   });
	 *
	 *   // Add toast
	 *   store.dispatch({
	 *     type: 'toastAdded',
	 *     toast: { variant: 'success', description: 'Saved!' }
	 *   });
	 * </script>
	 *
	 * <Toaster />
	 * ```
	 */

	interface ToasterProps {
		/**
		 * Optional external toasts to display.
		 * If not provided, uses internal store.
		 */
		toasts?: Toast[];

		/**
		 * Maximum number of toasts to show at once.
		 * Default: 3
		 */
		maxToasts?: number;

		/**
		 * Default auto-dismiss duration in milliseconds.
		 * Default: 5000 (5 seconds)
		 */
		defaultDuration?: number;

		/**
		 * Position of the toaster on screen.
		 * Default: 'bottom-right'
		 */
		position?: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';

		/**
		 * Additional CSS classes.
		 */
		class?: string;

		/**
		 * Dependencies for toast reducer.
		 */
		dependencies?: ToastDependencies;
	}

	let {
		toasts: externalToasts,
		maxToasts = 3,
		defaultDuration = 5000,
		position = 'bottom-right',
		class: className,
		dependencies
	}: ToasterProps = $props();

	// Create internal store
	const store = createStore({
		initialState: createInitialToastState({ maxToasts, defaultDuration, position }),
		reducer: toastReducer,
		dependencies
	});

	// Use external toasts if provided, otherwise use store state
	const activeToasts = $derived(externalToasts ?? store.state.toasts);

	function handleDismiss(id: string) {
		store.dispatch({ type: 'toastDismissed', id });
	}

	const positionClasses = {
		'top-left': 'top-0 left-0 items-start',
		'top-center': 'top-0 left-1/2 -translate-x-1/2 items-center',
		'top-right': 'top-0 right-0 items-end',
		'bottom-left': 'bottom-0 left-0 items-start',
		'bottom-center': 'bottom-0 left-1/2 -translate-x-1/2 items-center',
		'bottom-right': 'bottom-0 right-0 items-end'
	};

	const containerClasses = $derived(
		cn(
			'fixed z-[100] flex max-h-screen w-full flex-col-reverse gap-2 p-4 sm:flex-col md:max-w-[420px]',
			positionClasses[position],
			className
		)
	);
</script>

{#if activeToasts.length > 0}
	<div class={containerClasses}>
		{#each activeToasts as toast (toast.id)}
			<ToastComponent {toast} onDismiss={handleDismiss} />
		{/each}
	</div>
{/if}
