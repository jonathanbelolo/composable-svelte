<script lang="ts">
	import { cn } from '../../../utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	/**
	 * Skeleton component for loading state placeholders.
	 *
	 * @packageDocumentation
	 *
	 * @example
	 * ```svelte
	 * <!-- Avatar skeleton -->
	 * <Skeleton class="h-12 w-12" variant="circle" />
	 *
	 * <!-- Text line skeleton -->
	 * <Skeleton class="h-4 w-full" variant="text" />
	 * <Skeleton class="h-4 w-3/4" variant="text" />
	 *
	 * <!-- Card skeleton -->
	 * <Skeleton class="h-32 w-full" />
	 *
	 * <!-- Custom skeleton -->
	 * <Skeleton class="h-20 w-40 rounded-xl" />
	 * ```
	 */

	interface SkeletonProps extends Omit<HTMLAttributes<HTMLDivElement>, 'class'> {
		/**
		 * Shape variant of the skeleton.
		 * - default: Rectangle with rounded corners
		 * - circle: Circular shape (for avatars)
		 * - text: Thin line (for text placeholders)
		 */
		variant?: 'default' | 'circle' | 'text';

		/**
		 * Additional CSS classes.
		 */
		class?: string;
	}

	let { variant = 'default', class: className, ...restProps }: SkeletonProps = $props();

	const baseClasses = 'animate-pulse bg-muted';

	const variantClasses = {
		default: 'rounded-md',
		circle: 'rounded-full',
		text: 'rounded-md h-4'
	};

	const skeletonClasses = $derived(cn(baseClasses, variantClasses[variant], className));
</script>

<div class={skeletonClasses} {...restProps}></div>
