import type { HTMLAttributes } from 'svelte/elements';
/**
 * Heading component - Semantic headings (H1-H6) with consistent styling.
 *
 * @packageDocumentation
 *
 * @example
 * ```svelte
 * <!-- Page title (H1) -->
 * <Heading level={1}>Page Title</Heading>
 *
 * <!-- Section heading (H2) -->
 * <Heading level={2}>Section Title</Heading>
 *
 * <!-- With custom styling -->
 * <Heading level={3} class="text-primary">
 *   Custom Heading
 * </Heading>
 * ```
 */
interface HeadingProps extends Omit<HTMLAttributes<HTMLHeadingElement>, 'class'> {
    /**
     * Heading level (1-6).
     */
    level: 1 | 2 | 3 | 4 | 5 | 6;
    /**
     * Additional CSS classes.
     */
    class?: string;
    /**
     * Heading content.
     */
    children?: import('svelte').Snippet;
}
declare const Heading: import("svelte").Component<HeadingProps, {}, "">;
type Heading = ReturnType<typeof Heading>;
export default Heading;
//# sourceMappingURL=Heading.svelte.d.ts.map