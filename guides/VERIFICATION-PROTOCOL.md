# Verification Protocol

How work in this repository is checked before it is believed. Every rule below
is here because something got past its absence — the scars are named, because a
rule without one gets argued with.

Applies to any change: a fix, a guard, a documentation correction, a count.

## 1. Mutation-verify every fix

The test must fail with the fix reverted. **A test that cannot fail is not a
guard**, however much it asserts.

This is the rule that catches decorative tests, and it has caught several: an
arm whose regex matched nothing passed exactly like a clean tree; a marker
inserted two lines above a fence sat outside the detector's window and the
mutation "passed"; a mutation that left `this.` dangling showed up as *fewer
tests running*, not a failure.

When a guard's whole job is to report zero, it needs a **positive control** — a
deliberately-wrong input compiled through the same path, asserting the machinery
still says so. Otherwise an emptied rule set, a resolution failure and a clean
repository are indistinguishable.

## 2. Probe like a consumer

For packaging changes: `npm pack`, install the tarball outside the workspace,
`import()` each subpath in plain Node, and typecheck a scratch project under
`nodenext`.

Reading the manifest is not the same as resolving it. When the five wildcard
`exports` maps were narrowed, every declared entry point was checked against
Node's own resolver from a workspace that links the package — declared
specifiers resolving, deep paths returning `ERR_PACKAGE_PATH_NOT_EXPORTED`.

## 3. Distinguish verified from inferred

In every report, every commit message, every register entry. If it was measured,
say so; if it was reasoned, say that instead.

Counts are where this fails most often. A number reached for while writing prose
is never measured, however careful the paragraph around it is — this register
recorded eight wrong counts before it stopped keeping them by hand.

## 4. A runaway effect poisons the rest of the test file

One real failure shows up as several. Isolate the first before concluding
anything about the others. When `ImageGallery` was broken, four healthy
components failed alongside it.

## 5. Core's browser suite is flaky under load

Re-run before believing a failure. Relatedly, **run test suites per workspace,
sequentially** — `pnpm -r test` starves the real-Chromium suites and produces
failures that are about scheduling, not code.

## 6. A concurrent agent mutating the tree looks exactly like a flaky test

During Wave 3, `dependency-freshness` failed intermittently with the precise
defect signature `(first=1, second=0)` while a review agent was reverting source
files to run its own mutations. Every case passed in isolation.

Do not run the full suite while another agent has the working tree.

## 7. Build before running the gate

`dist-freshness` compares `dist` mtimes against sources, and cross-package tests
import built output — so a stale `dist` means a green suite ran against code
that is not in the diff. Mutation testing trips this constantly, because
restoring a file updates its mtime even when the contents are identical.

## 8. Write edits incrementally, never behind a late assertion

A multi-edit script that asserts late can abort *after* an earlier write has
landed, silently discarding it. One edit was lost that way and found only by
probing the logic in isolation. Assert each anchor immediately before its own
write, and prefer a failed edit to a partial one.

---

**Related:** `guides/ANIMATION-GUIDELINES.md` is the equivalent authority for
animation, and is enforced by `packages/core/tests/repo/animation-policy.test.ts`.
The open defect backlog lives in `plans/hardening/README.md`.
