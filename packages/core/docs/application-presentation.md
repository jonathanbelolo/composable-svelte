# Managed Presentation Guide

This guide describes the managed presentation compatibility workflow for Composable Svelte applications. It documents how managed presentation authority coordinates with child view lifetimes, deferred dismissal transitions, and navigation components.

Composable Svelte applications provide content, presentation, and pure business decisions. Reducers are pure synchronous state/action decisions; effects own asynchronous work through injected dependencies. The framework owns reusable subscription, cancellation, resource management, and presentation coordination.

See also:

- [Application contract](./application-contract.md)
- [Application ownership](./application-ownership.md)
- [Application views](./application-views.md)
- [Managed dismissal](./navigation/dismiss.md)
- [Application motion](./application-motion.md)
- [Navigation components](./navigation/components.md)

## Architecture and Presentation Authority

Presentation features are composed through managed ownership rather than manually mounted components or global dialog controllers:

1. **Managed presentation authority**: A genuine `PresentationView<State, Action>` is minted by managed composition (`ManagedIntegrationBuilder` with `optionalSlot` or `destinationSlot`, rendered via `FeatureViews` and `FeatureOutlet`). The view captures its exact presentation owner and exposes owner-bound `dismiss()` alongside `state` and `dispatch()`. Legacy scoping (`scopeToOptional`, `scopeToDestination`) and raw store casts lack dismissal authority and are rejected by navigation components.
2. **Explicit PresentationState compatibility exception**: Version 0.13 has no automatic presentation-state default. Explicit `PresentationState` bookkeeping (`status`: `'presenting' | 'presented' | 'dismissing' | 'idle'`) remains compatibility support for applications that need it. Content markers (such as `PresentationState<true>`) serve strictly as visual lifecycle markers and must not duplicate business state snapshots.
3. **Surface registration**: Applying `use:surface` from `PresentationFeatureViewProps` makes an HTML element eligible for presentation capture, subject to safety checks. Surface registration does not itself select or execute an animation or guarantee layout stability.

## Dismissal Policies: Immediate vs. Deferred

Managed slots support two dismissal policies:

| Dismissal policy | Slot declaration | Behavior on `store.dismiss()` | Completion |
| --- | --- | --- | --- |
| **Immediate** (default) | `optionalSlot()` / default | The slot and its managed child are cleared synchronously. | Immediate; child is retired upon dispatch. |
| **Deferred** (opt-in) | `.with(slot, reducer, { dismissal: 'deferred' })` | The framework retains the current child and managed owner. The application's parent reducer handles the routed request, including any transition to `dismissing`. | Distinct child completion action routed through captured child view. |

### Deferred Dismissal Rules

- **Repeated requests are not completion**: Calling `store.dismiss()` multiple times or sending additional dismiss requests while an exit is already underway must be handled idempotently by the parent reducer. Repeated requests do not advance the exit or remove the child.
- **Completion requires a distinct action**: The exit animation completes when the presentation layer dispatches a distinct completion action (for example, `{ type: 'exited' }`) through the captured child view. The parent handles that routed action to clear the slot only while in the `dismissing` state.
- **No unscoped completion**: Never dispatch an unscoped parent completion from an exit callback or call `store.dismiss()` to signal exit completion.
- **Parent owns replacement and removal**: Setting `editor: null` retires the child. Declare a new lifetime for replacement with the slot's `replaceOn` policy, as the example does for `open`; ordinary immutable child updates do not mean a new owner. Runtime checks prevent callbacks through a retired view from completing the successor's exit.

## Animation Lifecycles and Timing Guarantees

- **Callbacks originate from navigation primitives**: Presentation lifecycle notifications (`onPresentationComplete`, `onDismissalComplete`) are delivered by navigation components (such as `Modal` via `ModalPrimitive`), NOT by `useMotion` or `useMotionGroup`. `useMotion` and `useMotionGroup` provide motion playback and target binding, but expose no public completion callbacks.
- **No timing guarantees**: Duration and spring configuration metadata (`springConfig`) are visual parameters, not timing promises. Application code must never rely on timing guarantees or introduce manual fallback timers (`setTimeout`, `setInterval`, `requestAnimationFrame`).
- **Surface capture is distinct from animation**: Applying `use:surface` marks the element eligible for presentation capture, subject to safety checks; it does not select or run an animation.

### Modal layout and style ownership

`Modal` merges `class` and `backdropClass` with its default utility classes. If your
application does not generate those utilities, supply the equivalent layout and
appearance in your own CSS. The content wrapper uses an inline
`translate(-50%, -50%)`; its primitive composes the scale animation with that
centering transform and controls transition opacity. Keep the matching fixed
`left: 50%; top: 50%` anchor when supplying custom content-container layout. Size the
dialog to fit the viewport and provide scrolling for content that can exceed it.

Do not put a competing transform, opacity animation or motion recipe on that same
wrapper. Apply independent content motion to a separate descendant through the
public motion APIs. `unstyled` omits both default and supplied class strings; it
does not remove the inline centering transform, opacity or primitive behavior.

## Lifetime, Mounting, and Reconciliation

- **Stable Host scope**: Keep `ApplicationHost` and the presented view mounted throughout both entrance and exit sequences. The supported architecture uses a stable, scoped `ApplicationHost`; do not rely on dynamic motion drivers or custom layout engines (there is no public custom driver extension or shared-layout transition engine).
- **Teardown and unmounting**: Removing `ApplicationRoot` retires all active subscriptions and resources. Explicit parent removal immediately retires the child. Do not promise or expect completion callbacks during component teardown or when attempting to resume a removed Host.
- **Interrupted and unmounted choreography**: When an entering transition is interrupted by dismissal, the parent must transition the child presentation to `dismissing` idempotently. If an entire view hierarchy unmounts before an exit completes, application reducers may need explicit business-state reconciliation.

## Complete Example

The following self-contained Svelte component demonstrates an accessible note editor rendered in a `Modal`. It illustrates:

- `defineApplication` and `ManagedIntegrationBuilder` with `{ dismissal: 'deferred' }`.
- Domain model: `AppState` with `editor: EditorState | null`.
- `EditorState` containing `text: string` and visual `PresentationState<true>` metadata.
- Immutable child reducer handling `entered`, `exited`, and `textChanged`.
- Parent reducer handling `open`, idempotent `dismiss`, and clearing the slot only upon `exited` while `dismissing`.
- `defineViews`, `FeatureViews`, and `FeatureOutlet` with typed `PresentationFeatureViewProps`.
- `Modal` wiring with genuine `store`, `surface`, and accessible semantic elements.

```svelte
<script lang="ts">
  import { Effect, type Reducer, type PresentationAction } from '@composable-svelte/core';
  import {
    ApplicationRoot,
    ApplicationHost,
    FeatureViews,
    FeatureOutlet,
    ManagedIntegrationBuilder,
    optionalSlot,
    defineApplication,
    defineViews,
    type PresentationFeatureViewProps
  } from '@composable-svelte/core/application';
  import type { PresentationState } from '@composable-svelte/core/navigation';
  import { Modal } from '@composable-svelte/core/navigation-components';

  // --- Domain Types ---

  interface EditorState {
    readonly text: string;
    readonly presentation: PresentationState<true>;
  }

  type EditorAction =
    | { readonly type: 'entered' }
    | { readonly type: 'exited' }
    | { readonly type: 'textChanged'; readonly text: string };

  interface AppState {
    readonly editor: EditorState | null;
  }

  type AppAction =
    | { readonly type: 'open' }
    | { readonly type: 'editor'; readonly action: PresentationAction<EditorAction> };

  // --- Reducers ---

  const editorReducer: Reducer<EditorState, EditorAction, undefined> = (state, action) => {
    switch (action.type) {
      case 'entered':
        if (state.presentation.status === 'presenting') {
          return [
            { ...state, presentation: { status: 'presented', content: true } },
            Effect.none()
          ];
        }
        return [state, Effect.none()];

      case 'textChanged':
        return [{ ...state, text: action.text }, Effect.none()];

      case 'exited':
        // Exit completion produces no child mutation; parent clears the slot.
        return [state, Effect.none()];

      default:
        return [state, Effect.none()];
    }
  };

  const appReducer: Reducer<AppState, AppAction, undefined> = (state, action) => {
    switch (action.type) {
      case 'open':
        return [
          {
            ...state,
            editor: {
              text: '',
              presentation: { status: 'presenting', content: true }
            }
          },
          Effect.none()
        ];

      case 'editor': {
        if (action.action.type === 'dismiss') {
          // Idempotently transition to dismissing, even if entering was interrupted
          if (!state.editor || state.editor.presentation.status === 'dismissing') {
            return [state, Effect.none()];
          }
          return [
            {
              ...state,
              editor: {
                ...state.editor,
                presentation: { status: 'dismissing', content: true }
              }
            },
            Effect.none()
          ];
        }

        // Handle routed child completion action
        if (action.action.action.type === 'exited') {
          if (state.editor?.presentation.status === 'dismissing') {
            return [{ ...state, editor: null }, Effect.none()];
          }
          return [state, Effect.none()];
        }

        return [state, Effect.none()];
      }

      default:
        return [state, Effect.none()];
    }
  };

  // --- Managed Composition ---

  const editorSlot = optionalSlot<AppState, AppAction>()('editor');

  const composition = new ManagedIntegrationBuilder(appReducer)
    .with(editorSlot, editorReducer, {
      dismissal: 'deferred',
      replaceOn: (action) => action.type === 'open'
    })
    .build();

  const application = defineApplication(composition, {
    initialState: (): AppState => ({ editor: null })
  });

  const definition = defineViews(composition, {
    editor: { content: editorView }
  });
</script>

{#snippet editorView({ store, surface }: PresentationFeatureViewProps<EditorState, EditorAction>)}
  <Modal
    {store}
    presentation={store.state?.presentation}
    onPresentationComplete={() => store.dispatch({ type: 'entered' })}
    onDismissalComplete={() => store.dispatch({ type: 'exited' })}
    ariaLabel="Edit Note"
  >
    <div use:surface class="modal-card">
      <header>
        <h2>Edit Note</h2>
        <button
          type="button"
          aria-label="Close"
          onclick={() => store.dismiss()}
        >
          Close
        </button>
      </header>

      <main>
        <label for="note-text">Note Text</label>
        <textarea
          id="note-text"
          value={store.state?.text ?? ''}
          oninput={(event) =>
            store.dispatch({ type: 'textChanged', text: event.currentTarget.value })}
        ></textarea>
      </main>

      <footer>
        <button type="button" onclick={() => store.dismiss()}>
          Cancel
        </button>
      </footer>
    </div>
  </Modal>
{/snippet}

<ApplicationRoot definition={application} options={{ dependencies: undefined, initial: { input: undefined } }}>
  {#snippet children(app)}
    <ApplicationHost {app}>
      <header>
        <h1>Notes Workspace</h1>
        <button type="button" onclick={() => app.store.dispatch({ type: 'open' })}>
          Open Editor
        </button>
      </header>

      <FeatureViews store={app.store} {definition}>
        {#snippet children(views)}
          <main>
            <FeatureOutlet view={views.editor} />
          </main>
        {/snippet}
      </FeatureViews>
    </ApplicationHost>
  {/snippet}
</ApplicationRoot>
```

## Testing and Verification

When verifying managed presentation behavior:

1. **Test reducer transitions with `createTestStore`**: Supply both `composition.reducer` and `composition.execution` to test child routing and ownership, then assert `open`, dismissal requests and child actions (`entered`, `exited`). A standalone managed mode flag without the composition's execution configuration does not exercise child integration. Verify retained child state and idempotent repeated requests.
2. **Exercise owner identity and rejection**: Cross a declared `replaceOn` boundary and retain the predecessor's genuine view. After the successor begins dismissal, dispatch its completion action through the predecessor and assert that the successor remains until completion arrives through its own captured view. Also verify that calling `dismiss()` on a stale view after replacement or teardown has no effect.
3. **Browser integration tests**: Render `ApplicationRoot` and `ApplicationHost` with the real managed composition and navigation primitive. Query elements through semantic roles (headings, labels, dialogs, buttons) to assert mounting, accessibility, focus management, primitive-callback delivery, reduced-motion endpoints, and unmounting following exit animation completion. Stateless view-unit tests may still use data stubs when they do not make lifetime or authority claims.
