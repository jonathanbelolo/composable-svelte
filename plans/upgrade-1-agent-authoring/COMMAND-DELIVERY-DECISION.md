# Companion command delivery decision

Status: owner-scoped ephemeral action observation (Option B) is implemented, reviewed and integrated in the local core candidate. Parent verification and immutable candidate receipts are in `evidence/core-companion-integration/`. Code, Media and Chat migration handoffs are integrated. Coordinated version assignment, final artifact qualification and publication remain pending; see `COMPANION-RELEASE-READINESS.json`.

## Decision

Provide `observeChildActions` through `@composable-svelte/core/application` for native view bindings that need ordered child-domain commands. It observes only actions reduced for the exact captured managed owner, after committed state subscriptions, in turn order. Retirement/replacement cancels the observer silently. No history, destruction authority or root action bus is exposed. Ordinary business handoff remains parent reducer composition.

This deliberately extends the earlier baseline statement that managed views have no action observation. It does not add a required member to ChildView or Store. It replaces the queue proposal because the reviewed seam avoids queue state, acknowledgements, capacity/rejection policy and parent action unwrapping for native commands. The state-queue prototype remains evidence, not a second production implementation.

Choose an additive core 0.13.x release, subject to final compatibility tests. Companion peer floors must name the actual core version exporting this API; exact versions are assigned before profile/artifact freeze. No new version is published by this decision.

## Supported inputs and standalone compatibility

Expose a public `isManagedChildView` predicate backed by the same private captured-view registry. It recognizes genuine captured managed views, including retired ones; liveness is a different property. `observeChildActions` on a retired genuine view is inert, while unsupported structural imitations produce an actionable error. Do not silently accept unsupported wrappers and drop their commands.

Package-owned command bindings choose the genuine managed path through the predicate, or the existing standalone Store action-subscription capability. Keep this dual path in a small shared internal helper instead of repeating it in each component. No consumer builds a Store facade, tunnels a root action stream or passes an inverse action map for ordinary managed use. Preserve explicitly supported standalone/custom stores; document actual required capabilities and reject unsupported inputs clearly. Verify predicate/observer types against real built declarations, not ambient mirrors.

The predicate is the chosen response to Opus F1. Exact TypeScript narrowing may be refined under focused review; do not widen action types or weaken nominal ownership merely to satisfy a sample. No required public ChildView member is added.

## Timing and initialization

Delivery is ephemeral and unbuffered. Commands issued before an attachment/observer exists or while an engine is not ready are dropped, preserving current standalone behavior. Do not replay focus/edit/history commands after navigation or reattachment. Initial durable configuration belongs in state/props. If an application genuinely needs an imperative operation on readiness, provide a typed, owner-stamped native-ready fact and an executable recipe; do not prescribe delays or hope that startup commands happen after mount.

Test state-to-engine synchronization before command execution, reentrant follow-up ordering, command-originated value echoes versus newer external writes, same-turn creation/replacement and unsupported source diagnostics. Repair the reproduced value/command and formatting races in the real CodeEditor, not only the prototype.

## Original implementation assignment

The core seam and Code/Media/Chat package migrations described below have been completed locally. These instructions preserve the decision's implementation requirements; they are not a request to restart those lanes. Final coordinated release obligations remain open.

Lane 1 remains sole owner of the prospective core patch in its isolated worktree; other lanes do not edit that core seam. Obtain focused Opus review of this compatibility/timing decision and final API shape. If no material unresolved concern, productionize exports/docs/targeted core tests and begin code migration without another permission request. Keep core and package diffs separate for parent verification/integration.

Remove source aliases and ambient signature mirrors from acceptance tests. Build/pack the core candidate, then prove the real public CodeEditor, CodeHighlight, NodeCanvas/FlowCommands and affected VoiceInput paths from installed exports. Preserve standalone controls. Address NodeCanvas setViewport and actual editor reconfiguration/save/format paths omitted by the B prototype. Package guidance and tests accompany each migration. Media follows the native ownership contract; chat follows code/media, including optional-peer installs and parent-owned business actions.

The core change requires affected browser/node ownership/order/regression checks and export/type-surface checks. Final code reviews apply to exact candidate bytes. Parent owns final shared lockfile/checker/release integration; no publication until the coordinated release gate.
