/**
 * TreeView Reducer
 *
 * State management for tree view component (hierarchical data with expand/collapse and selection).
 *
 * @packageDocumentation
 */
import type { Reducer } from '../../../types.js';
import type { TreeViewState, TreeViewAction, TreeViewDependencies } from './tree-view.types.js';
/**
 * TreeView reducer.
 *
 * Handles:
 * - Expand/collapse with animations
 * - Single and multi-select
 * - Keyboard navigation (arrows, home, end, enter, space)
 * - Lazy loading of children
 * - Bulk operations (expandAll, collapseAll)
 *
 * @example
 * ```typescript
 * const store = createStore({
 *   initialState: createInitialTreeViewState(treeNodes),
 *   reducer: treeViewReducer,
 *   dependencies: {
 *     onSelect: (nodeId, node) => console.log('Selected:', node.label),
 *     loadChildren: async (nodeId) => await fetchChildren(nodeId)
 *   }
 * });
 * ```
 */
export declare const treeViewReducer: Reducer<TreeViewState, TreeViewAction, TreeViewDependencies>;
//# sourceMappingURL=tree-view.reducer.d.ts.map