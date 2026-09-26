# Changelog

Release guidance: the architecture checker is completely optional, its use is discouraged, and its practical reliability is unestablished. It is not an acceptance or release requirement. The Core starter no longer installs or runs it by default.

## [Unreleased]

## [0.13.1] - 2026-09-26

### Added

- Stable development-only checker and bundled starter policy paired with core 0.13.1.
- Bundled `chat`, `code`, `media` and `chat-code-media` developer-feedback profiles with exact core 0.13.1, companion 0.5.0 and Svelte 5.55.3 approvals.
- Bundled `maps`, `graphics`, `charts` and `auth` developer-feedback profiles with exact core 0.13.1, companion 0.3.0 and Svelte 5.55.3 approvals.
- TypeScript instantiation expressions such as `chartReducer<Row>` are analyzed as their underlying value, like other erased type syntax, instead of being reported as unsupported.
- Object-literal getters that only return a local binding, and `new Promise` with one local synchronous executor, are analyzed. Promise settle functions must stay in local bindings and must not reach templates, components, DOM handlers or packages. Resolved values, rejected values and values thrown by `throw` statements reachable while the executor runs must be plain data. Other getters, `Promise` combinators, `.then` chains and async executors are still reported as unsupported.
- Values bound by `{#each}` items, `{@const}` and `{:then}` are analyzed like the equivalent script bindings, so authority reaching a template through them is reported. Earlier releases did not model these values. `{:catch}` values stay unmodeled, like script `catch` bindings. These bindings can now report the same unsupported constructs as their script equivalents, for example iterating a value exported by an opaque package.

### Changed

- The starter policy approves exactly core 0.13.1; its supported range is a pairing bound, not an approval.
- Default values in snippet parameters and in `{#each}`, `{@const}`, `{:then}` and `{:catch}` destructuring are now reported as unsupported (`template-binding-default`). Earlier releases skipped them without analysis. Patterns without defaults are unaffected.
- Computed keys in the same template binding patterns are now reported as unsupported (`template-binding-computed-key`). Earlier releases skipped the key expression without analysis.

## [0.13.0] - 2026-09-24

### Added

- Stable development-only checker and bundled starter policy paired with core 0.13.0.

### Fixed

- Preserve framework authority through compiler-recognized Svelte `$derived` and `$derived.by` expressions, including inspectable bound callbacks, while retaining existing opaque-call checks.
- Correct callback capture analysis used by agent-built applications.

## [0.13.0-next.1] - 2026-09-22

### Added

- Development-only CLI paired with core 0.13.0-next.1, with bundled starter analysis
  and externally pinned qualification policies.
- Five bounded rule families for routing, presentation subscriptions, reducer
  purity, resource ownership, and competing motion. Incomplete analysis refuses
  qualification; passing checks still require independent architectural review.
