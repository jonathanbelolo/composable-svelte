import type { HTMLAttributes } from 'svelte/elements';
/**
 * Box component - Primitive layout container with spacing utilities.
 *
 * @packageDocumentation
 *
 * @example
 * ```svelte
 * <!-- Basic box with padding -->
 * <Box p="md">
 *   <p>Content with medium padding</p>
 * </Box>
 *
 * <!-- Box with margin and padding -->
 * <Box p="lg" m="sm">
 *   <p>Content with large padding and small margin</p>
 * </Box>
 *
 * <!-- Custom element type -->
 * <Box as="section" p="xl">
 *   <h2>Section content</h2>
 * </Box>
 * ```
 */
interface BoxProps extends Omit<HTMLAttributes<HTMLElement>, 'class'> {
    /**
     * HTML element to render as (default: 'div').
     */
    as?: keyof HTMLElementTagNameMap;
    /**
     * Padding size.
     * - none: No padding
     * - xs: 0.25rem (4px)
     * - sm: 0.5rem (8px)
     * - md: 1rem (16px)
     * - lg: 1.5rem (24px)
     * - xl: 2rem (32px)
     */
    p?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    /**
     * Margin size (same scale as padding).
     */
    m?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    /**
     * Additional CSS classes.
     */
    class?: string;
    /**
     * Box content.
     */
    children?: import('svelte').Snippet;
}
declare const Box: import("svelte").Component<BoxProps, {}, "">;
type Box = ReturnType<typeof Box>;
export default Box;
//# sourceMappingURL=Box.svelte.d.ts.map