import type { Snippet } from 'svelte';
import type { HTMLAttributes } from 'svelte/elements';
/**
 * Card description component.
 *
 * @packageDocumentation
 */
interface CardDescriptionProps extends Omit<HTMLAttributes<HTMLParagraphElement>, 'class'> {
    class?: string;
    children: Snippet;
}
declare const CardDescription: import("svelte").Component<CardDescriptionProps, {}, "">;
type CardDescription = ReturnType<typeof CardDescription>;
export default CardDescription;
//# sourceMappingURL=CardDescription.svelte.d.ts.map