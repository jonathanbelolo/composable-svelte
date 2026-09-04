<!--
	Mirrors: packages/code/README.md

	The CodeHighlight quickstart — the first code a consumer of this package
	pastes. It could not resolve: the README called
	`createInitialCodeHighlightState`, the package exported `createInitialState`,
	and nothing compiled either one. A ```svelte fence is invisible to the
	TypeScript arm of the doc guard, and the Svelte arm checks syntax only, in
	two documents that do not include this one — so a broken quickstart was
	green from every angle.

	As a file it is typechecked by `svelte-check` as part of `pnpm -r check`,
	and the arm in `doc-examples.test.ts` asserts the README still quotes it
	verbatim. The file is authoritative: it is the thing that has to compile.
-->
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
