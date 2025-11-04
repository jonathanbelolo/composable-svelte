import type { TreeNode } from './tree-view.types.js';
/**
 * TreeView component - Hierarchical tree with expand/collapse and selection.
 *
 * Uses Composable Architecture pattern with reducer and store for
 * state management, keyboard navigation, and lazy loading support.
 *
 * @example
 * ```svelte
 * <TreeView
 *   nodes={[
 *     {
 *       id: '1',
 *       label: 'Folder 1',
 *       children: [
 *         { id: '1-1', label: 'File 1-1' },
 *         { id: '1-2', label: 'File 1-2' }
 *       ]
 *     }
 *   ]}
 *   onSelect={(nodeId, node) => console.log('Selected:', node.label)}
 * />
 * ```
 */
interface TreeViewProps<T = string> {
    /**
     * Tree nodes (hierarchical structure).
     */
    nodes: TreeNode<T>[];
    /**
     * Enable multi-select mode (default: false).
     */
    multiSelect?: boolean;
    /**
     * Initially expanded node IDs.
     */
    initialExpandedIds?: string[];
    /**
     * Callback when a node is selected.
     */
    onSelect?: (nodeId: string, node: TreeNode<T>) => void;
    /**
     * Callback when a node is expanded.
     */
    onExpand?: (nodeId: string, node: TreeNode<T>) => void;
    /**
     * Callback when a node is collapsed.
     */
    onCollapse?: (nodeId: string, node: TreeNode<T>) => void;
    /**
     * Async function to load children for lazy-loaded nodes.
     */
    loadChildren?: (nodeId: string, node: TreeNode<T>) => Promise<TreeNode<T>[]>;
    /**
     * Additional CSS classes.
     */
    class?: string;
}
declare const TreeView: import("svelte").Component<TreeViewProps<string>, {}, "">;
type TreeView = ReturnType<typeof TreeView>;
export default TreeView;
//# sourceMappingURL=TreeView.svelte.d.ts.map