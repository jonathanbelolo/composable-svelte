/**
 * TreeView Tests
 *
 * Comprehensive tests for tree view component with composable architecture.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestStore } from '../src/lib/test/test-store.js';
import { treeViewReducer } from '../src/lib/components/ui/tree-view/tree-view.reducer.js';
import {
	createInitialTreeViewState,
	type TreeNode,
	type TreeViewState,
	type TreeViewAction
} from '../src/lib/components/ui/tree-view/tree-view.types.js';

describe('TreeView', () => {
	const testNodes: TreeNode[] = [
		{
			id: '1',
			label: 'Folder 1',
			children: [
				{ id: '1-1', label: 'File 1-1' },
				{
					id: '1-2',
					label: 'Subfolder 1-2',
					children: [
						{ id: '1-2-1', label: 'File 1-2-1' },
						{ id: '1-2-2', label: 'File 1-2-2' }
					]
				}
			]
		},
		{
			id: '2',
			label: 'Folder 2',
			children: [{ id: '2-1', label: 'File 2-1' }]
		},
		{
			id: '3',
			label: 'File 3'
		}
	];

	describe('Expand/Collapse Actions', () => {
		it('should expand a node', async () => {
			const store = new TestStore({
				initialState: createInitialTreeViewState(testNodes),
				reducer: treeViewReducer
			});

			await store.send({ type: 'nodeExpanded', nodeId: '1' }, (state) => {
				expect(state.expandedIds.has('1')).toBe(true);
			});
		});

		it('should collapse a node', async () => {
			const store = new TestStore({
				initialState: createInitialTreeViewState(testNodes),
				reducer: treeViewReducer
			});

			await store.send({ type: 'nodeExpanded', nodeId: '1' }, (state) => {
				expect(state.expandedIds.has('1')).toBe(true);
			});

			await store.send({ type: 'nodeCollapsed', nodeId: '1' }, (state) => {
				expect(state.expandedIds.has('1')).toBe(false);
			});
		});

		it('should toggle node expansion', async () => {
			const store = new TestStore({
				initialState: createInitialTreeViewState(testNodes),
				reducer: treeViewReducer
			});

			// Toggle to expand
			await store.send({ type: 'nodeToggled', nodeId: '1' }, (state) => {
				expect(state.expandedIds.has('1')).toBe(true);
			});

			// Toggle to collapse
			await store.send({ type: 'nodeToggled', nodeId: '1' }, (state) => {
				expect(state.expandedIds.has('1')).toBe(false);
			});
		});

		it('should handle expand for non-existent node', async () => {
			const store = new TestStore({
				initialState: createInitialTreeViewState(testNodes),
				reducer: treeViewReducer
			});

			await store.send({ type: 'nodeExpanded', nodeId: 'nonexistent' }, (state) => {
				expect(state.expandedIds.size).toBe(0);
			});
		});

		it('should call onExpand callback when node is expanded', async () => {
			const onExpand = vi.fn();
			const store = new TestStore({
				initialState: createInitialTreeViewState(testNodes),
				reducer: treeViewReducer,
				dependencies: { onExpand }
			});

			await store.send({ type: 'nodeExpanded', nodeId: '1' }, (state) => {
				expect(state.expandedIds.has('1')).toBe(true);
			});

			expect(onExpand).toHaveBeenCalledWith('1', testNodes[0]);
		});

		it('should call onCollapse callback when node is collapsed', async () => {
			const onCollapse = vi.fn();
			const store = new TestStore({
				initialState: createInitialTreeViewState(testNodes),
				reducer: treeViewReducer,
				dependencies: { onCollapse }
			});

			await store.send({ type: 'nodeExpanded', nodeId: '1' });
			await store.send({ type: 'nodeCollapsed', nodeId: '1' }, (state) => {
				expect(state.expandedIds.has('1')).toBe(false);
			});

			expect(onCollapse).toHaveBeenCalledWith('1', testNodes[0]);
		});

		it('should expand multiple nodes independently', async () => {
			const store = new TestStore({
				initialState: createInitialTreeViewState(testNodes),
				reducer: treeViewReducer
			});

			await store.send({ type: 'nodeExpanded', nodeId: '1' }, (state) => {
				expect(state.expandedIds.has('1')).toBe(true);
				expect(state.expandedIds.has('2')).toBe(false);
			});

			await store.send({ type: 'nodeExpanded', nodeId: '2' }, (state) => {
				expect(state.expandedIds.has('1')).toBe(true);
				expect(state.expandedIds.has('2')).toBe(true);
			});
		});
	});

	describe('Selection Actions', () => {
		it('should select a node (single-select mode)', async () => {
			const store = new TestStore({
				initialState: createInitialTreeViewState(testNodes, false),
				reducer: treeViewReducer
			});

			await store.send({ type: 'nodeSelected', nodeId: '1' }, (state) => {
				expect(state.selectedIds.has('1')).toBe(true);
				expect(state.selectedIds.size).toBe(1);
			});
		});

		it('should replace selection in single-select mode', async () => {
			const store = new TestStore({
				initialState: createInitialTreeViewState(testNodes, false),
				reducer: treeViewReducer
			});

			await store.send({ type: 'nodeSelected', nodeId: '1' }, (state) => {
				expect(state.selectedIds.has('1')).toBe(true);
			});

			await store.send({ type: 'nodeSelected', nodeId: '2' }, (state) => {
				expect(state.selectedIds.has('1')).toBe(false);
				expect(state.selectedIds.has('2')).toBe(true);
				expect(state.selectedIds.size).toBe(1);
			});
		});

		it('should toggle selection in multi-select mode', async () => {
			const store = new TestStore({
				initialState: createInitialTreeViewState(testNodes, true),
				reducer: treeViewReducer
			});

			// Select first node
			await store.send({ type: 'nodeSelected', nodeId: '1' }, (state) => {
				expect(state.selectedIds.has('1')).toBe(true);
				expect(state.selectedIds.size).toBe(1);
			});

			// Select second node (adds to selection)
			await store.send({ type: 'nodeSelected', nodeId: '2' }, (state) => {
				expect(state.selectedIds.has('1')).toBe(true);
				expect(state.selectedIds.has('2')).toBe(true);
				expect(state.selectedIds.size).toBe(2);
			});

			// Select first node again (deselects)
			await store.send({ type: 'nodeSelected', nodeId: '1' }, (state) => {
				expect(state.selectedIds.has('1')).toBe(false);
				expect(state.selectedIds.has('2')).toBe(true);
				expect(state.selectedIds.size).toBe(1);
			});
		});

		it('should deselect a specific node', async () => {
			const store = new TestStore({
				initialState: createInitialTreeViewState(testNodes, true),
				reducer: treeViewReducer
			});

			await store.send({ type: 'nodeSelected', nodeId: '1' });
			await store.send({ type: 'nodeSelected', nodeId: '2' });

			await store.send({ type: 'nodeDeselected', nodeId: '1' }, (state) => {
				expect(state.selectedIds.has('1')).toBe(false);
				expect(state.selectedIds.has('2')).toBe(true);
			});
		});

		it('should deselect all nodes', async () => {
			const store = new TestStore({
				initialState: createInitialTreeViewState(testNodes, true),
				reducer: treeViewReducer
			});

			await store.send({ type: 'nodeSelected', nodeId: '1' });
			await store.send({ type: 'nodeSelected', nodeId: '2' });

			await store.send({ type: 'allNodesDeselected' }, (state) => {
				expect(state.selectedIds.size).toBe(0);
			});
		});

		it('should not select disabled node', async () => {
			const nodesWithDisabled: TreeNode[] = [
				{ id: '1', label: 'Node 1', disabled: true },
				{ id: '2', label: 'Node 2' }
			];

			const store = new TestStore({
				initialState: createInitialTreeViewState(nodesWithDisabled),
				reducer: treeViewReducer
			});

			await store.send({ type: 'nodeSelected', nodeId: '1' }, (state) => {
				expect(state.selectedIds.size).toBe(0);
			});
		});

		it('should call onSelect callback when node is selected', async () => {
			const onSelect = vi.fn();
			const store = new TestStore({
				initialState: createInitialTreeViewState(testNodes),
				reducer: treeViewReducer,
				dependencies: { onSelect }
			});

			await store.send({ type: 'nodeSelected', nodeId: '1' });

			expect(onSelect).toHaveBeenCalledWith('1', testNodes[0]);
		});
	});

	describe('Keyboard Navigation', () => {
		it('should move highlight down', async () => {
			const store = new TestStore({ initialState: createInitialTreeViewState(testNodes), reducer: treeViewReducer });

			// Expand first node to make children visible
			await store.send({ type: 'nodeExpanded', nodeId: '1' });

			// Set initial highlight
			await store.send({ type: 'highlightChanged', nodeId: '1' }, (state) => {
				expect(state.highlightedId).toBe('1');
			});

			// Move down
			await store.send({ type: 'arrowDown' }, (state) => {
				expect(state.highlightedId).toBe('1-1');
			});
		});

		it('should move highlight up', async () => {
			const store = new TestStore({ initialState: createInitialTreeViewState(testNodes), reducer: treeViewReducer });

			await store.send({ type: 'nodeExpanded', nodeId: '1' });
			await store.send({ type: 'highlightChanged', nodeId: '1-1' });

			await store.send({ type: 'arrowUp' }, (state) => {
				expect(state.highlightedId).toBe('1');
			});
		});

		it('should expand node on arrow right', async () => {
			const store = new TestStore({ initialState: createInitialTreeViewState(testNodes), reducer: treeViewReducer });

			await store.send({ type: 'highlightChanged', nodeId: '1' });

			await store.send({ type: 'arrowRight' }, (state) => {
				expect(state.expandedIds.has('1')).toBe(true);
			});
		});

		it('should move to first child on arrow right if already expanded', async () => {
			const store = new TestStore({ initialState: createInitialTreeViewState(testNodes), reducer: treeViewReducer });

			await store.send({ type: 'nodeExpanded', nodeId: '1' });
			await store.send({ type: 'highlightChanged', nodeId: '1' });

			await store.send({ type: 'arrowRight' }, (state) => {
				expect(state.highlightedId).toBe('1-1');
			});
		});

		it('should collapse node on arrow left', async () => {
			const store = new TestStore({ initialState: createInitialTreeViewState(testNodes), reducer: treeViewReducer });

			await store.send({ type: 'nodeExpanded', nodeId: '1' });
			await store.send({ type: 'highlightChanged', nodeId: '1' });

			await store.send({ type: 'arrowLeft' }, (state) => {
				expect(state.expandedIds.has('1')).toBe(false);
			});
		});

		it('should move to first visible node on Home', async () => {
			const store = new TestStore({ initialState: createInitialTreeViewState(testNodes), reducer: treeViewReducer });

			await store.send({ type: 'nodeExpanded', nodeId: '1' });
			await store.send({ type: 'highlightChanged', nodeId: '2' });

			await store.send({ type: 'home' }, (state) => {
				expect(state.highlightedId).toBe('1');
			});
		});

		it('should move to last visible node on End', async () => {
			const store = new TestStore({ initialState: createInitialTreeViewState(testNodes), reducer: treeViewReducer });

			await store.send({ type: 'highlightChanged', nodeId: '1' });

			await store.send({ type: 'end' }, (state) => {
				expect(state.highlightedId).toBe('3');
			});
		});

		it('should select highlighted node on Enter', async () => {
			const store = new TestStore({ initialState: createInitialTreeViewState(testNodes), reducer: treeViewReducer });

			await store.send({ type: 'highlightChanged', nodeId: '1' });

			await store.send({ type: 'enter' }, (state) => {
				expect(state.selectedIds.has('1')).toBe(true);
			});
		});

		it('should toggle expansion of highlighted node on Space', async () => {
			const store = new TestStore({ initialState: createInitialTreeViewState(testNodes), reducer: treeViewReducer });

			await store.send({ type: 'highlightChanged', nodeId: '1' });

			await store.send({ type: 'space' }, (state) => {
				expect(state.expandedIds.has('1')).toBe(true);
			});

			await store.send({ type: 'space' }, (state) => {
				expect(state.expandedIds.has('1')).toBe(false);
			});
		});

		it('should do nothing on arrow down at last node', async () => {
			const store = new TestStore({ initialState: createInitialTreeViewState(testNodes), reducer: treeViewReducer });

			await store.send({ type: 'highlightChanged', nodeId: '3' });

			await store.send({ type: 'arrowDown' }, (state) => {
				expect(state.highlightedId).toBe('3');
			});
		});

		it('should do nothing on arrow up at first node', async () => {
			const store = new TestStore({ initialState: createInitialTreeViewState(testNodes), reducer: treeViewReducer });

			await store.send({ type: 'highlightChanged', nodeId: '1' });

			await store.send({ type: 'arrowUp' }, (state) => {
				expect(state.highlightedId).toBe('1');
			});
		});
	});

	describe('Lazy Loading', () => {
		it('should trigger lazy loading when expanding lazy node', async () => {
			vi.useFakeTimers();

			const lazyNodes: TreeNode[] = [
				{ id: '1', label: 'Lazy Folder', lazy: true }
			];

			const loadChildren = vi.fn().mockResolvedValue([
				{ id: '1-1', label: 'Loaded Child 1' },
				{ id: '1-2', label: 'Loaded Child 2' }
			]);

			const store = new TestStore({
				initialState: createInitialTreeViewState(lazyNodes),
				reducer: treeViewReducer,
				dependencies: { loadChildren }
			});

			await store.send({ type: 'nodeExpanded', nodeId: '1' }, (state) => {
				expect(state.expandedIds.has('1')).toBe(true);
				expect(state.loadingIds.has('1')).toBe(true);
			});

			await store.receive({ type: 'childrenLoadingStarted', nodeId: '1' });

			// Wait for async loading to complete
			await vi.runAllTimersAsync();

			await store.receive(
				{
					type: 'childrenLoaded',
					nodeId: '1',
					children: [
						{ id: '1-1', label: 'Loaded Child 1' },
						{ id: '1-2', label: 'Loaded Child 2' }
					]
				},
				(state) => {
					expect(state.loadingIds.has('1')).toBe(false);
					const parentNode = state.nodes.find((n) => n.id === '1');
					expect(parentNode?.children).toHaveLength(2);
					expect(parentNode?.children?.[0]?.label).toBe('Loaded Child 1');
				}
			);

			expect(loadChildren).toHaveBeenCalledWith('1', lazyNodes[0]);

			vi.useRealTimers();
		});

		it('should handle lazy loading failure', async () => {
			vi.useFakeTimers();

			const lazyNodes: TreeNode[] = [
				{ id: '1', label: 'Lazy Folder', lazy: true }
			];

			const loadChildren = vi.fn().mockRejectedValue(new Error('Network error'));

			const store = new TestStore({
				initialState: createInitialTreeViewState(lazyNodes),
				reducer: treeViewReducer,
				dependencies: { loadChildren }
			});

			await store.send({ type: 'nodeExpanded', nodeId: '1' }, (state) => {
				expect(state.expandedIds.has('1')).toBe(true);
				expect(state.loadingIds.has('1')).toBe(true);
			});

			await store.receive({ type: 'childrenLoadingStarted', nodeId: '1' });

			// Wait for async loading to fail
			await vi.runAllTimersAsync();

			await store.receive(
				{
					type: 'childrenLoadingFailed',
					nodeId: '1',
					error: 'Network error'
				},
				(state) => {
					expect(state.loadingIds.has('1')).toBe(false);
					expect(state.expandedIds.has('1')).toBe(false);
				}
			);

			vi.useRealTimers();
		});
	});

	describe('Bulk Operations', () => {
		it('should expand all nodes', async () => {
			const store = new TestStore({ initialState: createInitialTreeViewState(testNodes), reducer: treeViewReducer });

			await store.send({ type: 'expandAll' }, (state) => {
				expect(state.expandedIds.has('1')).toBe(true);
				expect(state.expandedIds.has('1-2')).toBe(true);
				expect(state.expandedIds.has('2')).toBe(true);
			});
		});

		it('should collapse all nodes', async () => {
			const store = new TestStore({ initialState: createInitialTreeViewState(testNodes), reducer: treeViewReducer });

			await store.send({ type: 'expandAll' });
			await store.send({ type: 'collapseAll' }, (state) => {
				expect(state.expandedIds.size).toBe(0);
			});
		});
	});

	describe('State Initialization', () => {
		it('should initialize with empty nodes', () => {
			const state = createInitialTreeViewState();

			expect(state.nodes).toEqual([]);
			expect(state.expandedIds.size).toBe(0);
			expect(state.selectedIds.size).toBe(0);
			expect(state.highlightedId).toBe(null);
			expect(state.isMultiSelect).toBe(false);
		});

		it('should initialize with provided nodes', () => {
			const state = createInitialTreeViewState(testNodes);

			expect(state.nodes).toEqual(testNodes);
		});

		it('should initialize in multi-select mode', () => {
			const state = createInitialTreeViewState(testNodes, true);

			expect(state.isMultiSelect).toBe(true);
		});
	});
});
