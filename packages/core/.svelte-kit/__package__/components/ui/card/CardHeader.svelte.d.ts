import type { Snippet } from 'svelte';
import type { HTMLAttributes } from 'svelte/elements';
/**
 * Card header component.
 *
 * @packageDocumentation
 */
interface CardHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'class'> {
    class?: string;
    children: Snippet;
}
declare const CardHeader: import("svelte").Component<CardHeaderProps, {}, "">;
type CardHeader = ReturnType<typeof CardHeader>;
export default CardHeader;
//# sourceMappingURL=CardHeader.svelte.d.ts.map