# Template seeding notes

This is a read-only design inventory for the semantic-flow and later architecture layers. It is based on the current starter and public application, routing, views, presentation, motion, and navigation examples. Values described as authority are potential-authority classifications for the five detector families, not proof of genuine runtime capability identity. This note does not qualify the checker or those examples.

## Recognition boundary

Recognize framework behavior only after `semantic-origins` resolves an import to an `anchors.mjs` entry. Local spelling such as `app`, `store`, `views`, `surface`, or `motion` is never evidence. Aliases and public re-exports may retain the resolved anchor; a shadowed local must not. The generic flow engine should propagate values through calls, properties, objects, destructuring, snippets, and imports. A template seeding pass must supply the values created by Svelte component/snippet relationships, because those are not TypeScript `CallExpression`s.

The parser already exposes the required structural evidence: `component`, `attribute`, `snippet-declaration`, `render-tag`, `attach-tag`, and `use-directive` markers, each with lexical scope; template expressions are typed AST units. Match a component marker to an import-origin anchor, then read its actual attribute expressions and direct child snippet marker. Do not match raw component tag text alone.

## Root and Host

The starter and routing examples use:

```svelte
<ApplicationRoot definition={application} options={...}>
  {#snippet children(app)}
    <ApplicationHost {app}>...</ApplicationHost>
  {/snippet}
</ApplicationRoot>
```

The public `ApplicationRoot` type is `children: Snippet<[ApplicationInstance<S,A>]>`; its implementation renders `children(app)`. For a Root component anchor:

1. Flow the real `definition` and `options` attribute expressions into the Root site. Preserve aliases, object spreads, `dependencies`, and `initial` descendants. Do not mark the whole options object as authority.
2. Seed the direct `children` snippet's first parameter binding with an `app` authority tied to that Root site and definition value. Parameter destructuring must use the symbol layer's binding paths.
3. Propagate `.store` from that application instance as store authority through ordinary property flow.

`ApplicationHost` consumes the exact `app` attribute. It establishes a host/lifetime boundary for later rules but creates no new application or store value. A bare `{app}` attribute is still an attribute expression. `owner` is an internal compatibility branch in source, not a public-authoring seed.

`useApplication(definition)` is an import-origin `application-instance` anchor. Its result is application authority associated with the supplied definition and nearest Root context. Static flow may record the definition input and result; it must not invent a Root, silently equate different definitions, or turn a second constructor/options argument into ownership.

## Managed views and outlets

The public views and presentation examples establish this chain:

```svelte
<FeatureViews store={app.store} {definition}>
  {#snippet children(views)}
    <FeatureOutlet view={views.item} />
  {/snippet}
</FeatureViews>
```

`defineViews(composition, declarations)` returns the anchored view-definition value. Declaration values can be `content` snippets, imported `render` components, nested `children` definitions, or destination `cases`; generic object/property flow must retain them.

`FeatureViews` is typed as `store: ManagedProjection`, `definition: ViewDefinition`, and `children: Snippet<[ViewHandles<C>]>`. At an import-origin FeatureViews marker, seed the direct children snippet parameter with a view-handles value related to both the incoming store and definition. Property access such as `views.item`, `views.parent.destination`, or a destructured handle must preserve the selected declaration path and originating projection. Never seed every variable named `views`.

`FeatureOutlet` consumes its actual `view` attribute. It does not itself mint store or dismissal authority. The link from `views.item` to a renderer/content snippet comes from the matched `defineViews` declaration path. That link seeds the renderer's public props:

- `FeatureViewProps<S,A,C>`: `store` is a `ChildView`, `views` contains nested handles, and `surface` is a framework action.
- `PresentationFeatureViewProps<S,A,C>`: the same shape, except `store` is a genuine `PresentationView` with owner-bound `dismiss()`.

For an inline content snippet such as `itemView({store, surface})`, seed its parameter binding using its destructuring paths. For an imported render component using `let {store, views, surface}: ... = $props()`, cross the component boundary by matching the declaration's `render` value to that component module and seed the `$props()` binding leaves. Core type annotations and casts intentionally seed **potential** store/view authority so a cast cannot bypass a detector; that classification does not certify that the runtime value is a genuine `PresentationView`.

Nested definitions repeat the same rule using the parent props' `views`; scope and declaration path must prevent a sibling or parent handle from being substituted. Low-level raw managed `FeatureViews` is documented compatibility behavior, so Host presence is tracked separately from whether the handle exists.

## Presentation callbacks and surfaces

The presentation example passes the genuine view to `Modal`, invokes `store.dismiss()`, and dispatches `entered`/`exited` through callbacks captured from that view. Flow must preserve the same potential PresentationView receiver through callback closures; independent source review remains responsible for genuine-capability compliance outside the five automated detector families. Deferred dismissal is configuration on managed composition; a second dismiss call is not a completion seed.

`use:surface` is a `use-directive` marker. Link its expression to the framework-supplied props leaf. It registers a surface for that view; it does not create presentation, dismissal, motion, or DOM authority by itself.

## Motion

`defineMotionRecipe` returns a recipe value. `useMotion(recipe, stateGetter)` and `useMotionGroup(...)` return anchored motion-binding values only when their imports resolve to `@composable-svelte/core/application/motion`. Preserve property paths including `motion.style`, `motion.attach`, and `motion.targets.first.{style,attach}`. Match `use:motion.attach` through the use-directive expression and the corresponding `style` attribute through ordinary property flow. These handles require an enclosing Host for later policy, but they do not grant store, presentation, dismissal, or completion authority.

## Required cross-component controls

Seed tests should include aliased imports, local shadowing, shorthand and explicit attributes, destructured snippet/props parameters, imported render components, and nested view paths. A component with the same local name from another package must not seed framework values, while a core authority cast must conservatively seed potential authority. Wrong declaration/Root substitution, Host presence, and genuine-versus-fabricated capability identity remain staged or manual compliance concerns unless a separately approved detector owns them; this seeding design does not promise those automated qualifications. Inert callbacks inside `defineApplication`/`defineViews` objects remain values until their documented framework edge invokes them; object reachability alone must not classify their bodies as executed zones.
