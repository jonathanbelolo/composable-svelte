import type { Toast } from './toast.types.js';
/**
 * Individual toast component.
 *
 * @packageDocumentation
 *
 * @example
 * ```svelte
 * <Toast
 *   toast={{ id: '1', variant: 'success', title: 'Success', description: 'Item saved' }}
 *   onDismiss={() => dispatch({ type: 'toastDismissed', id: '1' })}
 * />
 * ```
 */
interface ToastProps {
    /**
     * Toast data.
     */
    toast: Toast;
    /**
     * Callback when toast is dismissed.
     */
    onDismiss: (id: string) => void;
    /**
     * Additional CSS classes.
     */
    class?: string;
}
declare const Toast: import("svelte").Component<ToastProps, {}, "">;
type Toast = ReturnType<typeof Toast>;
export default Toast;
//# sourceMappingURL=Toast.svelte.d.ts.map