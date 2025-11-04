<script lang="ts">
	import { cn } from '../../utils.js';
	import type { Toast } from './toast.types.js';
	import { animateToastIn, animateToastOut } from '../../animation/animate.js';
	import ToastTitle from './ToastTitle.svelte';
	import ToastDescription from './ToastDescription.svelte';
	import ToastAction from './ToastAction.svelte';

	/**
	 * Individual toast component.
	 *
	 * @packageDocumentation
	 *
	 * @example
	 * ```svelte
	 * <Toast
	 *   toast={{ id: '1', variant: 'success', title: 'Success', description: 'Item saved' }}
	 *   onDismiss={() => dispatch({ type: 'toastDismissed', id: '1' })}
	 * />
	 * ```
	 */

	interface ToastProps {
		/**
		 * Toast data.
		 */
		toast: Toast;

		/**
		 * Callback when toast is dismissed.
		 */
		onDismiss: (id: string) => void;

		/**
		 * Additional CSS classes.
		 */
		class?: string;
	}

	let { toast, onDismiss, class: className }: ToastProps = $props();

	const variantClasses = {
		default: 'bg-background text-foreground border-border',
		success: 'bg-green-50 text-green-900 border-green-200 dark:bg-green-950 dark:text-green-100 dark:border-green-800',
		error: 'bg-red-50 text-red-900 border-red-200 dark:bg-red-950 dark:text-red-100 dark:border-red-800',
		warning: 'bg-yellow-50 text-yellow-900 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-100 dark:border-yellow-800',
		info: 'bg-blue-50 text-blue-900 border-blue-200 dark:bg-blue-950 dark:text-blue-100 dark:border-blue-800'
	};

	const variantIcons = {
		default: '',
		success: '✓',
		error: '✕',
		warning: '⚠',
		info: 'ℹ'
	};

	function handleDismiss() {
		onDismiss(toast.id);
	}

	function handleAction() {
		toast.action?.onClick();
		onDismiss(toast.id);
	}

	const toastClasses = $derived(
		cn(
			'group pointer-events-auto relative flex w-full max-w-md items-start gap-3 overflow-hidden rounded-lg border p-4 pr-8 shadow-lg transition-all',
			variantClasses[toast.variant],
			className
		)
	);

	let toastElement: HTMLElement;

	// Animate in on mount
	$effect(() => {
		if (toastElement) {
			animateToastIn(toastElement);
		}
	});
</script>

<div
	bind:this={toastElement}
	class={toastClasses}
	role="alert"
	aria-live="polite"
>
	{#if variantIcons[toast.variant]}
		<div class="flex-shrink-0 text-lg leading-none" aria-hidden="true">
			{variantIcons[toast.variant]}
		</div>
	{/if}

	<div class="flex-1 space-y-1">
		{#if toast.title}
			<ToastTitle>{toast.title}</ToastTitle>
		{/if}
		{#if toast.description}
			<ToastDescription>{toast.description}</ToastDescription>
		{/if}
		{#if toast.action}
			<div class="mt-2">
				<ToastAction onclick={handleAction}>
					{toast.action.label}
				</ToastAction>
			</div>
		{/if}
	</div>

	{#if toast.dismissible !== false}
		<button
			type="button"
			class="absolute right-2 top-2 rounded-md p-1 text-foreground/50 opacity-0 transition-opacity hover:text-foreground focus:opacity-100 focus:outline-none focus:ring-2 group-hover:opacity-100"
			onclick={handleDismiss}
			aria-label="Dismiss"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 20 20"
				fill="currentColor"
				class="h-4 w-4"
			>
				<path
					d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"
				/>
			</svg>
		</button>
	{/if}
</div>
