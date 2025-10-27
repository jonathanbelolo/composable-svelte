<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes} from 'svelte/elements';

	/**
	 * Card container component.
	 *
	 * @packageDocumentation
	 *
	 * @example
	 * ```svelte
	 * <Card>
	 *   <CardHeader>
	 *     <CardTitle>Card Title</CardTitle>
	 *     <CardDescription>Card description text</CardDescription>
	 *   </CardHeader>
	 *   <CardContent>
	 *     <p>Card content goes here</p>
	 *   </CardContent>
	 *   <CardFooter>
	 *     <Button>Action</Button>
	 *   </CardFooter>
	 * </Card>
	 * ```
	 */

	interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'class'> {
		/**
		 * Additional CSS classes.
		 */
		class?: string;

		/**
		 * Card content.
		 */
		children: Snippet;
	}

	let { class: className, children, ...restProps }: CardProps = $props();

	const cardClasses = $derived(
		cn('rounded-lg border bg-card text-card-foreground shadow-sm', className)
	);
</script>

<div class={cardClasses} {...restProps}>
	{@render children()}
</div>
