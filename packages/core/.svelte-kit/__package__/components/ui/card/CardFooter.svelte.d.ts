import type { Snippet } from 'svelte';
import type { HTMLAttributes } from 'svelte/elements';
/**
 * Card footer component.
 *
 * @packageDocumentation
 */
interface CardFooterProps extends Omit<HTMLAttributes<HTMLDivElement>, 'class'> {
    class?: string;
    children: Snippet;
}
declare const CardFooter: import("svelte").Component<CardFooterProps, {}, "">;
type CardFooter = ReturnType<typeof CardFooter>;
export default CardFooter;
//# sourceMappingURL=CardFooter.svelte.d.ts.map