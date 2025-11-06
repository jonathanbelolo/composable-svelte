# NodeCanvas Component

A node-based canvas editor component for Svelte 5, built on [SvelteFlow](https://svelteflow.dev) and following the Composable Architecture pattern.

## Features

- ✅ **Drag & Drop Nodes**: Interactive node positioning with optional grid snapping
- ✅ **Type-Safe Connections**: Connection validation with port type checking
- ✅ **Cycle Detection**: Prevents circular dependencies automatically
- ✅ **Mini-Map & Controls**: Built-in navigation helpers
- ✅ **Composable Architecture**: Pure reducers, effects, and testable state
- ✅ **Custom Nodes**: Easy to create custom node components
- ✅ **Auto-Layout**: Optional automatic node positioning (via dependencies)
- ✅ **Import/Export**: Save and load canvas state as JSON

## Installation

```bash
pnpm add @composable-svelte/code @composable-svelte/core @xyflow/svelte
```

## Quick Start

```typescript
import { createStore } from '@composable-svelte/core';
import {
  NodeCanvas,
  nodeCanvasReducer,
  createInitialNodeCanvasState,
  type NodeCanvasAction
} from '@composable-svelte/code';

// Create store
const store = createStore({
  initialState: createInitialNodeCanvasState(),
  reducer: nodeCanvasReducer
});
```

```svelte
<script>
  import { NodeCanvas } from '@composable-svelte/code';
  const liftAction = (action) => action; // Identity function for simple case
</script>

<div style="width: 100%; height: 600px;">
  <NodeCanvas {store} {liftAction} />
</div>
```

## Documentation

See [EXAMPLE.md](./EXAMPLE.md) for a complete working example with:
- Custom node components
- Type-safe connection validation
- Toolbar actions
- Testing examples

## API Reference

### State & Actions

The component follows Composable Architecture patterns with pure reducers and declarative state:

- **State**: `NodeCanvasState<NodeData, EdgeData>`
- **Actions**: `NodeCanvasAction<NodeData, EdgeData>`
- **Reducer**: `nodeCanvasReducer(state, action, deps)`

### Connection Validation

```typescript
import { createConnectionValidator } from '@composable-svelte/code';

const nodeTypes = {
  input: {
    type: 'input',
    label: 'Input',
    outputs: [{ id: 'out', label: 'Output', dataType: 'string' }]
  },
  // ... more node types
};

const deps = {
  validateConnection: createConnectionValidator(nodeTypes)
};
```

## License

MIT
