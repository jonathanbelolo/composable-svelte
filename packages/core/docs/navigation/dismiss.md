# Managed Dismissal

Child features can request dismissal without knowing a parent action shape. The
supported APIs keep that request bound to the exact managed presentation owner.

## Public APIs

Import dismissal authority only from the application subpath:

```typescript
import {
  managedDismissDependency,
  type DismissDependency,
  type PresentationView
} from '@composable-svelte/core/application';
```

These names are intentionally absent from the root and navigation barrels.

### `PresentationView.dismiss()`

Managed optional slots and registered destination cases produce a nominal
`PresentationView<State, Action>`:

```typescript
const view = composition.bind(store, panelSlot);
view?.dispatch({ type: 'changed', value: 'Ada' });
view?.dismiss();
```

The view captures the presentation owner that existed when the view was minted.
If that owner is replaced or destroyed, calling an old copied view is inert; it
cannot look up and dismiss the current occupant. Obtain the view from
`FeatureViews`/`FeatureOutlet`, `composition.bind`, or typed managed
`scopeTo(app.store, slot)`. `resolveView` is internal and is not a consumer API.
Do not hand-build or cast an object with the same fields.

### `managedDismissDependency()`

Reducers request dismissal by returning the effect from an injected dependency:

```typescript
import { Effect, type Reducer } from '@composable-svelte/core';
import {
  managedDismissDependency,
  type DismissDependency
} from '@composable-svelte/core/application';

type Deps = { readonly dismiss: DismissDependency };

const childReducer: Reducer<ChildState, ChildAction, Deps> =
  (state, action, deps) => {
    if (action.type === 'cancelButtonTapped') {
      return [state, deps.dismiss()];
    }
    return [state, Effect.none()];
  };

const dependencies: Deps = {
  dismiss: managedDismissDependency()
};
```

The effect carries a private request. The enclosing managed optional or destination
lift claims it synchronously and emits that presentation's dismissal. Reducers,
action subscribers, and history observe only ordinary public actions; the private
request never becomes application data.

Raw store dispatch, hand-written dispatch, keyed slots, and legacy lifts reject a
managed dismissal request. This prevents a dependency from acquiring ambient or
field-string authority.

## Cleanup before dismissal

Pass cleanup directly to the requester:

```typescript
const dependencies: Deps = {
  dismiss: managedDismissDependency(async (signal) => {
    await analytics.flush({ signal });
  })
};
```

A thenable cleanup is awaited. If the effect is aborted, or its presentation is
replaced or destroyed before cleanup finishes, the dismissal is dropped. The stale
effect never dismisses the successor.

Cleanup should release or flush child-owned work. Application state changes still
belong in reducer actions rather than the cleanup callback.

## Destination and optional ownership

Use a registered `destinationSlot` case or an `optionalSlot` in
`ManagedIntegrationBuilder`:

```typescript
const panel = optionalSlot<AppState, AppAction>()('panel');

const composition = new ManagedIntegrationBuilder(coreReducer)
  .with(panel, childReducer)
  .build();

const store = createStore({
  initialState,
  ...composition,
  dependencies: { dismiss: managedDismissDependency() }
});
```

A destination catalog uses the corresponding registered destination slot and its
case handle. Keyed collection rows and ordinary nested children do not receive
presentation dismissal authority.

## Explicit animated exits

Use the complete [managed presentation example](../application-presentation.md)
for actual component wiring. Its completion callbacks come from `Modal`, not
from `useMotion` or `useMotionGroup`.

Dismissal normally removes the optional child or destination immediately. For an
explicit presentation exit, opt into deferred dismissal at the slot declaration:

```typescript
const composition = new ManagedIntegrationBuilder(coreReducer)
  .with(panel, childReducer, { dismissal: 'deferred' })
  .build();
```

Destination slots accept the same policy as their second argument. Omitted
`dismissal` and `'immediate'` keep the default behavior.

In deferred mode, every dismissal request preserves the exact current child state
and its managed owner. The parent reducer receives the ordinary dismissal action
and can begin the exit. Repeated requests do not finish the exit or remove the
child. Keep that reducer transition idempotent while dismissal is in progress.

The animation completion callback dispatches a **distinct completion action through
the captured child view**. The parent observes that routed action and clears the
slot. Declare this action in the child action domain; do not dispatch an unscoped
parent completion from the callback. An old captured view cannot complete the exit
of a replacement owner. Calling `dismiss()` again is another request, not completion.

Use the live slot as authoritative state when beginning the exit. Do not restore a
cleared slot from `PresentationState.content` or fabricate a presentation view.
Removing the child still retires its owner immediately. For replacement of a
non-null optional child, declare the identity change through `replaceOn`;
ordinary immutable child updates preserve its owner.
Deferred dismissal does not select an animation, schedule completion, or implement
an automatic presentation lifecycle; the explicit `PresentationState` integration
remains the documented compatibility path for this release.

## Testing

Use the real managed composition and assert owner behavior:

1. A current view or reducer effect dismisses its own optional/destination owner.
2. A stale view cannot dismiss a replacement.
3. A cleanup-delayed request is dropped after replacement or destruction.

For deferred exits, also verify that repeated requests keep the current child
and owner, that a distinct completion through its captured view clears the slot,
and that an old view cannot complete a successor after a declared replacement.
Explicit parent removal during exit must still retire the child.

Framework qualification additionally verifies private-request rejection by raw
dispatch/non-presenting lifts and private-request invisibility in reducer input,
history and subscriptions. Application tests need not reproduce those internals.

Avoid mocks that call a parent dispatch directly; they bypass the identity and
liveness contract under test.

## Legacy scoping

`scopeToDestination`, `scopeToOptional`, and fluent
`scopeTo(store).into(...).case()/optional()` remain available for state/read and
action dispatch. Their returned stores do not expose `dismiss()`. Move presentation
components to a genuine `PresentationView` rather than recreating dismissal with a
raw parent dispatch or action-field string.
