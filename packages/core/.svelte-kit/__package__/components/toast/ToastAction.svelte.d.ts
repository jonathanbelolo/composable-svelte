import type { Snippet } from 'svelte';
import type { HTMLButtonAttributes } from 'svelte/elements';
/**
 * Toast action button component.
 *
 * @packageDocumentation
 */
interface ToastActionProps extends Omit<HTMLButtonAttributes, 'class'> {
    class?: string;
    children: Snippet;
    onclick?: (e: MouseEvent) => void;
}
declare const ToastAction: import("svelte").Component<ToastActionProps, {}, "">;
type ToastAction = ReturnType<typeof ToastAction>;
export default ToastAction;
//# sourceMappingURL=ToastAction.svelte.d.ts.map