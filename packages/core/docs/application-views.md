# Application views

`defineViews`, `FeatureViews` and `FeatureOutlet` from `@composable-svelte/core/application` render the features of a managed composition. The definition chooses each feature's presentation; an outlet places it in your markup. Root and Host lifetime is covered in [application ownership](./application-ownership.md).

Use `destinationSlot` from `@composable-svelte/core/application` for fields backed by `createDestination`. It preserves the destination's case catalog and rejects registration through an ordinary optional slot before that field is reserved. `optionalSlot` excludes fields whose state and presented action both have the destination shape. If an ordinary business model intentionally has that same shape, acknowledge only that structural collision with `optionalSlot<State, Action>()('flow', { destinationShape: 'ordinary' })`; the acknowledgement does not permit a generated destination reducer or a branded destination value.

For a keyed row that owns a destination, compose the row with `destinationSlot` first, then pass that row composition to `forEach`. Passing a generated `Destination.reducer` directly to `forEach` is rejected because the keyed ID alone cannot distinguish destination-case lifetimes. Ordinary keyed business reducers, including structurally similar unions, remain supported.

## Complete example

This small counter keeps business decisions in reducers and presentation in a snippet. The framework supplies the scoped store and the presentation surface action.

```svelte
<script lang="ts">
  import { Effect, type Reducer, type PresentationAction } from '@composable-svelte/core';
  import {
    ApplicationRoot, ApplicationHost, FeatureViews, FeatureOutlet,
    ManagedIntegrationBuilder, optionalSlot, defineApplication, defineViews,
    type FeatureViewProps
  } from '@composable-svelte/core/application';

  type Item = { name: string; count: number };
  type ItemAction = { type: 'increment' };
  type State = { item: Item | null };
  type Action = { type: 'item'; action: PresentationAction<ItemAction> };

  const itemReducer: Reducer<Item, ItemAction, undefined> = (state) => [
    { ...state, count: state.count + 1 }, Effect.none()
  ];
  const reducer: Reducer<State, Action, undefined> = (state) => [state, Effect.none()];
  const itemSlot = optionalSlot<State, Action>()('item');
  const composition = new ManagedIntegrationBuilder(reducer).with(itemSlot, itemReducer).build();
  const application = defineApplication(composition, {
    initialState: (_input: undefined): State => ({ item: { name: 'Counter', count: 0 } })
  });
  const definition = defineViews(composition, { item: { content: itemView } });
</script>

{#snippet itemView({ store, surface }: FeatureViewProps<Item, ItemAction>)}
  <section use:surface>
    <h2>{store.state?.name}</h2>
    <button onclick={() => store.dispatch({ type: 'increment' })}>{store.state?.count}</button>
  </section>
{/snippet}

<ApplicationRoot definition={application} options={{ dependencies: undefined, initial: { input: undefined } }}>
  {#snippet children(app)}
    <ApplicationHost {app}>
      <FeatureViews store={app.store} {definition}>
        {#snippet children(views)}
          <main><FeatureOutlet view={views.item} /></main>
        {/snippet}
      </FeatureViews>
    </ApplicationHost>
  {/snippet}
</ApplicationRoot>
```

## Render components and nested views

A declaration takes exactly one mode: `render` for a Svelte component, `content` for a snippet, or `headless: true` for a feature with no view. Every composed slot needs a declaration. A rendered child composition with its own slots also requires `children`, the view definition created from that exact child composition. A leaf rejects `children`; headless covers its entire subtree.

To move the counter presentation into `ItemView.svelte`, use this component and change its declaration to `item: { render: ItemView }` after importing it. The composition and reducers stay the same.

```svelte
<script lang="ts">
  import type { FeatureViewProps } from '@composable-svelte/core/application';

  type Item = { name: string; count: number };
  type ItemAction = { type: 'increment' };
  let { store, surface }: FeatureViewProps<Item, ItemAction> = $props();
</script>

<section use:surface>
  <h2>{store.state?.name}</h2>
  <button onclick={() => store.dispatch({ type: 'increment' })}>{store.state?.count}</button>
</section>
```

A render component receives `store`, `views` and `surface`. `store` is its scoped `ChildView`; `views` holds its nested slot handles. A nested component places those handles with `FeatureOutlet`. Type its props with `FeatureViewProps<State, Action, Children>`, or derive them with `FeatureViewPropsOf<typeof composition>`. Declare only the props used by the component.

Create view definitions once for their rendering scope. A definition is frozen and holds no store. `FeatureViews` binds it to the matching application or child projection. Place each rendered slot handle in exactly one outlet; an outlet renders every live instance of that slot. Required outlets cannot simply be omitted while their layout remains active.

## Presentation surface

Surface registration makes an element eligible for capture; it does not select
or run an automatic entrance or exit animation.

Optional and destination-case renderers receive a genuine `PresentationView`.
Use `PresentationFeatureViewProps<State, Action, Children>` for their props when
they call `store.dismiss()`; no cast is necessary. The complete
[presentation example](./application-presentation.md) shows this path. Typed
`scopeTo(app.store, slot)` is also a managed binding path; the legacy fluent
raw-store scoping overload does not mint dismissal authority.

`surface` is a framework-supplied Svelte action, `Action<HTMLElement>`. Apply `use:surface` to the element that visually represents the feature. The framework owns registration, capture eligibility, cancellation and cleanup. Application code needs no capture registry, subscriptions, timers or unregister calls.

When a feature is removed, outgoing capture follows these rules:

| Connected surfaces | Outcome |
| --- | --- |
| Exactly one | That element is eligible for capture, subject to the framework's capture safety checks. |
| Zero | Capture is intentionally skipped; the application remains live. Omitting `surface` is valid. |
| More than one | Capture is skipped safely; the framework does not choose an arbitrary element. |

Fragment roots and elements without the action are never selected automatically. A component and a content snippet follow the same rules. Skipping capture affects presentation only; state and dispatch remain available to live features.

The action targets an HTML element. An SVG root is not a supported presentation surface. If a render component's visual root belongs to a child component, pass `surface` to that child and apply it to the child's single HTML root; placing a component tag does not attach the action for you.

`FeatureViews` can also bind a raw managed store without `ApplicationHost`. This is a low-level compatibility path for a caller that already owns and retires that store, not the recommended application starting point. It still renders and dispatches, but has no Host presentation registry and performs no outgoing capture. Start ordinary applications with Root and Host.

`FeatureOutlet` adds no wrapper or element around the feature. Framework lifetime management adds none either, so structural selectors such as `:first-child` and adjacent combinators apply to your elements on first mount and after hydration.
