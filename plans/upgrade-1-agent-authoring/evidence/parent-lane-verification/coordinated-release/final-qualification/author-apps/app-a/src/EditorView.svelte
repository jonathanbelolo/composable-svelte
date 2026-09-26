<script lang="ts">
  import type { FeatureViewProps } from '@composable-svelte/core/application';
  import { CodeEditor, type CodeEditorState, type CodeEditorAction } from '@composable-svelte/code';

  let { store, surface }: FeatureViewProps<CodeEditorState, CodeEditorAction> = $props();
</script>

<div use:surface class="editor-feature-view" data-testid="editor-feature">
  <CodeEditor {store} />
</div>

<style>
  .editor-feature-view {
    height: 100%;
    min-height: 250px;
    display: flex;
    flex-direction: column;
  }
</style>
