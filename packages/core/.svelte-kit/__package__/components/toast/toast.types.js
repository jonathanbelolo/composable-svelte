/**
 * Toast/Notification Types
 *
 * Defines the state, actions, and types for a reducer-driven toast system
 * with queue management and auto-dismiss functionality.
 */
/**
 * Create initial toast state.
 */
export function createInitialToastState(config) {
    return {
        toasts: [],
        maxToasts: config?.maxToasts ?? 3,
        defaultDuration: config?.defaultDuration ?? 5000,
        position: config?.position ?? 'bottom-right'
    };
}
/**
 * Default ID generator.
 */
export function defaultGenerateId() {
    return `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
/**
 * Helper to create a toast with defaults.
 */
export function createToast(message, options) {
    const messageObj = typeof message === 'string' ? { description: message } : message;
    const toast = {
        variant: options?.variant ?? 'default',
        dismissible: options?.dismissible ?? true
    };
    if (messageObj.title !== undefined) {
        toast.title = messageObj.title;
    }
    if (messageObj.description !== undefined) {
        toast.description = messageObj.description;
    }
    if (options?.duration !== undefined) {
        toast.duration = options.duration;
    }
    if (options?.action !== undefined) {
        toast.action = options.action;
    }
    return toast;
}
