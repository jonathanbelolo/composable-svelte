# Core 0.13 release scope and migration

Install with `npm install @composable-svelte/core@0.13.1 svelte`. The bundled starter and executable agent examples pin this release. Read the [agent patterns](./agent-patterns.md), [executable examples](./examples/agent-patterns/README.md), and [owned-work testing guide](./testing-owned-work.md) alongside the contract.

## Supported scope

The [application authoring contract](./application-contract.md) defines the
intended application architecture and the boundaries for custom integrations.

This release targets small applications using core state, effects, managed application composition, navigation and standard presentation components. Use the [consumer guide](./consumer.md), [application ownership](./application-ownership.md), [application views](./application-views.md) and [routing guide](./application-routing.md) together.

The [application motion guide](./application-motion.md) shows the supported authoring path. Single-element and grouped motion are available through `@composable-svelte/core/application/motion`. Applications declare their motion recipes and state; the managed runtime owns playback lifetime and cleanup. Automatic animation defaults across every presentation component remain incomplete. Examples which use an explicit `PresentationState` bridge label that compatibility path; it is not a claim that presentation choreography is fully automatic.

## Breaking changes

Presentation components require genuine framework-bound presentation views. Obtain them through managed composition and typed view bindings. Do not pass a raw store, fabricate a `dismiss` method, or cast a legacy scoped store into a presentation view.

The raw dismiss factories and `DestinationRouter` are retired. Use managed presentation dismissal and `defineViews`/`FeatureViews`/`FeatureOutlet`. Legacy read/dispatch scoping does not grant dismissal authority. See the [navigation guide](./navigation/tree-based.md) for composition and [dismissal](./navigation/dismiss.md) for the current capability contract.

## Companion packages

The coordinated companion package releases (`auth`, `maps`, `graphics`, and `charts` at `0.3.0`; `code`, `media`, and `chat` at `0.5.0`) declare `@composable-svelte/core ^0.13.1`. They declare Svelte `^5.20.0`, except `code`, which requires Svelte `^5.30.0`. An application combining packages needs a Svelte version inside every declared range, so any application that includes `code` (directly or as chat's optional peer) needs Svelte 5.30 or newer. Do not bypass peer checks with `--force` or `--legacy-peer-deps`.

The architecture checker is completely optional, its use is discouraged, and it is not installed by the starter. Its practical reliability is unestablished; passing it does not establish architectural correctness.

## Limits

This release does not certify completion of the entire framework remediation specification. Agents are expected to iterate using the bundled reference, tests and architecture review. Broader motion extensions and automatic defaults remain separate work. Review the supported scope before adopting a capability beyond the qualified core path.
