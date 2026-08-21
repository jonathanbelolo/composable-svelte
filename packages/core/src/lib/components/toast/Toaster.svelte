<script lang="ts">
	import { cn } from '../../utils.js';
	import type { Store } from '../../types.js';
	import { createToastStore } from './create-toast-store.js';
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
		 * The toast store. Build it with `createToastStore()` and dispatch into
		 * it. Omit for a self-contained container with default configuration.
		 *
		 * Mutually exclusive with the config props below — supplying both is a
		 * mistake rather than a merge, and throws.
		 */
		store?: Store<ToastState, ToastAction>;

		/** Maximum number of toasts to show at once. Default: 3 */
		maxToasts?: number;

		/** Default auto-dismiss duration in milliseconds. Default: 5000 */
		defaultDuration?: number;

		/** Position of the toaster on screen. Default: 'bottom-right' */
		position?: ToastState['position'];

		/** Additional CSS classes. */
		class?: string;
	}

	let {
		store: externalStore,
		maxToasts,
		defaultDuration,
		position,
		class: className
	}: ToasterProps = $props();

	// The `toasts` array prop is gone. It was redundant with the store and its
	// dismiss button was provably dead: `toastDismissed` returns early for any
	// toast not in the store, and prop-supplied toasts never were.
	//
	// `dependencies` is gone too — with an internal store nothing could dispatch
	// into, its callbacks could never fire. `createToastStore({ dependencies })`
	// is the path that works.
	if (
		externalStore &&
		(maxToasts !== undefined || defaultDuration !== undefined || position !== undefined)
	) {
		throw new Error(
			'<Toaster>: pass configuration to createToastStore(), not alongside `store`. ' +
				'With an external store the config props would be silently ignored.'
		);
	}

	const store =
		externalStore ??
		createToastStore({
			...(maxToasts !== undefined && { maxToasts }),
			...(defaultDuration !== undefined && { defaultDuration }),
			...(position !== undefined && { position })
		});

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
