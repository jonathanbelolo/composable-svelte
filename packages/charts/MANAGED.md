# Managed charts integration

## Start here

The [installed consumer recipe](./fixtures/installed-consumer/README.md) is a complete `defineViews` / `FeatureViews` / `FeatureOutlet` application using public core and charts exports. Copy it outside this package and run `npm install`; its manifest names the published core `^0.13.1`, charts `^0.3.0`, and Svelte `^5.20.0` ranges. Then run `npm run check`, `npm run typecheck:nodenext`, `npm run build`, `npm run ssr`, and `npm run test:browser` with Playwright Chromium installed.

## Ownership contract

The application root owns `ChartState<Row>` and `ChartAction<Row>`. A managed child view supplies the narrow `ChartStore<Row>` binding to `Chart` or `ChartPrimitive`. On terminal `undefined`, the chart releases the Plot SVG, d3 gesture listeners, pending attachment timer, animation frame, and resize observer before outgoing markup unmounts. A replacement binding creates a fresh plot; callbacks from the predecessor cannot retire or redraw the successor. Standalone `createStore` bindings use the same component contract.

## Operation policy

Give `chartReducer<Row>` an explicit row type when assembling a typed store or managed slot. The unparameterized form uses `unknown` rows, which accepts arbitrary data but does not give typed selection callbacks or property keys. Represent persistent data, selection, zoom, filter, and focus in reducer actions. Native wheel and brush gestures dispatch through the child view; handle presented business actions in the parent reducer. `onSelectionChange` receives selected `Row[]` for local presentation. Keep each sibling chart's view and parent case distinct.

## Troubleshooting and limits

- jsdom does not supply real SVG geometry or native gestures. Use the installed Chromium recipe to verify D3 wheel and brush behavior.
- A chart that does not redraw after a prop change should receive its config through reactive props; a changed store binding is supported and rebinds on the next Svelte effect flush.
- Terminal retirement removes the live plot while the surrounding exit layout may remain. Animate the surrounding static layout if a transition is needed.
- A typed chart that rejects a store using bare `chartReducer` needs `chartReducer<Row>` at store assembly.
- The packaged example uses local data and no network service. Browser availability is required for its gesture test.

See [README.md](./README.md) for component options and [INTEGRATION.md](./INTEGRATION.md) for additional recipes.
