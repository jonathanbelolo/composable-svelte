# Managed Chat recipe

`ManagedChat.svelte` ships in this npm archive. It opens an optional chat slot,
renders the exact `FeatureViewProps.store`, and, when `streamComplete` reaches
the parent, archives the chat's last assistant reply in parent state once per
message id (see the limits of that guard below).
`managed.test.ts` supplies a deterministic transport and proves reply handoff,
stream abort on owner retirement, and that a retired owner's late completion
archives nothing.

In a Svelte/Vite consumer with compatible `@composable-svelte/core`,
`@composable-svelte/chat`, Svelte, Vitest, Playwright,
`@vitest/browser-playwright`, and `@sveltejs/vite-plugin-svelte` installed:

```sh
mkdir -p recipes
cp -R node_modules/@composable-svelte/chat/recipes/managed recipes/managed
npx vitest run --config recipes/managed/vitest.config.ts
```

The copy keeps tests out of `node_modules`, which Vitest excludes. The child
reducer owns message and streaming state. The parent reducer owns server sync,
archived replies, and reactions; it receives child actions after reduction,
including ones the chat ignored. A `streamComplete` with no reply in flight is
not a completion, so the parent archives a reply only if its message id is not
archived yet; `generateId` must keep ids unique for the application's lifetime.
This guard does not authenticate actions: a `streamComplete` your own code
dispatches after Stop or `restoreMessages` still archives the last assistant
message. A transport callback that arrives after completion, Stop, supersession
or retirement is dropped before either reducer sees it.
Closing the slot retires the owner and aborts a pending stream. Do not keep a
retired ChildView or rebind a mounted chat to a new owner without remounting.
If an optional code, media, Prism, or PDF peer is absent, its dependent display
falls back; install that peer to enable the feature. The optional
`@composable-svelte/code` peer requires Svelte `^5.30.0`, so enabling it needs
Svelte 5.30 or newer. If a managed command does
not reach its child, check that the view is live and unwrapped and that the app
has one copy of core. A late stream callback from a retired owner is ignored.
