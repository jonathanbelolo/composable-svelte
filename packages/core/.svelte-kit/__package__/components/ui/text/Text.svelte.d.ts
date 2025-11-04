import type { HTMLAttributes } from 'svelte/elements';
/**
 * Text component - Paragraph text with size and color variants.
 *
 * @packageDocumentation
 *
 * @example
 * ```svelte
 * <!-- Default paragraph -->
 * <Text>This is body text.</Text>
 *
 * <!-- Large text -->
 * <Text size="lg">Larger paragraph text.</Text>
 *
 * <!-- Muted text -->
 * <Text variant="muted">Less prominent text.</Text>
 *
 * <!-- Inline span -->
 * <Text as="span" variant="accent">Highlighted text</Text>
 * ```
 */
interface TextProps extends Omit<HTMLAttributes<HTMLElement>, 'class'> {
    /**
     * HTML element to render as (default: 'p').
     */
    as?: 'p' | 'span' | 'div';
    /**
     * Text size variant.
     */
    size?: 'xs' | 'sm' | 'base' | 'lg' | 'xl';
    /**
     * Text color/style variant.
     */
    variant?: 'default' | 'muted' | 'accent' | 'destructive';
    /**
     * Additional CSS classes.
     */
    class?: string;
    /**
     * Text content.
     */
    children?: import('svelte').Snippet;
}
declare const Text: import("svelte").Component<TextProps, {}, "">;
type Text = ReturnType<typeof Text>;
export default Text;
//# sourceMappingURL=Text.svelte.d.ts.map