# Managed map integration

## Start here

The [installed consumer recipe](./fixtures/installed-consumer/README.md) is a complete `defineViews` / `FeatureViews` / `FeatureOutlet` application using public exports. Copy it outside this package and run `npm install`; its manifest names the published core `^0.13.1`, maps `^0.3.0`, and Svelte `^5.20.0` ranges. Then run `npm run check`, `npm run build`, `npm run ssr`, and `npm run test:browser` (with Playwright Chromium installed).

## Ownership contract

The application root owns `MapState` and dispatches `MapAction`. `defineViews` creates the child view; pass that view as `store` to `Map`, layers, popups, and controls. The map component owns its native adapter, including a supplied `adapter`, and destroys it when the view emits terminal `undefined` or the component unmounts. An adapter and store stay fixed for one mounted `Map`; key a replacement so it gets a fresh adapter. A retired map has no live canvas, even while surrounding exit markup remains.

## Operation policy

Represent persistent viewport, marker, layer, popup, style, and provider changes as reducer actions. Send map click business events through the typed child `mapClicked` action and handle the presented action in the parent reducer. Use `onMapClick` for standalone callback use. Style reloads reconcile current layers after the native style becomes ready; do not mutate the native engine behind the reducer. Native marker drag, popup close, and feature click or hover are not currently lifted into matching store actions.

## Troubleshooting and limits

- A blank map in tests often means the browser has no WebGL context. Use the installed recipe's Chromium test for native rendering; jsdom validates lifecycle and state only.
- A custom adapter is owned by `Map`. Supply a fresh instance per mount; a previously destroyed adapter is not reusable.
- Mapbox is optional. Install `mapbox-gl` and provide its access token before selecting `MapboxAdapter`. Its absence does not affect MapLibre use.
- The offline recipe uses local styles; provider tiles and network authentication need separate integration checks.

See [API.md](./API.md) for props and [README.md](./README.md) for standalone examples.
