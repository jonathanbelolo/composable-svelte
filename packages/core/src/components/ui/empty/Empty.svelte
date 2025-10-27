<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	/**
	 * Empty component - Empty state placeholder for lists, grids, etc.
	 *
	 * @packageDocumentation
	 *
	 * @example
	 * ```svelte
	 * <!-- Basic empty state -->
	 * <Empty
	 *   title="No items found"
	 *   description="Get started by creating a new item."
	 * />
	 *
	 * <!-- With action button -->
	 * <Empty
	 *   title="No data"
	 *   description="Start by uploading some data."
	 * >
	 *   <Button onclick={handleUpload}>Upload Data</Button>
	 * </Empty>
	 *
	 * <!-- With custom icon -->
	 * <Empty title="No results">
	 *   {#snippet icon()}
	 *     <SearchIcon class="w-12 h-12" />
	 *   {/snippet}
	 * </Empty>
	 * ```
	 */

	interface EmptyProps extends Omit<HTMLAttributes<HTMLDivElement>, 'class'> {
		/**
		 * Main title text.
		 */
		title: string;

		/**
		 * Optional description text.
		 */
		description?: string;

		/**
		 * Additional CSS classes.
		 */
		class?: string;

		/**
		 * Optional icon/image snippet.
		 */
		icon?: import('svelte').Snippet;

		/**
		 * Optional action buttons or content.
		 */
		children?: import('svelte').Snippet;
	}

	let {
		title,
		description,
		class: className,
		icon,
		children,
		...restProps
	}: EmptyProps = $props();

	const containerClasses = $derived(
		cn('flex flex-col items-center justify-center py-12 px-4 text-center', className)
	);
</script>

<div class={containerClasses} {...restProps}>
	{#if icon}
		<div class="mb-4 text-muted-foreground">
			{@render icon()}
		</div>
	{:else}
		<!-- Default icon placeholder -->
		<div class="mb-4">
			<svg
				class="h-12 w-12 text-muted-foreground"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
				xmlns="http://www.w3.org/2000/svg"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="1.5"
					d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
				></path>
			</svg>
		</div>
	{/if}

	<h3 class="mb-2 text-lg font-semibold text-foreground">{title}</h3>

	{#if description}
		<p class="mb-4 max-w-sm text-sm text-muted-foreground">{description}</p>
	{/if}

	{#if children}
		<div class="mt-4">
			{@render children()}
		</div>
	{/if}
</div>
