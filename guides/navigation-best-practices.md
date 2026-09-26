# Navigation best practices

This guide describes the supported tree-navigation and managed-presentation boundaries.

## Core principles

### Prefer parent observation for business outcomes

A child reducer emits domain actions. Its parent may observe a presented action, update
parent state, and dismiss by clearing the destination. Use this when the parent must
save data, update a list, navigate, or distinguish confirmation from cancellation.

```typescript
case 'destination': {
  const [next, effect] = integrateChild(state, action, deps);
  if (action.action.type === 'presented' && action.action.action.type === 'saved') {
    return [{ ...next, destination: null }, effect];
  }
  return [next, effect];
}
```

### Use managed dismissal for a simple close request

Reducer-owned self-dismissal uses the application-only managed dependency:

```typescript
import {
  managedDismissDependency,
  type DismissDependency
} from '@composable-svelte/core/application';

interface ChildDependencies {
  readonly dismiss: DismissDependency;
}

const childDependencies: ChildDependencies = {
  dismiss: managedDismissDependency()
};

case 'closeButtonTapped':
  return [state, deps.dismiss()];
```

Return or batch `deps.dismiss()`; calling it and then returning `Effect.none()` discards
the effect. Managed composition claims it for the exact optional/destination owner.
A stale request cannot dismiss a replacement.

### Keep reducers pure

Reducers return state and effects. They do not capture a store, DOM node, presentation
component, parent dispatch function, or animation callback.

## Presentation rendering

Legacy `scopeToDestination`, `scopeToOptional`, and fluent `scopeTo` remain supported
for state reads and action dispatch outside presentation rendering. They carry no
dismissal authority and are not valid inputs to dismissing navigation components.

Declare presentations with `optionalSlot` or `destinationSlot`, then render their
framework-minted `PresentationView` through `FeatureViews` and `FeatureOutlet`.

```svelte
{#snippet modalView({ store, surface })}
  <Modal {store} ariaLabel="Edit item">
    <form use:surface>
      <button onclick={() => store.dispatch({ type: 'save' })}>Save</button>
      <button onclick={() => store.dismiss()}>Cancel</button>
    </form>
  </Modal>
{/snippet}
```

The same contract applies to `Alert`, `Sheet`, `Drawer`, `Popover`, and `Sidebar`.
`Tabs`, `NavigationStack`, and `AnimatedNavigationStack` are non-dismissing families
and retain `ChildView` rather than `PresentationView`.

## Nested presentation

Declare a child-owned optional or destination slot and render its view through a nested
`FeatureOutlet`. Do not call `scopeToDestination` inside one presentation component and
pass the result into another.

```svelte
<Modal store={views.parent.store}>
  <section use:views.parent.surface>
    <FeatureOutlet view={views.parent.destination} />
  </section>
</Modal>
```

Each nested view carries only its own owner-bound dismissal authority.

## Interaction and lifecycle

- Outside-pointer and Escape behavior belong to the component's dismissal boundary.
- `disableClickOutside` disables only outside-pointer dismissal.
- Keep an explicit close control when a gesture is disabled.
- `PresentationState` and completion callbacks report visual lifecycle; they do not
  mint dismissal authority.
- Application reducers describe state and business effects; components own focus,
  portal, scroll lock, event listeners, and retained exit shells.

## Testing

Test the child reducer, parent observation, and managed presentation separately:

1. A child business action reaches the parent and produces the expected state/effect.
2. `deps.dismiss()` is returned and dismisses only its originating live owner.
3. A stale copied view or delayed cleanup cannot dismiss a replacement.
4. Escape and outside-pointer gestures route through the top eligible component.
5. Disabling one gesture does not disable other supported dismissal paths.
6. Nested presentations dismiss the selected child without dismissing its parent.

Use `TestStore` for reducer/effect behavior and maintained browser fixtures for mounted
focus, pointer, Escape, portal, and animation behavior.

## Troubleshooting

### `deps.dismiss is not a function`

The reducer was run outside an admitted managed optional/destination integration, or its
dependencies omitted `managedDismissDependency()`. Supply the managed dependency at the
application composition boundary. Do not replace it with a raw parent-dispatch closure.

### The parent never observes a save

Do not use dismissal as a substitute for a business action. Emit `saved`, let the
parent observe it, then update or dismiss parent state.

### A component does not dismiss

Confirm that it received a live `PresentationView`, that its owner still exists, and
that the requested gesture is enabled. A legacy scoped store or structural lookalike
is intentionally refused.

## Checklist

- Prefer parent observation for business outcomes.
- Use managed dismissal only for owner-bound close/cancel requests.
- Return dismissal effects.
- Pass only a framework-minted `PresentationView` to dismissing components.
- Keep legacy scopes limited to state/read/dispatch.
- Render nested presentations through declared slots and feature views.
- Test stale replacement, nested ownership, and gesture behavior.
