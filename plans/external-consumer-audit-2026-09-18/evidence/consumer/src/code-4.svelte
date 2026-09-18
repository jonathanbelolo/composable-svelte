<script lang="ts">
  import { createStore } from '@composable-svelte/core';
  import {
    CodeEditor,
    codeEditorReducer,
    createInitialCodeEditorState
  } from '@composable-svelte/code';

  const store = createStore({
    initialState: createInitialCodeEditorState({
      value: 'function hello() {\n  console.log("Hello!");\n}',
      language: 'javascript'
    }),
    reducer: codeEditorReducer,
    dependencies: {}
  });
</script>

<CodeEditor {store} />
