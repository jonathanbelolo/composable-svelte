# Multi-step form demo

A generic three-step onboarding demonstration: personal information, address, and review. It uses two public form reducers, Zod schemas, asynchronous email/ZIP validation, and a parent reducer for navigation and final submission decisions.

Run `pnpm dev`, `pnpm test`, `pnpm check`, or `pnpm build` from this directory. Package imports resolve through the workspace package's published exports; build core first after changing it. `$lib` source aliases are reserved for local development tooling.

## Application responsibilities

The parent delegates `submitTriggered` to the active form. The framework runs schema and asynchronous validation before submission. The parent progresses only after the child reducer accepts a successful completion, observed through its submit count and outcome. An obsolete completion rejected by the child cannot advance the wizard.

Editing a completed form invalidates that step's saved completion. Navigation to later steps and final submission require current approved data. The review screen displays the completed snapshots. The demo's final submission uses `Effect.afterDelay` in an effect group to simulate 1.5 seconds of latency; it performs no external write. Reset cancels this group and invokes each form reducer's public reset action, preserving framework validation/submission invalidation semantics. Store destruction releases pending framework delays.

Reducer composition is constructed once with concrete form state/action types. The view reads store state directly through getters and derived values. It destroys the store it creates on unmount. Step buttons expose accessible names and the current step.

## Current compatibility boundary

The two small typed form projection objects in App.svelte are retained legacy compatibility code: FormField requires a subscribing form store, while the currently published `scopeTo` facade does not supply that contract. They forward state, dispatch, and subscription selection only. They do not create their own timers or lifecycle authority. This is an explicit framework gap; migrate them to the planned subscribing typed facade before presenting this demo as the final clean authoring architecture. Do not copy these wrappers as a new recommended application pattern.

## Validation

The browser suite exercises the real UI, including async validation, step navigation, review, submission, accessible step state, and teardown. Step navigation assertions await visible transitions instead of assuming validation finishes within 100ms. The focused reducer tests use actual stores and public form effects, checking rejected async validation, stale completion, edited snapshots, duplicate submission, reset cancellation, and destruction. Mounted teardown tests verify the component destroys its real store and releases the pending submission delay.

No application networking, persistence, or authentication is implied by this demo. Production business submission belongs in an injected dependency with the framework's cancellation semantics.
