# File Browser Example

A comprehensive example demonstrating the TreeView component with a file system browser interface.

## Features Demonstrated

- **Hierarchical Tree Structure**: Multi-level folder and file organization
- **Expand/Collapse**: Click arrows or use keyboard to expand/collapse folders
- **Keyboard Navigation**: Full keyboard support
  - `↑↓` - Navigate between nodes
  - `←→` - Collapse/expand or navigate to parent/child
  - `Home/End` - Jump to first/last visible node
  - `Enter` - Select highlighted node
  - `Space` - Toggle expansion
- **Selection State**: Click or press Enter to select files/folders
- **Lazy Loading**: The "composable-svelte" folder demonstrates async loading with spinner
- **Callback Handlers**: `onSelect`, `onExpand`, `onCollapse` callbacks log activity
- **Custom Data Payload**: Each node carries type and size information

## Running the Example

```bash
# Install dependencies (from repository root)
pnpm install

# Run the dev server
cd examples/file-browser
pnpm dev
```

Then open your browser to the URL shown in the terminal (typically http://localhost:5173).

## Implementation Highlights

### Tree Structure

The example uses a nested `TreeNode` structure with custom data:

```typescript
const fileNodes: TreeNode<{ type: 'file' | 'folder'; size?: string }>[] = [
  {
    id: 'root',
    label: '📁 My Documents',
    data: { type: 'folder' },
    children: [
      // ... nested children
    ]
  }
];
```

### Lazy Loading

The `loadChildren` prop enables async loading for nodes marked with `lazy: true`:

```typescript
async function loadChildren(nodeId: string, node: TreeNode<...>): Promise<TreeNode<...>[]> {
  await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate network delay

  if (nodeId === 'composable-svelte') {
    return [
      // ... dynamically loaded children
    ];
  }

  return [];
}
```

### Activity Tracking

Callbacks demonstrate how to observe user interactions:

```typescript
function handleSelect(nodeId: string, node: TreeNode<...>) {
  selectedFile = node.label;
  selectedSize = node.data?.size ?? null;
  log = [`Selected: ${node.label}`, ...log].slice(0, 5);
}
```

## Architecture

This example follows the Composable Architecture pattern:

- **Pure Component**: TreeView is a stateless component that renders based on props
- **Callback Props**: Parent component receives notifications via callbacks
- **Local State**: Parent manages selection and log state using Svelte 5 `$state`
- **Reactive Updates**: UI automatically updates when state changes

## Customization Ideas

Try extending this example:

1. **Context Menu**: Right-click to show file operations (rename, delete, copy)
2. **Drag & Drop**: Implement drag-and-drop to move files between folders
3. **Multi-Select**: Enable `multiSelect={true}` to select multiple files
4. **Search**: Add a search bar to filter visible nodes
5. **Icons**: Use custom icons based on file extensions
6. **Breadcrumbs**: Show the current path at the top

## Component Usage

```svelte
<TreeView
  nodes={fileNodes}
  initialExpandedIds={['root']}
  onSelect={handleSelect}
  onExpand={handleExpand}
  onCollapse={handleCollapse}
  loadChildren={loadChildren}
/>
```

See the [TreeView documentation](../../packages/core/src/components/ui/tree-view/README.md) for full API details.
