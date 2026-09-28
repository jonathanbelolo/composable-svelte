<script lang="ts">
  import { useOverlayMotion, useParticipant } from '@composable-svelte/core/application/motion';
  import { Modal, Alert } from '@composable-svelte/core/navigation-components';
  import type { PresentationView } from '@composable-svelte/core/application';
  import type { PresentationState } from '@composable-svelte/core/navigation';
  import type {
    AppAction,
    CuratorModalState,
    CuratorModalAction,
    ConfirmAlertState,
    ConfirmAlertAction
  } from './model.js';
  import { untrack } from 'svelte';
  import { curatorModalPlans, curatorClosePlan, curatorSaveClosePlan, nestedAlertPlans } from './overlay-motion.js';
  import { motionPreference } from './preferences.js';

  interface Props {
    workId: string;
    store?: PresentationView<CuratorModalState, CuratorModalAction> | undefined;
    alertStore?: PresentationView<ConfirmAlertState, ConfirmAlertAction> | undefined;
    presentation?: PresentationState<CuratorModalState> | undefined;
    alertPresentation?: PresentationState<ConfirmAlertState> | undefined;
    dispatch: (action: AppAction) => void;
  }

  let {
    workId,
    store,
    alertStore,
    presentation,
    alertPresentation,
    dispatch
  }: Props = $props();

  const participant = useParticipant();
  const preference = motionPreference();

  // Declarative overlay motion for the modal instance (implementation-interface §1)
  // Initialized synchronously once per mounted instance epoch with its exact workId and current preference
  const dialog = useOverlayMotion((overlay) => {
    return curatorModalPlans(overlay, workId, preference.reduced);
  });

  // Save & Close bridge. The save runs in a reducer effect; its success records `closeReady` (that request's id). This
  // effect only reads the view's state and commits the close through the bound explicit entry, synchronously. The
  // reducer consumes readiness atomically, so a refusal or a repeated run never commits twice or retries.
  const closeReady = $derived(presentation && presentation.status !== 'idle' ? presentation.content.closeReady : null);
  $effect(() => {
    const requestId = closeReady;
    if (requestId === null) return;
    untrack(() => {
      const view = store;
      if (!view) return;
      dialog.transition(curatorSaveClosePlan(dialog, workId, preference.reduced), () =>
        view.dispatch({ type: 'commitSavedClose', requestId })
      );
    });
  });

  // Declarative overlay motion for the nested alert instance (implementation-interface §1)
  const nestedAlert = useOverlayMotion((overlay) => {
    return nestedAlertPlans(overlay, preference.reduced);
  });
</script>

<!-- Managed Curator Modal: owns scroll lock, focus trap, and Escape/Outside dismissal -->
<Modal
  {store}
  {presentation}
  motion={dialog}
  onPresentationComplete={() => {
    dispatch({
      type: 'curatorPresentation',
      event: { type: 'presentationCompleted' }
    });
  }}
  onDismissalComplete={() => {
    dispatch({
      type: 'curatorPresentation',
      event: { type: 'dismissalCompleted' }
    });
  }}
  ariaLabelledby="curator-modal-title"
  backdropClass="curator-modal-backdrop"
  class="curator-modal-content"
>
  {#snippet children({ visible, store: snippetStore })}
    {#if snippetStore?.state}
      {@const content = (snippetStore.state as CuratorModalState)}
      {@const spec = content.spec}

      <div data-modal-content="curator" class="curator-modal-inner">
        <!-- Hero Plate: shared flight destination inside modal instance scope -->
        <header
        data-modal-hero
        use:participant={{ key: 'hero' }}
        class="curator-modal-hero"
      >
        <div class="curator-badge-row">
          <span class="card-badge">{spec.status.replace('_', ' ')} · curator revision</span>
          {#if content.isDirty}
            <span data-dirty-badge class="status-badge dirty-badge">Unsaved edits</span>
          {:else if spec.lastSavedAt}
            <span class="status-badge clean-badge">Saved</span>
          {/if}
        </div>
        <h2 id="curator-modal-title" class="curator-modal-title">{spec.title}</h2>
        <p class="curator-summary">Architectural performance specification and curatorial register.</p>
      </header>

      <section class="curator-modal-body">
        <div class="curator-metrics-grid">
          <div class="metric-card">
            <span class="metric-label">Membrane Preload</span>
            <strong class="metric-value mono">{spec.membranePreload}</strong>
          </div>
          <div class="metric-card">
            <span class="metric-label">Clear Span</span>
            <strong class="metric-value mono">{spec.maxSpan}</strong>
          </div>
        </div>

        <label for="curator-notes-input" class="notes-label">Curator Field Notes</label>
        <textarea
          id="curator-notes-input"
          data-curator-notes
          class="notes-input curator-notes-textarea"
          rows="3"
          value={spec.curatorNotes}
          oninput={(e) =>
            snippetStore.dispatch({
              type: 'editNotes',
              notes: e.currentTarget.value
            })
          }
        ></textarea>

        <footer class="curator-actions-bar">
          <div class="left-actions">
            <button
              data-curator-close
              type="button"
              class="btn-secondary"
              onclick={() =>
                // Explicit entry around a synchronous commit: applies only if this dismiss is accepted (clean).
                dialog.transition(curatorClosePlan(dialog, workId, preference.reduced), () => snippetStore.dismiss())}
            >
              Close
            </button>
          </div>
          <div class="right-actions">
            <button
              data-curator-save
              type="button"
              class="btn-secondary"
              disabled={content.isSaving || !content.isDirty}
              onclick={() => snippetStore.dispatch({ type: 'save' })}
            >
              {content.isSaving ? 'Saving...' : 'Save Notes'}
            </button>
            <button
              data-curator-save-close
              type="button"
              class="btn-primary"
              disabled={content.isSaving}
              onclick={() => snippetStore.dispatch({ type: 'saveAndClose' })}
            >
              Save & Close
            </button>
          </div>
        </footer>
        {#if content.saveError}
          <p data-save-error role="alert" class="save-error">Save failed: {content.saveError}. Your edits are kept.</p>
        {/if}
      </section>
    </div>
  {/if}
  {/snippet}
</Modal>

<!-- Managed nested confirmation Alert: the overlay coordinator stacks its layer above the modal's. -->
<Alert
  store={alertStore}
  presentation={alertPresentation}
  motion={nestedAlert}
  onPresentationComplete={() => {
    dispatch({
      type: 'confirmAlertPresentation',
      event: { type: 'presentationCompleted' }
    });
  }}
  onDismissalComplete={() => {
    dispatch({
      type: 'confirmAlertPresentation',
      event: { type: 'dismissalCompleted' }
    });
  }}
  ariaLabelledby="confirm-discard-title"
  backdropClass="nested-alert-backdrop"
  class="nested-alert-dialog"
>
  {#snippet children({ visible, store: alertSnippetStore })}
    {#if alertSnippetStore?.state}
      {@const alertContent = (alertSnippetStore.state as ConfirmAlertState)}
      <div data-nested-alert class="nested-alert-inner">
        <h3 id="confirm-discard-title" class="alert-title">Discard unsaved changes?</h3>
        <p class="alert-desc">
          You have edited curator field notes for {alertContent.workTitle}. If you close without saving, your edits will be discarded.
        </p>
        <div class="alert-actions">
          <button
            data-keep-editing
            type="button"
            class="btn-secondary"
            onclick={() => alertSnippetStore.dismiss()}
          >
            Keep Editing
          </button>
          <button
            data-confirm-discard
            type="button"
            class="btn-primary btn-danger"
            onclick={() => alertSnippetStore.dispatch({ type: 'confirmDiscard' })}
          >
            Discard & Close
          </button>
        </div>
      </div>
    {/if}
  {/snippet}
</Alert>

<style>
  :global(.curator-modal-backdrop) {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.72);
    backdrop-filter: blur(8px);
  }

  :global(.curator-modal-content) {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(640px, 92vw);
    max-height: 88vh;
    overflow-y: auto;
    background: #0f172a;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 16px;
    box-shadow: 0 24px 48px -12px rgba(0, 0, 0, 0.7);
    color: #f8fafc;
  }

  .curator-modal-hero {
    padding: 1.5rem 1.75rem 1.25rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
    border-top-left-radius: 16px;
    border-top-right-radius: 16px;
  }

  .curator-badge-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
  }

  .dirty-badge {
    background: rgba(239, 68, 68, 0.16);
    color: #fca5a5;
    border: 1px solid rgba(239, 68, 68, 0.3);
  }

  .clean-badge {
    background: rgba(16, 185, 129, 0.16);
    color: #6ee7b7;
    border: 1px solid rgba(16, 185, 129, 0.3);
  }

  .curator-modal-title {
    font-size: 1.5rem;
    font-weight: 700;
    margin: 0.25rem 0 0.5rem;
    color: #f8fafc;
  }

  .curator-summary {
    color: #94a3b8;
    font-size: 0.875rem;
    margin: 0;
  }

  .curator-modal-body {
    padding: 1.5rem 1.75rem;
  }

  .curator-metrics-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1.25rem;
  }

  .metric-card {
    background: rgba(30, 41, 59, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 10px;
    padding: 0.75rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .metric-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #64748b;
  }

  .metric-value {
    font-size: 1.15rem;
    color: #38bdf8;
  }

  .notes-label {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    color: #cbd5e1;
    margin-bottom: 0.35rem;
  }

  .curator-notes-textarea {
    width: 100%;
    margin-top: 0.25rem;
    margin-bottom: 1.5rem;
  }

  .curator-actions-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    padding-top: 1.25rem;
  }

  .right-actions {
    display: flex;
    gap: 0.75rem;
  }

  /* No z-index here: each managed overlay's layer is ranked by the coordinator, so the alert sits above the modal. */
  :global(.nested-alert-backdrop) {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(4px);
  }

  :global(.nested-alert-dialog) {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(440px, 88vw);
    background: #1e293b;
    border: 1px solid rgba(239, 68, 68, 0.35);
    border-radius: 12px;
    padding: 1.5rem;
    box-shadow: 0 20px 30px rgba(0, 0, 0, 0.55);
    color: #f8fafc;
  }

  .alert-title {
    margin: 0 0 0.5rem;
    font-size: 1.15rem;
    color: #f8fafc;
  }

  .alert-desc {
    font-size: 0.875rem;
    color: #cbd5e1;
    line-height: 1.5;
    margin: 0 0 1.25rem;
  }

  .alert-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
  }

  .save-error {
    margin: 0.75rem 0 0;
    color: #fca5a5;
    font-size: 0.875rem;
  }

  .btn-danger {
    background: #ef4444;
    color: white;
  }
  .btn-danger:hover {
    background: #dc2626;
  }
</style>
