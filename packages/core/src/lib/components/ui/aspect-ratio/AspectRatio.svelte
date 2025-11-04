<script lang="ts">
	import { cn } from '../../../utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	/**
	 * AspectRatio component - Maintains aspect ratio for content.
	 *
	 * @packageDocumentation
	 *
	 * @example
	 * ```svelte
	 * <!-- 16:9 aspect ratio (default) -->
	 * <AspectRatio>
	 *   <img src="video-thumbnail.jpg" alt="Video" />
	 * </AspectRatio>
	 *
	 * <!-- Square (1:1) -->
	 * <AspectRatio ratio={1}>
	 *   <img src="avatar.jpg" alt="Avatar" />
	 * </AspectRatio>
	 *
	 * <!-- 4:3 aspect ratio -->
	 * <AspectRatio ratio={4 / 3}>
	 *   <iframe src="..." />
	 * </AspectRatio>
	 *
	 * <!-- Custom ratio (21:9 ultrawide) -->
	 * <AspectRatio ratio={21 / 9}>
	 *   <video src="..." />
	 * </AspectRatio>
	 * ```
	 */

	interface AspectRatioProps extends Omit<HTMLAttributes<HTMLDivElement>, 'class'> {
		/**
		 * Aspect ratio as a number (width / height).
		 * Common values:
		 * - 16/9 ≈ 1.778 (default, widescreen video)
		 * - 4/3 ≈ 1.333 (standard video)
		 * - 1 (square)
		 * - 21/9 ≈ 2.333 (ultrawide)
		 */
		ratio?: number;

		/**
		 * Additional CSS classes for the container.
		 */
		class?: string;

		/**
		 * Content to maintain aspect ratio for.
		 */
		children?: import('svelte').Snippet;
	}

	let { ratio = 16 / 9, class: className, children, ...restProps }: AspectRatioProps = $props();

	// Calculate padding-bottom percentage: (height / width) * 100
	const paddingBottom = $derived(`${(1 / ratio) * 100}%`);

	const containerClasses = $derived(cn('relative w-full', className));
</script>

<div class={containerClasses} style="padding-bottom: {paddingBottom}" {...restProps}>
	<div class="absolute inset-0">
		{#if children}
			{@render children()}
		{/if}
	</div>
</div>
