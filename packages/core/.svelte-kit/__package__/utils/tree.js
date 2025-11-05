/**
 * Generic tree manipulation utilities.
 *
 * Provides type-safe, immutable operations for tree structures with arbitrary node types.
 * Works with any tree where some nodes have children and some don't (e.g., folders vs files).
 *
 * @module tree
 */
/**
 * Create tree manipulation helpers for a specific node type.
 *
 * This is a factory function that returns a set of immutable tree operations
 * configured for your specific node structure.
 *
 * @template Node - The tree node type
 * @param config - Configuration defining how to access/update nodes
 * @returns Object with tree manipulation functions
 *
 * @example
 * ```typescript
 * // Define your tree types
 * type FileSystemNode = FileNode | FolderNode;
 *
 * interface FileNode {
 *   type: 'file';
 *   id: string;
 *   name: string;
 * }
 *
 * interface FolderNode {
 *   type: 'folder';
 *   id: string;
 *   name: string;
 *   children: FileSystemNode[];
 * }
 *
 * // Create configured helpers
 * const fileSystemTree = createTreeHelpers<FileSystemNode>({
 *   getId: (node) => node.id,
 *   getChildren: (node) => node.type === 'folder' ? node.children : undefined,
 *   setChildren: (node, children) =>
 *     node.type === 'folder' ? { ...node, children } : node
 * });
 *
 * // Use helpers in reducer
 * const updated = fileSystemTree.updateNode(state.root, 'folder-1', (node) => ({
 *   ...node,
 *   name: 'Renamed'
 * }));
 * ```
 */
export function createTreeHelpers(config) {
    /**
     * Find a node by ID in a tree structure.
     * Performs depth-first search.
     */
    function findNode(nodes, targetId) {
        for (const node of nodes) {
            // Check if this is the target
            if (config.getId(node) === targetId) {
                return node;
            }
            // Recurse into children if this node has them
            const children = config.getChildren(node);
            if (children) {
                const found = findNode(children, targetId);
                if (found)
                    return found;
            }
        }
        return null;
    }
    /**
     * Update a node immutably by ID.
     * Returns new tree with the updated node, or null if not found.
     */
    function updateNode(nodes, targetId, updater) {
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            if (!node)
                continue; // Skip sparse array holes
            // Check if this is the target
            if (config.getId(node) === targetId) {
                // Found target - update it
                const newNodes = [...nodes];
                newNodes[i] = updater(node);
                return newNodes;
            }
            // Recurse into children if this node has them
            const children = config.getChildren(node);
            if (children) {
                const updatedChildren = updateNode(children, targetId, updater);
                if (updatedChildren) {
                    // Child was updated - create new node with updated children
                    const newNodes = [...nodes];
                    newNodes[i] = config.setChildren(node, updatedChildren);
                    return newNodes;
                }
            }
        }
        return null;
    }
    /**
     * Delete a node by ID.
     * Returns new tree without the node, or null if not found.
     */
    function deleteNode(nodes, targetId) {
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            if (!node)
                continue; // Skip sparse array holes
            // Check if this is the target
            if (config.getId(node) === targetId) {
                // Found target - remove it
                const newNodes = [...nodes];
                newNodes.splice(i, 1);
                return newNodes;
            }
            // Recurse into children if this node has them
            const children = config.getChildren(node);
            if (children) {
                const updatedChildren = deleteNode(children, targetId);
                if (updatedChildren) {
                    // Child was deleted - create new node with updated children
                    const newNodes = [...nodes];
                    newNodes[i] = config.setChildren(node, updatedChildren);
                    return newNodes;
                }
            }
        }
        return null;
    }
    /**
     * Add a child to a parent node by ID.
     * Returns new tree with the child added, or null if parent not found.
     */
    function addChild(nodes, parentId, child) {
        return updateNode(nodes, parentId, (node) => {
            const children = config.getChildren(node);
            if (children) {
                // Parent supports children - add the new child
                return config.setChildren(node, [...children, child]);
            }
            // Parent doesn't support children (e.g., file) - return unchanged
            return node;
        });
    }
    return { findNode, updateNode, deleteNode, addChild };
}
