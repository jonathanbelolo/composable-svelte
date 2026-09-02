/**
 * Navigation Components
 *
 * Styled navigation components with Tailwind CSS defaults.
 * For headless components, import from './primitives'.
 */

export { default as Modal } from './Modal.svelte';
export { default as Sheet } from './Sheet.svelte';
export { default as Alert } from './Alert.svelte';
export { default as Drawer } from './Drawer.svelte';
export { default as Popover } from './Popover.svelte';
export { default as Sidebar } from './Sidebar.svelte';
export { default as Tabs } from './Tabs.svelte';
export { default as NavigationStack } from './NavigationStack.svelte';
export { default as AnimatedNavigationStack } from './AnimatedNavigationStack.svelte';
export { default as DestinationRouter } from './DestinationRouter.svelte';
export type {
	RouteConfig,
	DestinationRouterProps
} from './destination-router.types.js';

// Headless primitives. Also available from the package root; re-exported here so
// this subpath is a complete view of the navigation surface.
export * from './primitives/index.js';

// Alert dialog — a titled confirmation, composed over `Alert`.
export {
	AlertDialog,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogAction,
	AlertDialogCancel
} from './alert-dialog/index.js';
