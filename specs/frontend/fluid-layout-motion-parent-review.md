# Fluid layout motion — parent design review

26 September 2026 · Local source/design review, not independent Opus review

Reviewed `fluid-layout-motion-design.md` against the completion addendum and
existing routing, placement and capture mechanisms. No runtime changes or tests
were performed. Corrections below have been incorporated in the design.

## Findings and dispositions

| Severity | Finding and concrete failure | Correction |
| --- | --- | --- |
| High | An unspecified commit cue could replay an action that already saved data, or navigate after a replacement request | Explicit staged intent, separately declared domain commit action, root-owned identity, queued revalidation and at most one commit attempt |
| High | A navigation tied to a Host/driver could remain pending forever when no Host attaches or it detaches | Root-owned cue deadline; absent/detached Host skips decoration and admits the valid queued commit; root destruction cancels |
| High | A transparent semantic link can receive invisible keyboard focus or present a hit target unrelated to its moving copy | Visible real-control default; focus reveals semantic target and settles conflicting decoration; no interaction authority in copies |
| High | Mounting a future page to measure it can run effects; stale measured fonts/layout can produce a jump at commit | Restricted immutable render-only projection, no live feature component, preparation fingerprint, validation and bounded retarget/fallback |
| Medium | “Atomic route/history change” could imply rollback across browser I/O that the framework cannot guarantee | Domain atomicity distinguished from history write; reuse existing binding failure policy and test write failures |
| Medium | Nested shared participants can duplicate descendant content and apply transforms twice | Explicit capture boundaries, coordinate composition, paint/clipping leases and preflight conflict detection |
| Medium | Unlimited claims of velocity continuity are infeasible for arbitrary drivers and invalidated geometry | Distinguish pose/velocity guarantees, qualify continuation capability and document fallback |
| Medium | Broad and focused documents could evolve into inconsistent contracts | Explicit precedence link for navigation authority and refined interaction/preparation rules |

## Source grounding

- `packages/core/src/lib/application/routing.ts`: current routing consists of pure
  request/serialization/write-policy decisions; staged intents are new capability.
- `packages/core/src/lib/routing/managed-binding.ts` and `managed-history.ts`:
  history failures and traversal have existing policies; motion cannot replace them.
- `packages/core/src/lib/application/renderer/placement.svelte.ts`: actual outlet
  placement is owner-scoped and validated; arbitrary duplicate live placement is
  not a safe destination preparation mechanism.
- `packages/core/src/lib/application/renderer/capture-html.ts`: existing capture
  rejects substantial layout/rendering cases; future geometry support needs proof.

## Verdict

The revised design is suitable for an isolated feasibility prototype. It is not
yet a finalized public API or proof of production motion support. The highest-risk
proofs are queued staged navigation with TestStore parity, source capture timing,
effect-free destination preparation, semantic interaction during handoff and
continuous retargeting of overlapping tracks.

An Opus 5.5 independent review was requested through Claude Code. The initial
sandboxed process reported unavailable login. A launch with normal authentication
access was then rejected by automatic approval review over external transfer of
local documents and relevant source. The user subsequently approved that scope.
The independent [Opus report](fluid-layout-motion-opus-review.md) is now complete;
see the [dispositions](fluid-layout-motion-review-dispositions.md). This parent's
earlier detach-then-commit correction was incorrect and has been superseded:
history attachment detachment cancels the pending staged request. The original
table above records the initial review, not the final disposition.
