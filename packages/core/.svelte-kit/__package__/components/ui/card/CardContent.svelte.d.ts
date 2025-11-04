import type { Snippet } from 'svelte';
import type { HTMLAttributes } from 'svelte/elements';
/**
 * Card content component.
 *
 * @packageDocumentation
 */
interface CardContentProps extends Omit<HTMLAttributes<HTMLDivElement>, 'class'> {
    class?: string;
    children: Snippet;
}
declare const CardContent: import("svelte").Component<CardContentProps, {}, "">;
type CardContent = ReturnType<typeof CardContent>;
export default CardContent;
//# sourceMappingURL=CardContent.svelte.d.ts.map