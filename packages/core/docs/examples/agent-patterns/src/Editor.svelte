<script lang="ts">
  import type { PresentationFeatureViewProps } from '@composable-svelte/core/application';
  import { Modal } from '@composable-svelte/core/navigation-components';
  import type { EditorState, EditorAction } from './editor';
  let { store, surface }: PresentationFeatureViewProps<EditorState, EditorAction> = $props();
  const editor = $derived(store.state);
  const pending = $derived(editor?.save === 'pending');
</script>
<Modal {store} class="pattern-modal" backdropClass="pattern-backdrop" ariaLabel="Edit note" disableEscapeKey={pending} disableClickOutside={pending}>
  {#if editor}
    <form use:surface onsubmit={event => { event.preventDefault(); store.dispatch({ type: 'save' }); }}>
      <label>Note <textarea value={editor.draft} disabled={pending}
        oninput={event => store.dispatch({ type: 'change', text: event.currentTarget.value })}></textarea></label>
      <p role="status">{pending ? 'Saving…' : editor.save === 'failed' ? 'Save failed. Your draft is retained.' : 'Ready to save.'}</p>
      {#if editor.confirmDiscard}
        <p role="alert">Discard unsaved changes?</p>
        <button type="button" onclick={() => store.dispatch({ type: 'discard' })}>Discard</button>
        <button type="button" onclick={() => store.dispatch({ type: 'keepEditing' })}>Keep editing</button>
      {/if}
      <button type="button" disabled={pending} onclick={() => store.dismiss()}>Cancel</button>
      <button type="submit" disabled={pending}>Save</button>
    </form>
  {/if}
</Modal>

<style>
  :global(.pattern-modal) { position: fixed; left: 50%; top: 50%; z-index: 50; width: min(32rem, calc(100vw - 2rem)); max-height: calc(100vh - 2rem); overflow: auto; background: white; color: #17202a; padding: 1rem; border-radius: .5rem; }
  :global(.pattern-backdrop) { position: fixed; inset: 0; z-index: 40; background: #0006; }
  textarea { display: block; width: 100%; min-height: 8rem; box-sizing: border-box; }
</style>
