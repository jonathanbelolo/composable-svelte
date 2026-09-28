<script lang="ts">
  import { Modal } from '@composable-svelte/core/navigation-components';
  import { useStagedRoute, type PresentationFeatureViewProps } from '@composable-svelte/core/application';
  import { useOverlayMotion, useParticipant } from '@composable-svelte/core/application/motion';
  import { application, type DetailAction, type DetailState } from './model.js';
  import { closeDetail, notesClose, notesOpen, notesQuickClose } from './motion.js';

  let { store }: PresentationFeatureViewProps<DetailState, DetailAction, {}> = $props();

  const route = useStagedRoute(application);
  const participant = useParticipant();
  // Default open/close plans for every accepted open or close of the bound dialog, whatever caused it.
  const id = store.state?.item.id ?? '';
  const notes = useOverlayMotion(overlay => ({ open: notesOpen(overlay, id), close: notesClose(overlay, id) }));

  function presented() { store.dispatch({ type: 'notesPresented' }); }
  function staleCompletionProbe() {
    store.dispatch({ type: 'closeNotes' });
    presented();
    console.info('REVIEW_MUTATION: stale onPresentationComplete invoked after closeNotes');
  }
  function back(id: string) {
    route.request({ to: '/' }, { motion: closeDetail(id) });
  }
  // Explicit entry: the commit runs now; if the dialog's committed presentation starts dismissing, this plan
  // replaces the default close. If the close is refused (pinned), nothing starts.
  function closeQuickly() {
    notes.transition(notesQuickClose(notes), () => store.dispatch({ type: 'closeNotes' }));
  }
</script>

{#if store.state}
  {@const { item, saved, notes: notesState, pinned } = store.state}
  <main data-notes={notesState.status}>
    <button type="button" use:participant={{ key: 'back', role: 'control' }} onclick={() => back(item.id)}>Back to catalog</button>
    <h1 data-route-focus use:participant={{ key: `item-${item.id}` }}>{item.title}</h1>
    <!-- Text only: focusable content may slide but never fades below its stable opacity. -->
    <article use:participant={{ key: 'detail-body' }}>
      <p>{item.summary}</p>
    </article>
    <button type="button" onclick={() => store.dispatch({ type: 'toggleSaved' })}>{saved ? 'Saved' : 'Save'}</button>
    <button type="button" data-open-notes onclick={() => store.dispatch({ type: 'openNotes' })}>Notes</button>
  </main>

  <!-- Completion comes from the Modal's callbacks; the store needs no timer or subscription. -->
  <Modal
    presentation={notesState}
    motion={notes}
    onPresentationComplete={presented}
    onDismissalComplete={() => store.dispatch({ type: 'notesDismissed' })}
  >
    <!-- Inside the dialog's content, this participant belongs to the dialog instance's scope. -->
    <h2 use:participant={{ key: 'notes-title' }}>{item.title}: notes</h2>
    <p>{notesState.status === 'idle' ? '' : notesState.content}</p>
    <label><input type="checkbox" checked={pinned} onchange={() => store.dispatch({ type: 'togglePinned' })} /> Keep open</label>
    <button type="button" data-close-notes onclick={staleCompletionProbe}>Close</button>
    <button type="button" data-close-quickly onclick={closeQuickly}>Close quickly</button>
  </Modal>
{/if}
