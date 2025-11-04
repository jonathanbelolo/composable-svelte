import type { Snippet } from 'svelte';
import type { HTMLAttributes } from 'svelte/elements';
/**
 * Card title component.
 *
 * @packageDocumentation
 */
interface CardTitleProps extends Omit<HTMLAttributes<HTMLHeadingElement>, 'class'> {
    class?: string;
    children: Snippet;
}
declare const CardTitle: import("svelte").Component<CardTitleProps, {}, "">;
type CardTitle = ReturnType<typeof CardTitle>;
export default CardTitle;
//# sourceMappingURL=CardTitle.svelte.d.ts.map