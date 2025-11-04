import type { MenuItem } from './dropdown-menu.types.js';
import type { Snippet } from 'svelte';
/**
 * DropdownMenu component - Interactive menu with keyboard navigation.
 *
 * Uses Composable Architecture pattern with reducer and store for
 * keyboard navigation and state management.
 *
 * @example
 * ```svelte
 * <DropdownMenu
 *   items={[
 *     { id: '1', label: 'Edit', icon: 'pencil' },
 *     { id: '2', label: 'Delete', icon: 'trash' },
 *     { id: 'sep1', isSeparator: true },
 *     { id: '3', label: 'Archive', icon: 'archive' }
 *   ]}
 *   onSelect={(item) => console.log(item.label)}
 * >
 *   <Button>Actions</Button>
 * </DropdownMenu>
 * ```
 */
interface DropdownMenuProps {
    /**
     * Menu items to display.
     */
    items: MenuItem[];
    /**
     * Callback when an item is selected.
     */
    onSelect?: (item: MenuItem) => void;
    /**
     * Menu alignment relative to trigger.
     * @default 'start'
     */
    align?: 'start' | 'end';
    /**
     * Additional CSS classes for menu container.
     */
    class?: string;
    /**
     * Trigger element (button/link).
     */
    children: Snippet;
}
declare const DropdownMenu: import("svelte").Component<DropdownMenuProps, {}, "">;
type DropdownMenu = ReturnType<typeof DropdownMenu>;
export default DropdownMenu;
//# sourceMappingURL=DropdownMenu.svelte.d.ts.map