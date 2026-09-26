# Scope Helpers

Scope helpers project a parent store into a child's state and action space. The
legacy helpers are useful for reading child state and dispatching child actions;
they do not grant presentation authority.

## Functional helpers

```typescript
import {
  scopeToDestination,
  scopeToOptional
} from '@composable-svelte/core';
```

### `scopeToDestination`

Use a discriminated destination field such as `{ type, state } | null`:

```typescript
const addItem = scopeToDestination<AddItemState, AddItemAction>(
  store,
  ['destination'],
  'addItem',
  'destination'
);

if (addItem.state) {
  console.log(addItem.state.name);
  addItem.dispatch({ type: 'nameChanged', value: 'Milk' });
}
```

The returned `ScopedDestinationStore<State, Action>` has two members:

```typescript
interface ScopedDestinationStore<State, Action> {
  readonly state: State | null;
  dispatch(action: Action): void;
}
```

The helper filters `state` to the requested case. `dispatch` wraps the child action
in the destination case, `PresentationAction.presented`, and the parent action field.

### `scopeToOptional`

Use an ordinary optional field:

```typescript
const settings = scopeToOptional<SettingsState, SettingsAction>(
  store,
  ['settings'],
  'settings'
);

if (settings.state) {
  settings.dispatch({ type: 'nameChanged', value: 'Ada' });
}
```

It returns the same read/dispatch shape. Its dispatch path omits a destination case.

Both helpers accept the minimal `ScopableStore` shape:

```typescript
interface ScopableStore<State, Action> {
  readonly state: State;
  dispatch(action: Action): void;
}
```

## Fluent scoping

`scopeTo(store)` builds the same legacy projection with a chain:

```typescript
const addItem = scopeTo(store)
  .into('destination')
  .case('addItem');

const settings = scopeTo(store)
  .into('settings')
  .optional();

const account = scopeTo(store)
  .into('features')
  .into('account')
  .optional();
```

`case()` returns `null` when the destination is absent or has a different case.
`optional()` returns `null` when the selected value is nullish. A non-null result
contains only `state` and `dispatch`.

Use `$derived` when the projection depends on a reactive Svelte store:

```svelte
<script lang="ts">
  const { store } = $props();
  const addItem = $derived(
    scopeTo(store).into('destination').case('addItem')
  );
</script>

{#if addItem}
  <p>{addItem.state.name}</p>
  <button onclick={() => addItem.dispatch({ type: 'saveButtonTapped' })}>
    Save
  </button>
{/if}
```

## Managed views

Managed composition has a separate typed overload:

```typescript
import { scopeTo } from '@composable-svelte/core/application';

const panelView = scopeTo(projection, panelSlot);
const detailView = scopeTo(projection, destinationSlot.case('detail'));
```

A managed optional slot or registered destination case returns a nominal
`PresentationView<State, Action>`, which includes owner-bound `dismiss()`. A keyed
or nested non-presentation slot returns `ChildView<State, Action>` without dismissal.
Obtain these views from managed composition; do not cast a legacy scoped store or
construct a structural lookalike.

## Dismissal boundary

Legacy functional and fluent scoped stores intentionally have no `dismiss` member.
Use `PresentationView.dismiss()` in view code or inject
`managedDismissDependency()` into a child reducer through managed composition. Both
APIs are exported only from `@composable-svelte/core/application` and retain the
presentation owner's identity, so stale views and effects cannot dismiss a
replacement.

## Choosing a helper

- Use `scopeToDestination` for a direct discriminated destination field.
- Use `scopeToOptional` for a direct nullable child field.
- Use fluent `scopeTo(store).into(...)` for nested legacy state/action projection.
- Use typed managed `scopeTo(projection, slot)` when a component needs a
  framework-issued `ChildView` or `PresentationView`.

For managed dismissal semantics, see [Dismissal](../navigation/dismiss.md).
