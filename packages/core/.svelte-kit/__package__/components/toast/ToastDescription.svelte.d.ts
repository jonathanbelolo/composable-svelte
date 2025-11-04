import type { Snippet } from 'svelte';
import type { HTMLAttributes } from 'svelte/elements';
/**
 * Toast description component.
 *
 * @packageDocumentation
 */
interface ToastDescriptionProps extends Omit<HTMLAttributes<HTMLParagraphElement>, 'class'> {
    class?: string;
    children: Snippet;
}
declare const ToastDescription: import("svelte").Component<ToastDescriptionProps, {}, "">;
type ToastDescription = ReturnType<typeof ToastDescription>;
export default ToastDescription;
//# sourceMappingURL=ToastDescription.svelte.d.ts.map