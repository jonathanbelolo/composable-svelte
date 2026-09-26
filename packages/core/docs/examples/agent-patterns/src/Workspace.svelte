<script lang="ts">
  import { useApplication, defineViews, FeatureViews, FeatureOutlet } from '@composable-svelte/core/application';
  import { application, composition } from './application';
  import Editor from './Editor.svelte';
  const app = useApplication(application);
  const state = $derived(app.store.state);
  const definition = defineViews(composition, { editor: { render: Editor } });
  function navigate(event: MouseEvent, id: string | null) {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    app.store.dispatch({ type: 'navigate', id });
  }
</script>
<nav aria-label="Notes"><a href="/notes" onclick={event => navigate(event, null)}>All notes</a>
  <a href="/notes/welcome" onclick={event => navigate(event, 'welcome')}>Welcome</a></nav>
<main>
  <h1>Notebook</h1>
  {#if state.selectedId === state.note.id}
    <p>{state.note.text}</p><button onclick={() => app.store.dispatch({ type: 'edit' })}>Edit note</button>
  {:else if state.selectedId !== null}<p>Note not found.</p>
  {:else}<p>Select a note.</p>{/if}
</main>
<FeatureViews store={app.store} {definition}>
  {#snippet children(views)}<FeatureOutlet view={views.editor} />{/snippet}
</FeatureViews>
