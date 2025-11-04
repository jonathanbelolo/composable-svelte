import { describe, it, expect } from 'vitest';
import { createTreeHelpers, type TreeConfig } from '../../src/lib/utils/tree.js';

// ============================================================================
// Test Types - File System Example
// ============================================================================

type FileSystemNode = FileNode | FolderNode;

interface FileNode {
	type: 'file';
	id: string;
	name: string;
}

interface FolderNode {
	type: 'folder';
	id: string;
	name: string;
	children: FileSystemNode[];
}

// ============================================================================
// Helper to Create Test Data
// ============================================================================

const createFile = (id: string, name: string): FileNode => ({
	type: 'file',
	id,
	name
});

const createFolder = (id: string, name: string, children: FileSystemNode[] = []): FolderNode => ({
	type: 'folder',
	id,
	name,
	children
});

// Sample tree structure:
//
// root/
// ├── projects/
// │   ├── README.md
// │   └── src/
// │       └── index.ts
// └── notes.txt
//
const createSampleTree = (): FileSystemNode[] => [
	createFolder('root', 'root', [
		createFolder('projects', 'projects', [
			createFile('readme', 'README.md'),
			createFolder('src', 'src', [createFile('index', 'index.ts')])
		]),
		createFile('notes', 'notes.txt')
	])
];

// ============================================================================
// Tree Config
// ============================================================================

const fileSystemConfig: TreeConfig<FileSystemNode> = {
	getId: (node) => node.id,
	getChildren: (node) => (node.type === 'folder' ? node.children : undefined),
	setChildren: (node, children) => (node.type === 'folder' ? { ...node, children } : node)
};

const tree = createTreeHelpers(fileSystemConfig);

// ============================================================================
// Tests
// ============================================================================

describe('createTreeHelpers', () => {
	describe('findNode', () => {
		it('should find node at root level', () => {
			const nodes = createSampleTree();
			const found = tree.findNode(nodes, 'root');

			expect(found).toBeDefined();
			expect(found?.id).toBe('root');
			expect(found?.name).toBe('root');
		});

		it('should find node at first child level', () => {
			const nodes = createSampleTree();
			const found = tree.findNode(nodes, 'projects');

			expect(found).toBeDefined();
			expect(found?.id).toBe('projects');
			expect(found?.name).toBe('projects');
		});

		it('should find deeply nested node', () => {
			const nodes = createSampleTree();
			const found = tree.findNode(nodes, 'index');

			expect(found).toBeDefined();
			expect(found?.id).toBe('index');
			expect(found?.name).toBe('index.ts');
		});

		it('should find file node', () => {
			const nodes = createSampleTree();
			const found = tree.findNode(nodes, 'readme');

			expect(found).toBeDefined();
			expect(found?.type).toBe('file');
			expect(found?.name).toBe('README.md');
		});

		it('should return null for non-existent node', () => {
			const nodes = createSampleTree();
			const found = tree.findNode(nodes, 'non-existent');

			expect(found).toBeNull();
		});

		it('should return null for empty tree', () => {
			const found = tree.findNode([], 'any-id');
			expect(found).toBeNull();
		});

		it('should handle tree with multiple root nodes', () => {
			const nodes = [
				createFolder('folder1', 'Folder 1'),
				createFile('file1', 'file1.txt'),
				createFolder('folder2', 'Folder 2')
			];

			expect(tree.findNode(nodes, 'folder1')?.id).toBe('folder1');
			expect(tree.findNode(nodes, 'file1')?.id).toBe('file1');
			expect(tree.findNode(nodes, 'folder2')?.id).toBe('folder2');
		});
	});

	describe('updateNode', () => {
		it('should update node at root level', () => {
			const nodes = createSampleTree();
			const updated = tree.updateNode(nodes, 'root', (node) => ({
				...node,
				name: 'Updated Root'
			}));

			expect(updated).toBeDefined();
			const found = tree.findNode(updated!, 'root');
			expect(found?.name).toBe('Updated Root');
		});

		it('should update first-level child', () => {
			const nodes = createSampleTree();
			const updated = tree.updateNode(nodes, 'projects', (node) => ({
				...node,
				name: 'My Projects'
			}));

			expect(updated).toBeDefined();
			const found = tree.findNode(updated!, 'projects');
			expect(found?.name).toBe('My Projects');
		});

		it('should update deeply nested node', () => {
			const nodes = createSampleTree();
			const updated = tree.updateNode(nodes, 'index', (node) => ({
				...node,
				name: 'main.ts'
			}));

			expect(updated).toBeDefined();
			const found = tree.findNode(updated!, 'index');
			expect(found?.name).toBe('main.ts');
		});

		it('should maintain immutability - original tree unchanged', () => {
			const nodes = createSampleTree();
			const originalName = tree.findNode(nodes, 'projects')?.name;

			const updated = tree.updateNode(nodes, 'projects', (node) => ({
				...node,
				name: 'Changed'
			}));

			// Original unchanged
			expect(tree.findNode(nodes, 'projects')?.name).toBe(originalName);
			// Updated changed
			expect(tree.findNode(updated!, 'projects')?.name).toBe('Changed');
		});

		it('should return null for non-existent node', () => {
			const nodes = createSampleTree();
			const updated = tree.updateNode(nodes, 'non-existent', (node) => node);

			expect(updated).toBeNull();
		});

		it('should return null for empty tree', () => {
			const updated = tree.updateNode([], 'any-id', (node) => node);
			expect(updated).toBeNull();
		});

		it('should update folder children reference while maintaining structure', () => {
			const nodes = createSampleTree();
			const updated = tree.updateNode(nodes, 'src', (node) => ({
				...node,
				name: 'source'
			}));

			expect(updated).toBeDefined();

			// Verify structure preserved
			const root = tree.findNode(updated!, 'root') as FolderNode;
			const projects = tree.findNode(updated!, 'projects') as FolderNode;
			const src = tree.findNode(updated!, 'src') as FolderNode;

			expect(root.children).toHaveLength(2);
			expect(projects.children).toHaveLength(2);
			expect(src.children).toHaveLength(1);
			expect(src.name).toBe('source');
		});
	});

	describe('deleteNode', () => {
		it('should delete node at root level', () => {
			const nodes = createSampleTree();
			const deleted = tree.deleteNode(nodes, 'root');

			expect(deleted).toBeDefined();
			expect(deleted).toHaveLength(0); // Root was the only node
		});

		it('should delete first-level child', () => {
			const nodes = createSampleTree();
			const deleted = tree.deleteNode(nodes, 'projects');

			expect(deleted).toBeDefined();
			const root = tree.findNode(deleted!, 'root') as FolderNode;
			expect(root.children).toHaveLength(1);
			expect(root.children[0].id).toBe('notes');
			expect(tree.findNode(deleted!, 'projects')).toBeNull();
		});

		it('should delete deeply nested node', () => {
			const nodes = createSampleTree();
			const deleted = tree.deleteNode(nodes, 'index');

			expect(deleted).toBeDefined();
			const src = tree.findNode(deleted!, 'src') as FolderNode;
			expect(src.children).toHaveLength(0);
			expect(tree.findNode(deleted!, 'index')).toBeNull();
		});

		it('should maintain immutability - original tree unchanged', () => {
			const nodes = createSampleTree();
			const originalProjectsExists = tree.findNode(nodes, 'projects') !== null;

			const deleted = tree.deleteNode(nodes, 'projects');

			// Original unchanged
			expect(tree.findNode(nodes, 'projects') !== null).toBe(originalProjectsExists);
			// Deleted gone
			expect(tree.findNode(deleted!, 'projects')).toBeNull();
		});

		it('should return null for non-existent node', () => {
			const nodes = createSampleTree();
			const deleted = tree.deleteNode(nodes, 'non-existent');

			expect(deleted).toBeNull();
		});

		it('should return null for empty tree', () => {
			const deleted = tree.deleteNode([], 'any-id');
			expect(deleted).toBeNull();
		});

		it('should delete folder with all its children', () => {
			const nodes = createSampleTree();
			const deleted = tree.deleteNode(nodes, 'projects');

			expect(deleted).toBeDefined();
			// Projects and all children should be gone
			expect(tree.findNode(deleted!, 'projects')).toBeNull();
			expect(tree.findNode(deleted!, 'readme')).toBeNull();
			expect(tree.findNode(deleted!, 'src')).toBeNull();
			expect(tree.findNode(deleted!, 'index')).toBeNull();

			// But notes should remain
			expect(tree.findNode(deleted!, 'notes')).toBeDefined();
		});
	});

	describe('addChild', () => {
		it('should add child to folder at root level', () => {
			const nodes = createSampleTree();
			const newFile = createFile('new-file', 'new-file.txt');
			const updated = tree.addChild(nodes, 'root', newFile);

			expect(updated).toBeDefined();
			const root = tree.findNode(updated!, 'root') as FolderNode;
			expect(root.children).toHaveLength(3);
			expect(tree.findNode(updated!, 'new-file')?.name).toBe('new-file.txt');
		});

		it('should add child to nested folder', () => {
			const nodes = createSampleTree();
			const newFile = createFile('new-file', 'component.ts');
			const updated = tree.addChild(nodes, 'src', newFile);

			expect(updated).toBeDefined();
			const src = tree.findNode(updated!, 'src') as FolderNode;
			expect(src.children).toHaveLength(2);
			expect(tree.findNode(updated!, 'new-file')?.name).toBe('component.ts');
		});

		it('should add folder to folder', () => {
			const nodes = createSampleTree();
			const newFolder = createFolder('tests', 'tests', []);
			const updated = tree.addChild(nodes, 'projects', newFolder);

			expect(updated).toBeDefined();
			const projects = tree.findNode(updated!, 'projects') as FolderNode;
			expect(projects.children).toHaveLength(3);
			expect(tree.findNode(updated!, 'tests')?.name).toBe('tests');
		});

		it('should not add child to file node', () => {
			const nodes = createSampleTree();
			const newFile = createFile('invalid', 'invalid.txt');
			const updated = tree.addChild(nodes, 'readme', newFile);

			expect(updated).toBeDefined();
			// Tree structure should be unchanged except parent node replaced
			expect(tree.findNode(updated!, 'invalid')).toBeNull();
		});

		it('should maintain immutability - original tree unchanged', () => {
			const nodes = createSampleTree();
			const root = tree.findNode(nodes, 'root') as FolderNode;
			const originalChildCount = root.children.length;

			const newFile = createFile('new-file', 'new-file.txt');
			const updated = tree.addChild(nodes, 'root', newFile);

			// Original unchanged
			const originalRoot = tree.findNode(nodes, 'root') as FolderNode;
			expect(originalRoot.children).toHaveLength(originalChildCount);

			// Updated changed
			const updatedRoot = tree.findNode(updated!, 'root') as FolderNode;
			expect(updatedRoot.children).toHaveLength(originalChildCount + 1);
		});

		it('should return null for non-existent parent', () => {
			const nodes = createSampleTree();
			const newFile = createFile('new-file', 'new-file.txt');
			const updated = tree.addChild(nodes, 'non-existent', newFile);

			expect(updated).toBeNull();
		});

		it('should return null for empty tree', () => {
			const newFile = createFile('new-file', 'new-file.txt');
			const updated = tree.addChild([], 'any-id', newFile);

			expect(updated).toBeNull();
		});
	});

	describe('edge cases', () => {
		it('should handle single file tree', () => {
			const nodes = [createFile('file1', 'file.txt')];

			expect(tree.findNode(nodes, 'file1')?.name).toBe('file.txt');

			const updated = tree.updateNode(nodes, 'file1', (node) => ({
				...node,
				name: 'renamed.txt'
			}));
			expect(tree.findNode(updated!, 'file1')?.name).toBe('renamed.txt');

			const deleted = tree.deleteNode(nodes, 'file1');
			expect(deleted).toHaveLength(0);
		});

		it('should handle single folder tree', () => {
			const nodes = [createFolder('folder1', 'Folder')];

			const newFile = createFile('file1', 'file.txt');
			const updated = tree.addChild(nodes, 'folder1', newFile);

			expect(updated).toBeDefined();
			const folder = tree.findNode(updated!, 'folder1') as FolderNode;
			expect(folder.children).toHaveLength(1);
		});

		it('should handle very deep nesting', () => {
			const deep = createFolder('l1', 'Level 1', [
				createFolder('l2', 'Level 2', [
					createFolder('l3', 'Level 3', [
						createFolder('l4', 'Level 4', [
							createFolder('l5', 'Level 5', [createFile('deep-file', 'deep.txt')])
						])
					])
				])
			]);

			const nodes = [deep];

			// Find deeply nested
			expect(tree.findNode(nodes, 'deep-file')?.name).toBe('deep.txt');

			// Update deeply nested
			const updated = tree.updateNode(nodes, 'deep-file', (node) => ({
				...node,
				name: 'very-deep.txt'
			}));
			expect(tree.findNode(updated!, 'deep-file')?.name).toBe('very-deep.txt');

			// Delete deeply nested
			const deleted = tree.deleteNode(nodes, 'deep-file');
			const l5 = tree.findNode(deleted!, 'l5') as FolderNode;
			expect(l5.children).toHaveLength(0);
		});

		it('should handle folder with many children', () => {
			const children = Array.from({ length: 100 }, (_, i) => createFile(`file-${i}`, `file-${i}.txt`));
			const nodes = [createFolder('parent', 'Parent', children)];

			// Find one
			expect(tree.findNode(nodes, 'file-50')?.name).toBe('file-50.txt');

			// Update one
			const updated = tree.updateNode(nodes, 'file-50', (node) => ({
				...node,
				name: 'renamed-50.txt'
			}));
			expect(tree.findNode(updated!, 'file-50')?.name).toBe('renamed-50.txt');

			// Delete one
			const deleted = tree.deleteNode(nodes, 'file-50');
			const parent = tree.findNode(deleted!, 'parent') as FolderNode;
			expect(parent.children).toHaveLength(99);
		});
	});

	describe('type safety', () => {
		it('should maintain discriminated union types', () => {
			const nodes = createSampleTree();
			const found = tree.findNode(nodes, 'projects');

			if (found?.type === 'folder') {
				// TypeScript should know this has children
				expect(found.children).toBeDefined();
			} else {
				throw new Error('Expected folder type');
			}
		});

		it('should allow updater to change node properties', () => {
			const nodes = createSampleTree();
			const updated = tree.updateNode(nodes, 'readme', (node) => {
				if (node.type === 'file') {
					return { ...node, name: 'NEW-README.md' };
				}
				return node;
			});

			const found = tree.findNode(updated!, 'readme');
			expect(found?.name).toBe('NEW-README.md');
		});
	});
});
