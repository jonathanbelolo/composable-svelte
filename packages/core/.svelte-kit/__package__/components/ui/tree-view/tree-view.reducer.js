/**
 * TreeView Reducer
 *
 * State management for tree view component (hierarchical data with expand/collapse and selection).
 *
 * @packageDocumentation
 */
import { Effect } from '../../../effect.js';
/**
 * Recursively find a node by ID in the tree.
 */
function findNodeById(nodes, nodeId) {
    for (const node of nodes) {
        if (node.id === nodeId) {
            return node;
        }
        if (node.children) {
            const found = findNodeById(node.children, nodeId);
            if (found)
                return found;
        }
    }
    return null;
}
/**
 * Get all visible node IDs in depth-first order (considering expansion state).
 * Used for keyboard navigation.
 */
function getAllVisibleNodeIds(nodes, expandedIds) {
    const result = [];
    function traverse(nodeList) {
        for (const node of nodeList) {
            result.push(node.id);
            if (node.children && expandedIds.has(node.id)) {
                traverse(node.children);
            }
        }
    }
    traverse(nodes);
    return result;
}
/**
 * Find parent node ID for a given node.
 */
function findParentNodeId(nodes, targetId, parentId = null) {
    for (const node of nodes) {
        if (node.id === targetId) {
            return parentId;
        }
        if (node.children) {
            const found = findParentNodeId(node.children, targetId, node.id);
            if (found !== null)
                return found;
        }
    }
    return null;
}
/**
 * Recursively get all node IDs in the tree.
 */
function getAllNodeIds(nodes) {
    const result = [];
    function traverse(nodeList) {
        for (const node of nodeList) {
            result.push(node.id);
            if (node.children) {
                traverse(node.children);
            }
        }
    }
    traverse(nodes);
    return result;
}
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
export const treeViewReducer = (state, action, deps) => {
    switch (action.type) {
        case 'nodeExpanded': {
            const node = findNodeById(state.nodes, action.nodeId);
            if (!node) {
                return [state, Effect.none()];
            }
            // If lazy loading and children not loaded yet
            if (node.lazy && (!node.children || node.children.length === 0)) {
                const newExpandedIds = new Set(state.expandedIds);
                newExpandedIds.add(action.nodeId);
                const newLoadingIds = new Set(state.loadingIds);
                newLoadingIds.add(action.nodeId);
                const effects = [];
                // Trigger loading
                if (deps?.loadChildren) {
                    effects.push(Effect.run(async (dispatch) => {
                        dispatch({ type: 'childrenLoadingStarted', nodeId: action.nodeId });
                    }));
                    effects.push(Effect.run(async (dispatch) => {
                        try {
                            const children = await deps.loadChildren(action.nodeId, node);
                            dispatch({
                                type: 'childrenLoaded',
                                nodeId: action.nodeId,
                                children
                            });
                        }
                        catch (error) {
                            dispatch({
                                type: 'childrenLoadingFailed',
                                nodeId: action.nodeId,
                                error: error instanceof Error ? error.message : 'Load failed'
                            });
                        }
                    }));
                }
                // Trigger onExpand callback
                if (deps?.onExpand) {
                    effects.push(Effect.run(async () => {
                        deps.onExpand(action.nodeId, node);
                    }));
                }
                return [
                    {
                        ...state,
                        expandedIds: newExpandedIds,
                        loadingIds: newLoadingIds
                    },
                    Effect.batch(...effects)
                ];
            }
            // Normal expansion (children already loaded or not lazy)
            const newExpandedIds = new Set(state.expandedIds);
            newExpandedIds.add(action.nodeId);
            const onExpandEffect = deps?.onExpand
                ? Effect.run(async () => {
                    deps.onExpand(action.nodeId, node);
                })
                : Effect.none();
            return [
                {
                    ...state,
                    expandedIds: newExpandedIds
                },
                onExpandEffect
            ];
        }
        case 'nodeCollapsed': {
            const node = findNodeById(state.nodes, action.nodeId);
            if (!node) {
                return [state, Effect.none()];
            }
            const newExpandedIds = new Set(state.expandedIds);
            newExpandedIds.delete(action.nodeId);
            const onCollapseEffect = deps?.onCollapse
                ? Effect.run(async () => {
                    deps.onCollapse(action.nodeId, node);
                })
                : Effect.none();
            return [
                {
                    ...state,
                    expandedIds: newExpandedIds
                },
                onCollapseEffect
            ];
        }
        case 'nodeToggled': {
            const isExpanded = state.expandedIds.has(action.nodeId);
            if (isExpanded) {
                return treeViewReducer(state, { type: 'nodeCollapsed', nodeId: action.nodeId }, deps);
            }
            else {
                return treeViewReducer(state, { type: 'nodeExpanded', nodeId: action.nodeId }, deps);
            }
        }
        case 'nodeSelected': {
            const node = findNodeById(state.nodes, action.nodeId);
            if (!node || node.disabled) {
                return [state, Effect.none()];
            }
            let newSelectedIds;
            if (state.isMultiSelect) {
                // Multi-select: toggle selection
                newSelectedIds = new Set(state.selectedIds);
                if (newSelectedIds.has(action.nodeId)) {
                    newSelectedIds.delete(action.nodeId);
                }
                else {
                    newSelectedIds.add(action.nodeId);
                }
            }
            else {
                // Single-select: replace selection
                newSelectedIds = new Set([action.nodeId]);
            }
            const onSelectEffect = deps?.onSelect
                ? Effect.run(async () => {
                    deps.onSelect(action.nodeId, node);
                })
                : Effect.none();
            return [
                {
                    ...state,
                    selectedIds: newSelectedIds
                },
                onSelectEffect
            ];
        }
        case 'nodeDeselected': {
            const newSelectedIds = new Set(state.selectedIds);
            newSelectedIds.delete(action.nodeId);
            return [
                {
                    ...state,
                    selectedIds: newSelectedIds
                },
                Effect.none()
            ];
        }
        case 'allNodesDeselected': {
            return [
                {
                    ...state,
                    selectedIds: new Set()
                },
                Effect.none()
            ];
        }
        case 'highlightChanged': {
            return [
                {
                    ...state,
                    highlightedId: action.nodeId
                },
                Effect.none()
            ];
        }
        case 'arrowDown': {
            const visibleIds = getAllVisibleNodeIds(state.nodes, state.expandedIds);
            if (visibleIds.length === 0) {
                return [state, Effect.none()];
            }
            const currentIndex = state.highlightedId
                ? visibleIds.indexOf(state.highlightedId)
                : -1;
            const nextIndex = currentIndex + 1;
            if (nextIndex < visibleIds.length) {
                return [
                    {
                        ...state,
                        highlightedId: visibleIds[nextIndex]
                    },
                    Effect.none()
                ];
            }
            return [state, Effect.none()];
        }
        case 'arrowUp': {
            const visibleIds = getAllVisibleNodeIds(state.nodes, state.expandedIds);
            if (visibleIds.length === 0) {
                return [state, Effect.none()];
            }
            const currentIndex = state.highlightedId
                ? visibleIds.indexOf(state.highlightedId)
                : -1;
            const prevIndex = currentIndex - 1;
            if (prevIndex >= 0) {
                return [
                    {
                        ...state,
                        highlightedId: visibleIds[prevIndex]
                    },
                    Effect.none()
                ];
            }
            return [state, Effect.none()];
        }
        case 'arrowRight': {
            if (!state.highlightedId) {
                return [state, Effect.none()];
            }
            const node = findNodeById(state.nodes, state.highlightedId);
            if (!node) {
                return [state, Effect.none()];
            }
            // If node has children and is collapsed, expand it
            if (node.children && node.children.length > 0 && !state.expandedIds.has(node.id)) {
                return treeViewReducer(state, { type: 'nodeExpanded', nodeId: node.id }, deps);
            }
            // If node is already expanded and has children, move to first child
            if (node.children &&
                node.children.length > 0 &&
                state.expandedIds.has(node.id)) {
                return [
                    {
                        ...state,
                        highlightedId: node.children[0].id
                    },
                    Effect.none()
                ];
            }
            return [state, Effect.none()];
        }
        case 'arrowLeft': {
            if (!state.highlightedId) {
                return [state, Effect.none()];
            }
            const node = findNodeById(state.nodes, state.highlightedId);
            if (!node) {
                return [state, Effect.none()];
            }
            // If node is expanded, collapse it
            if (state.expandedIds.has(node.id)) {
                return treeViewReducer(state, { type: 'nodeCollapsed', nodeId: node.id }, deps);
            }
            // Otherwise, move to parent
            const parentId = findParentNodeId(state.nodes, node.id);
            if (parentId) {
                return [
                    {
                        ...state,
                        highlightedId: parentId
                    },
                    Effect.none()
                ];
            }
            return [state, Effect.none()];
        }
        case 'home': {
            const visibleIds = getAllVisibleNodeIds(state.nodes, state.expandedIds);
            if (visibleIds.length === 0) {
                return [state, Effect.none()];
            }
            return [
                {
                    ...state,
                    highlightedId: visibleIds[0]
                },
                Effect.none()
            ];
        }
        case 'end': {
            const visibleIds = getAllVisibleNodeIds(state.nodes, state.expandedIds);
            if (visibleIds.length === 0) {
                return [state, Effect.none()];
            }
            return [
                {
                    ...state,
                    highlightedId: visibleIds[visibleIds.length - 1]
                },
                Effect.none()
            ];
        }
        case 'enter': {
            if (!state.highlightedId) {
                return [state, Effect.none()];
            }
            // Select the highlighted node
            return treeViewReducer(state, { type: 'nodeSelected', nodeId: state.highlightedId }, deps);
        }
        case 'space': {
            if (!state.highlightedId) {
                return [state, Effect.none()];
            }
            // Toggle expansion of the highlighted node
            return treeViewReducer(state, { type: 'nodeToggled', nodeId: state.highlightedId }, deps);
        }
        case 'childrenLoadingStarted': {
            // Already handled in nodeExpanded case
            return [state, Effect.none()];
        }
        case 'childrenLoaded': {
            // Update the node's children
            const nodeId = action.nodeId;
            const children = action.children;
            function updateNodeChildren(nodes) {
                return nodes.map((node) => {
                    if (node.id === nodeId) {
                        return {
                            ...node,
                            children: children
                        };
                    }
                    if (node.children) {
                        return {
                            ...node,
                            children: updateNodeChildren(node.children)
                        };
                    }
                    return node;
                });
            }
            const newLoadingIds = new Set(state.loadingIds);
            newLoadingIds.delete(action.nodeId);
            return [
                {
                    ...state,
                    nodes: updateNodeChildren(state.nodes),
                    loadingIds: newLoadingIds
                },
                Effect.none()
            ];
        }
        case 'childrenLoadingFailed': {
            const newLoadingIds = new Set(state.loadingIds);
            newLoadingIds.delete(action.nodeId);
            const newExpandedIds = new Set(state.expandedIds);
            newExpandedIds.delete(action.nodeId);
            return [
                {
                    ...state,
                    expandedIds: newExpandedIds,
                    loadingIds: newLoadingIds
                },
                Effect.none()
            ];
        }
        case 'expandAll': {
            const allIds = getAllNodeIds(state.nodes);
            const newExpandedIds = new Set(allIds);
            return [
                {
                    ...state,
                    expandedIds: newExpandedIds
                },
                Effect.none()
            ];
        }
        case 'collapseAll': {
            return [
                {
                    ...state,
                    expandedIds: new Set()
                },
                Effect.none()
            ];
        }
        default: {
            const _exhaustive = action;
            return [state, Effect.none()];
        }
    }
};
