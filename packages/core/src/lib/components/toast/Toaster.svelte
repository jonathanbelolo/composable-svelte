<script lang="ts">
	import { cn } from '../../utils.js';
	import type { Store } from '../../types.js';
	import type { ToastState, ToastAction } from './toast.types.js';
	import ToastComponent from './Toast.svelte';

	/**
	 * Toaster container component.
	 *
	 * Manages toast notifications with queue management and auto-dismiss.
	 *
	 * Own the store to dispatch into it — that is what makes `dependencies`
	 * and every toast action reachable. Omit it for a self-contained container.
	 *
	 * @example
	 * ```typescript
	 * import { Toaster, createToastStore } from '@composable-svelte/core/components/toast';
	 *
	 * const toasts = createToastStore({ position: 'top-right' });
	 * toasts.dispatch({
	 *   type: 'toastAdded',
	 *   toast: { variant: 'success', description: 'Saved!' }
	 * });
	 * ```
	 * ```svelte
	 * <Toaster store={toasts} />
	 * ```
	 */

	interface ToasterProps {
		/**
		 * The toast store. Build it with `createToastStore(config)` and dispatch
		 * `toastAdded` into it.
		 *
		 * Required. An internal fallback store was kept here at first, along with
		 * `maxToasts` / `defaultDuration` / `position` props to seed it — but
		 * nothing could dispatch into that store (no context, no export, no
		 * bindable), so the container rendered `<!---->` forever and those three
		 * props were unreachable by exactly the argument used to remove
		 * `dependencies`. Measured, not assumed.
		 */
		store: Store<ToastState, ToastAction>;

		/** Additional CSS classes. */
		class?: string | undefined;
	}

	let { store, class: className }: ToasterProps = $props();

	// `toasts`, `dependencies` and the three config props are all gone. Each was
	// unreachable for the same reason: they configured or fed an internal store
	// no consumer could dispatch into. `createToastStore(config)` owns all of
	// it now, and this component is purely presentational.
	const activeToasts = $derived($store.toasts);

	function handleDismiss(id: string) {
		store.dispatch({ type: 'toastDismissed', id });
	}

	function handleAction(id: string) {
		store.dispatch({ type: 'toastActionClicked', id });
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
			positionClasses[$store.position],
			className
		)
	);
</script>

{#if activeToasts.length > 0}
	<div class={containerClasses}>
		{#each activeToasts as toast (toast.id)}
			<ToastComponent {toast} onDismiss={handleDismiss} onAction={handleAction} />
		{/each}
	</div>
{/if}
