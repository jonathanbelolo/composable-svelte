# Inventory routing demo

A generic, in-memory demonstration of framework-owned browser routing. It is not a production inventory system.

Run `pnpm --filter @examples/url-routing dev` from the workspace root. Use `pnpm --filter @examples/url-routing check`, `test`, and `build` to verify it.

## Assembly

`application.ts` defines the reducer, pure initial-state factory, URL parser and serializer. `App.svelte` creates the application through `ApplicationRoot` and attaches its browser rendering through `ApplicationHost`. `InventoryView.svelte` obtains the typed application context and supplies content and event-to-action bindings. The browser entry point injects the initial URL; construction never reads a browser global from a component or reducer.

The framework owns the store lifetime, history connection, traversal reconciliation and cleanup. Reducers return business state and no navigation effects. There are no application history subscriptions or completion timers.

Both `/` and `/inventory` are valid list pages. Selecting an item opens `/inventory/item/:id`; Back returns to the actual preceding URL, including `/`, and Forward reopens the item. `/inventory/add` opens the add form. Unknown IDs and unknown paths show explicit recovery content. Unsupported leading-double-slash paths canonicalize to `/not-found`, so they cannot be interpreted as network-host URL references. Item IDs are URI encoded. Known routes do not use query parameters; fragments remain native browser anchors.

Route state describes the accepted page. Filters remain local application state and do not create history entries. Data is seeded in memory on each new application instance; links do not serialize user edits and a reload does not persist them.

## Current scope

This demonstrates the managed browser routing and application ownership APIs. Its two existing modal views and native delete confirmation are compatibility UI; they are not a reference for the forthcoming managed presentation, focus, or motion assembly. That migration remains separate. This SPA is not a SvelteKit router integration.

The regression suite covers root Back/Forward, missing item recovery, malformed/encoded routes, application remount, reducer effect purity, valid button structure, and existing modal dismissal behavior. Native keyboard/history behavior is additionally checked against a production Chromium preview in the remediation evidence.
