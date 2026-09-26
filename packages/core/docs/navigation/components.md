# Navigation components

Composable Svelte's dismissing navigation components render an admitted managed
presentation. They accept a `PresentationView` minted by application composition;
they do not accept a raw store or a legacy scoped store.

## Component catalog

| Component | Typical use | Dismissal |
| --- | --- | --- |
| `Modal` | Focused dialog or form | Outside pointer, Escape, or `view.dismiss()` |
| `Alert` | Confirmation or warning | Escape or `view.dismiss()` |
| `Sheet` | Bottom or side panel | Outside pointer, Escape, or `view.dismiss()` |
| `Drawer` | Navigation or detail panel | Outside pointer, Escape, or `view.dismiss()` |
| `Popover` | Anchored menu or transient detail | Outside pointer, Escape, or `view.dismiss()` |
| `Sidebar` | Inline application navigation | Escape or `view.dismiss()` |

Import them from the navigation-components subpath:

```ts
import { Modal, Alert, Sheet, Drawer, Popover, Sidebar } from '@composable-svelte/core/navigation-components';
```

## Managed view contract

The `store` prop is a `PresentationView<State, Action>`. It provides `state`,
`dispatch(action)`, and owner-bound `dismiss()`. Obtain it from managed composition
through `FeatureViews`, `FeatureOutlet`, or typed `scopeTo(app.store, slot)`. Do not
construct a structural lookalike or cast a raw store.

The snippets below assume the surrounding application already supplied `store` and
`surface` through `PresentationFeatureViewProps`. The
[managed presentation example](../application-presentation.md) contains the
complete application and view declaration wiring.

```svelte
<script lang="ts">
  import { Modal } from '@composable-svelte/core/navigation-components';
  import type { PresentationFeatureViewProps } from '@composable-svelte/core/application';

  let { store, surface }: PresentationFeatureViewProps<FormState, FormAction> = $props();
</script>

<Modal {store} ariaLabel="Edit item">
  <form use:surface>
    <input
      value={store.state?.name ?? ''}
      oninput={(event) => store.dispatch({ type: 'nameChanged', name: event.currentTarget.value })}
    />
    <button type="button" onclick={() => store.dispatch({ type: 'save' })}>Save</button>
    <button type="button" onclick={() => store.dismiss()}>Cancel</button>
  </form>
</Modal>
```

The component owns its backdrop, dismissal boundary, focus session, portal, scroll
lock, and presentation completion lifecycle. The `surface` action marks the feature
surface owned by managed composition.

When an already-focused control or its containing subtree is removed from a live
modal, the framework recovers focus inside the current modal. Applications do not
need a subscription, timer, or component effect to repair that removal. Recovery
preserves valid focus inside the current modal's owned region and defers to the
existing replacement, dismissal and navigation focus policies. This removal
policy does not cover changes inside closed shadow roots, or attribute-only and
CSS-only changes that make a retained element unfocusable.

## Modal and Alert

Use `Modal` for a focused workflow and `Alert` for a compact confirmation.
`disableClickOutside` and `disableEscapeKey` disable those gestures while the view's
programmatic dismissal remains available.

```svelte
<Alert {store} ariaLabel="Delete item" disableClickOutside>
  <section use:surface>
    <h2>Delete this item?</h2>
    <button onclick={() => store.dispatch({ type: 'confirm' })}>Delete</button>
    <button onclick={() => store.dismiss()}>Cancel</button>
  </section>
</Alert>
```

## Sheet and Drawer

Their layout props choose the visual edge; they do not change authority or dismissal.

```svelte
<Sheet {store} side="bottom" height="60vh" ariaLabel="Filters">
  <section use:surface>
    <FilterForm state={store.state} onAction={(action) => store.dispatch(action)} />
    <button onclick={() => store.dismiss()}>Close filters</button>
  </section>
</Sheet>
```

```svelte
<Drawer {store} side="left" width="280px" ariaLabel="Navigation">
  <nav use:surface>
    <Menu state={store.state} onAction={(action) => store.dispatch(action)} />
    <button onclick={() => store.dismiss()}>Close menu</button>
  </nav>
</Drawer>
```

## Popover

Supply its admitted view and position the content through the documented `style` or
class surface. A replacement presentation cannot be dismissed through an old copied
view.

```svelte
<Popover {store} style="top: 3rem; right: 1rem">
  <div use:surface role="menu">
    <button role="menuitem" onclick={() => store.dispatch({ type: 'rename' })}>Rename</button>
    <button role="menuitem" onclick={() => store.dismiss()}>Close</button>
  </div>
</Popover>
```

## Sidebar

`Sidebar` is an inline layout participant rather than a fixed overlay. It uses the same
managed view authority and can render on either side of the application shell.

```svelte
<Sidebar {store} side="left" width="240px">
  <nav use:surface>
    <Menu state={store.state} onAction={(action) => store.dispatch(action)} />
    <button onclick={() => store.dismiss()}>Close navigation</button>
  </nav>
</Sidebar>
```

## Presentation lifecycle

Components can receive `PresentationState` and completion callbacks when a feature
owns an explicit animation lifecycle:

```svelte
<Modal
  {store}
  {presentation}
  onPresentationComplete={() => store.dispatch({ type: 'presentationCompleted' })}
  onDismissalComplete={() => store.dispatch({ type: 'dismissalCompleted' })}
>
  <section use:surface>...</section>
</Modal>
```

Here `store` is the captured genuine child view, and completion actions belong
to its action domain. Configure deferred dismissal and let the parent handle the
routed completion as shown in the [complete managed presentation example](../application-presentation.md).
Keep the Host and presentation mounted through exit; do not infer completion
from a timer or from a `useMotion` handle.

Completion callbacks report the visual lifecycle. They do not mint dismissal
authority. Keep view dismissal in `PresentationView.dismiss()` or inject a managed
dismiss dependency into the admitted child reducer.

## Reducer-owned dismissal

```ts
import { managedDismissDependency, type DismissDependency } from '@composable-svelte/core/application';

type Dependencies = { readonly dismiss: DismissDependency };
const dependencies: Dependencies = { dismiss: managedDismissDependency() };

const reducer: Reducer<State, Action, Dependencies> = (state, action, deps) => {
  if (action.type === 'cancel') return [state, deps.dismiss()];
  return [state, Effect.none()];
};
```

The effect is claimed by the exact optional or destination owner. Replacement,
destruction, or an unsupported keyed or legacy lift makes the request inert.

## Styling and accessibility

- Supply a meaningful `ariaLabel` or visible heading.
- Keep an obvious close control when a dismissal gesture is disabled.
- Put feature markup under the managed `surface` action.
- Use documented class, backdrop, and geometry props for appearance.
- Preserve the component's focus and dismissal actions in unstyled rendering.

## Legacy scoped stores

`scopeToDestination`, `scopeToOptional`, and fluent legacy scopes remain useful for
state reads and action dispatch outside managed presentation rendering. They do not
carry dismissal authority and must not be passed to these components. Migrate the
presentation boundary and pass its `PresentationView` instead.

`NavigationStack`, `AnimatedNavigationStack`, and Tabs are non-dismissing component
families and keep their `ChildView` contract. See [Tree-based navigation](./tree-based.md)
for stack guidance and the component-specific guides for Tabs.
