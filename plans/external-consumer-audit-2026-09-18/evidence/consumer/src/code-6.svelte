<script lang="ts">
  import { createStore } from '@composable-svelte/core';
  import {
    NodeCanvas,
    type NodeCanvasState, type NodeCanvasAction, type NodeCanvasDependencies,
    nodeCanvasReducer,
    createInitialNodeCanvasState
  } from '@composable-svelte/code';

  const store = createStore<NodeCanvasState, NodeCanvasAction, NodeCanvasDependencies>({
    initialState: createInitialNodeCanvasState({
      nodes: {
        '1': { id: '1', type: 'input', position: { x: 0, y: 0 }, data: { label: 'Start' } },
        '2': { id: '2', type: 'default', position: { x: 200, y: 100 }, data: { label: 'Process' } }
      },
      edges: {
        'e1-2': { id: 'e1-2', source: '1', target: '2' }
      }
    }),
    reducer: nodeCanvasReducer,
    dependencies: {}
  });
</script>

<NodeCanvas {store} liftAction={(action) => action} />
