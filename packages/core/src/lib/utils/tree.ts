/**
 * Generic tree manipulation utilities.
 *
 * Provides type-safe, immutable operations for tree structures with arbitrary node types.
 * Works with any tree where some nodes have children and some don't (e.g., folders vs files).
 *
 * @module tree
 */

/**
 * Configuration for tree operations.
 *
 * Defines how to access and update tree node properties for a specific node type.
 *
 * @template Node - The tree node type
 *
 * @example
 * ```typescript
 * // For a file system with discriminated union:
 * type FileNode = { type: 'file'; id: string; name: string };
 * type FolderNode = { type: 'folder'; id: string; name: string; children: Node[] };
 * type Node = FileNode | FolderNode;
 *
 * const config: TreeConfig<Node> = {
 *   getId: (node) => node.id,
 *   getChildren: (node) => node.type === 'folder' ? node.children : undefined,
 *   setChildren: (node, children) =>
 *     node.type === 'folder' ? { ...node, children } : node
 * };
 * ```
 */
export interface TreeConfig<Node> {
	/**
	 * Extract the unique identifier from a node.
	 *
	 * @param node - The tree node
	 * @returns The node's unique identifier
	 */
	getId: (node: Node) => string;

	/**
	 * Get children of a node, if any.
	 *
	 * @param node - The tree node
	 * @returns Array of children if node has them, undefined otherwise
	 */
	getChildren: (node: Node) => Node[] | undefined;

	/**
	 * Create a new node with updated children.
	 *
	 * Should return the node unchanged if it doesn't support children.
	 *
	 * @param node - The tree node
	 * @param children - The new children array
	 * @returns New node with updated children (or original node if no children supported)
	 */
	setChildren: (node: Node, children: Node[]) => Node;
}

/**
 * Tree manipulation functions for a specific node type.
 *
 * All operations are immutable - they return new trees without modifying inputs.
 *
 * @template Node - The tree node type
 */
export interface TreeHelpers<Node> {
	/**
	 * Find a node by ID in the tree.
	 *
	 * Performs depth-first search through the tree structure.
	 *
	 * @param nodes - Array of root nodes to search
	 * @param targetId - ID of the node to find
	 * @returns The found node, or null if not found
	 *
	 * @example
	 * ```typescript
	 * const found = helpers.findNode(tree, 'folder-123');
	 * if (found) {
	 *   console.log('Found:', found.name);
	 * }
	 * ```
	 */
	findNode(nodes: Node[], targetId: string): Node | null;

	/**
	 * Update a node by ID immutably.
	 *
	 * Creates a new tree with the specified node updated. All parent nodes
	 * are also cloned to maintain immutability.
	 *
	 * @param nodes - Array of root nodes
	 * @param targetId - ID of the node to update
	 * @param updater - Function that transforms the found node
	 * @returns New tree with updated node, or null if node not found
	 *
	 * @example
	 * ```typescript
	 * const newTree = helpers.updateNode(tree, 'file-456', (node) => ({
	 *   ...node,
	 *   name: 'renamed.txt'
	 * }));
	 * ```
	 */
	updateNode(nodes: Node[], targetId: string, updater: (node: Node) => Node): Node[] | null;

	/**
	 * Delete a node by ID immutably.
	 *
	 * Creates a new tree without the specified node. All parent nodes
	 * are cloned to maintain immutability.
	 *
	 * @param nodes - Array of root nodes
	 * @param targetId - ID of the node to delete
	 * @returns New tree without the node, or null if node not found
	 *
	 * @example
	 * ```typescript
	 * const newTree = helpers.deleteNode(tree, 'file-789');
	 * if (newTree) {
	 *   console.log('Node deleted');
	 * }
	 * ```
	 */
	deleteNode(nodes: Node[], targetId: string): Node[] | null;

	/**
	 * Add a child to a parent node by ID.
	 *
	 * Creates a new tree with the child added to the specified parent's children.
	 * If the parent doesn't support children (e.g., a file), no change is made.
	 *
	 * @param nodes - Array of root nodes
	 * @param parentId - ID of the parent node
	 * @param child - The new child node to add
	 * @returns New tree with child added, or null if parent not found
	 *
	 * @example
	 * ```typescript
	 * const newTree = helpers.addChild(tree, 'folder-123', {
	 *   type: 'file',
	 *   id: 'file-999',
	 *   name: 'new-file.txt'
	 * });
	 * ```
	 */
	addChild(nodes: Node[], parentId: string, child: Node): Node[] | null;
}

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
export function createTreeHelpers<Node>(config: TreeConfig<Node>): TreeHelpers<Node> {
	/**
	 * Find a node by ID in a tree structure.
	 * Performs depth-first search.
	 */
	function findNode(nodes: Node[], targetId: string): Node | null {
		for (const node of nodes) {
			// Check if this is the target
			if (config.getId(node) === targetId) {
				return node;
			}

			// Recurse into children if this node has them
			const children = config.getChildren(node);
			if (children) {
				const found = findNode(children, targetId);
				if (found) return found;
			}
		}
		return null;
	}

	/**
	 * Update a node immutably by ID.
	 * Returns new tree with the updated node, or null if not found.
	 */
	function updateNode(
		nodes: Node[],
		targetId: string,
		updater: (node: Node) => Node
	): Node[] | null {
		for (let i = 0; i < nodes.length; i++) {
			const node = nodes[i];

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
	function deleteNode(nodes: Node[], targetId: string): Node[] | null {
		for (let i = 0; i < nodes.length; i++) {
			const node = nodes[i];

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
	function addChild(nodes: Node[], parentId: string, child: Node): Node[] | null {
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
