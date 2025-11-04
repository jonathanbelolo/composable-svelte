import type { Snippet } from 'svelte';
import type { HTMLAttributes } from 'svelte/elements';
/**
 * Toast title component.
 *
 * @packageDocumentation
 */
interface ToastTitleProps extends Omit<HTMLAttributes<HTMLHeadingElement>, 'class'> {
    class?: string;
    children: Snippet;
}
declare const ToastTitle: import("svelte").Component<ToastTitleProps, {}, "">;
type ToastTitle = ReturnType<typeof ToastTitle>;
export default ToastTitle;
//# sourceMappingURL=ToastTitle.svelte.d.ts.map