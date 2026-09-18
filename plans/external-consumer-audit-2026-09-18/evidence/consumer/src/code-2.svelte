<script lang="ts">
  import { createStore } from '@composable-svelte/core';
  import {
    CodeHighlight,
    codeHighlightReducer,
    createInitialCodeHighlightState
  } from '@composable-svelte/code';
  import { highlightCode } from '@composable-svelte/code';

  const store = createStore({
    initialState: createInitialCodeHighlightState({
      code: 'const x = 42;',
      language: 'typescript',
      theme: 'dark',
      showLineNumbers: true
    }),
    reducer: codeHighlightReducer,
    dependencies: { highlightCode }
  });
</script>

<CodeHighlight {store} />
