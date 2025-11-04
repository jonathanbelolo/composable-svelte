/**
 * Toast/Notification Types
 *
 * Defines the state, actions, and types for a reducer-driven toast system
 * with queue management and auto-dismiss functionality.
 */

/**
 * Toast variant for styling.
 */
export type ToastVariant = 'default' | 'success' | 'error' | 'warning' | 'info';

/**
 * Individual toast item.
 */
export interface Toast {
	/**
	 * Unique identifier for the toast.
	 */
	id: string;

	/**
	 * Toast variant for styling.
	 */
	variant: ToastVariant;

	/**
	 * Toast title.
	 */
	title?: string;

	/**
	 * Toast description/message.
	 */
	description?: string;

	/**
	 * Auto-dismiss duration in milliseconds.
	 * Set to 0 or null to disable auto-dismiss.
	 */
	duration?: number | null;

	/**
	 * Optional action button.
	 */
	action?: {
		label: string;
		onClick: () => void;
	};

	/**
	 * Whether the toast can be manually dismissed.
	 * Default: true
	 */
	dismissible?: boolean;

	/**
	 * Timestamp when toast was created.
	 */
	createdAt: number;
}

/**
 * Toast State.
 */
export interface ToastState {
	/**
	 * Array of active toasts (ordered oldest to newest).
	 */
	toasts: Toast[];

	/**
	 * Maximum number of toasts to show at once.
	 * Default: 3
	 */
	maxToasts: number;

	/**
	 * Default auto-dismiss duration in milliseconds.
	 * Default: 5000 (5 seconds)
	 */
	defaultDuration: number;

	/**
	 * Position of the toaster on screen.
	 * Default: 'bottom-right'
	 */
	position: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
}

/**
 * Toast Actions.
 */
export type ToastAction =
	| { type: 'toastAdded'; toast: Omit<Toast, 'id' | 'createdAt'> }
	| { type: 'toastDismissed'; id: string }
	| { type: 'toastAutoDismissed'; id: string }
	| { type: 'toastActionClicked'; id: string }
	| { type: 'allToastsDismissed' }
	| { type: 'maxToastsChanged'; maxToasts: number }
	| { type: 'defaultDurationChanged'; duration: number }
	| { type: 'positionChanged'; position: ToastState['position'] };

/**
 * Toast Dependencies.
 */
export interface ToastDependencies {
	/**
	 * Optional callback when a toast is added.
	 */
	onToastAdded?: (toast: Toast) => void;

	/**
	 * Optional callback when a toast is dismissed.
	 */
	onToastDismissed?: (toast: Toast) => void;

	/**
	 * Function to generate unique IDs.
	 * Default: uses Date.now() + random
	 */
	generateId?: () => string;
}

/**
 * Create initial toast state.
 */
export function createInitialToastState(config?: {
	maxToasts?: number;
	defaultDuration?: number;
	position?: ToastState['position'];
}): ToastState {
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
export function defaultGenerateId(): string {
	return `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Helper to create a toast with defaults.
 */
export function createToast(
	message: string | { title?: string; description?: string },
	options?: {
		variant?: ToastVariant;
		duration?: number | null;
		action?: Toast['action'];
		dismissible?: boolean;
	}
): Omit<Toast, 'id' | 'createdAt'> {
	const messageObj = typeof message === 'string' ? { description: message } : message;

	const toast: Omit<Toast, 'id' | 'createdAt'> = {
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
