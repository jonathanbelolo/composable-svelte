# Upgrade 1 starter and fresh-agent exercises

Status: bounded implementation and qualification proposal. This document contains no implementation code and does not launch a worker.

## Managed starter packet

### Goal

Convert the shipped core consumer from component-owned `createStore`/`onDestroy` setup to the smallest genuine managed application while preserving its current counter behavior and toolchain:

- initial count `0`;
- Increment updates the count;
- Load uses an injected asynchronous dependency, resolves to `42` by default, and clears loading on success or failure;
- Theme toggles the document's `dark` class;
- deterministic SSR, strict Svelte/TypeScript checking, unit tests, production build, and Playwright coverage.

This first packet is intentionally route-free and has no artificial optional child. Routing, managed feature views, and presentation are exercised by the published canonical guides and the later fresh-agent scenarios. Keeping them out of the counter avoids turning the starter into a partial benchmark answer.

### Exact ownership

| Path | Operation | Requirement |
| --- | --- | --- |
| `packages/core/consumer/src/application.ts` | add | Export one inert `defineApplication` definition using the existing reducer and a pure initial-state factory. No store construction or browser access at module evaluation. |
| `packages/core/consumer/src/App.svelte` | modify | Replace `createStore` and `onDestroy` with `ApplicationRoot` and `ApplicationHost`. Accept a typed initial input and injected dependencies, with defaults that preserve count `0` and load result `42`. Render the existing heading, count, Increment, Load, and Theme controls. |
| `packages/core/consumer/tests/counter.test.ts` | modify | Keep the success/failure effect assertions, run the reducer with managed TestStore execution, inject deterministic loaders, assert every received action, and finish every store. |
| `packages/core/consumer/scripts/ssr.mjs` | modify | Render independent managed roots at least twice, assert stable initial count/heading, byte-stable output for equal inputs, distinct output for a different initial input, and no browser requirement during server render. |
| `packages/core/consumer/README.md` | modify | Describe this as the managed baseline, name Root/Host ownership and injected dependencies, retain copy/install/run instructions, and link the installed application contract. Do not claim routing, feature composition, presentation, or motion are demonstrated by this starter. |

The packet must not modify `src/counter.ts`, `src/main.ts`, `src/app.css`, `browser/app.spec.ts`, `package.json`, lockfiles, Vite/Vitest/Playwright configuration, `index.html`, public framework source, or documentation outside the starter. The existing browser test is retained unchanged as the behavioral regression. A demonstrated build requirement may justify a separately reviewed expansion; convenience does not.

Baseline hashes for review are: `App.svelte` `515b02db…`, `counter.ts` `04c1e78e…`, `counter.test.ts` `3c5b0ec4…`, `app.spec.ts` `662cd020…`, `ssr.mjs` `63c348e8…`, and `README.md` `255475be…`.

### Implementation constraints

- Use public imports only. The component receives the instance from the Root snippet and places the existing UI beneath the Host. Do not add a wrapper facade, manual store cleanup, a module singleton, a lifecycle subscription, or browser work to the reducer/definition.
- Preserve `src/counter.ts` as the business domain. The new application module assembles it; it does not duplicate the reducer or state.
- Keep dependency injection visible and typed. Tests and SSR must be able to supply deterministic dependencies and initial input without changing module globals.
- Theme is ordinary local DOM interaction permitted by the application contract. It must not become feature state or an effect solely to appear architectural.
- The managed TestStore test uses `execution: { mode: 'managed' }`; TestStore's legacy default is not evidence for the managed starter.
- No routing, optional slot, dialog, motion recipe, timers, fabricated presentation view, or unsupported capability is added to make this packet look broader.

### Regression gates

Run from a clean copy of the packaged starter installed against the exact release-candidate tarball:

1. `npm ci --ignore-scripts` without `--force`, legacy peer bypass, workspace links, or source aliases.
2. `npm run check`: zero errors and warnings; include every added source/test file.
3. `npm test`: injected success receives `loaded(42)`, injected failure receives `failed`, both clear loading, and every TestStore finishes with no pending work.
4. `npm run build`: production build succeeds and contains no private framework import.
5. `npm run test:ssr`: two equal request-owned renders are byte-stable, a distinct initial input stays isolated, expected count/heading are present, and no DOM global is needed.
6. `npm run test:browser`: the unchanged existing count/load/theme behavior, production styling, and page-error control pass against the managed implementation.
7. Independently supplied architecture policy scans a nonempty reachable graph and confirms managed Root/Host ownership, no application store constructor or manual destroy, no module singleton, and no hidden manual routing/presentation/resource orchestration. The project cannot supply or disable this policy.
8. Mutations that restore `createStore`/`onDestroy`, move the same ownership into a helper, or make the SSR store a module singleton must fail the intended architecture or isolation gate; restored bytes rerun green.

Root lifecycle interruption is already framework-qualified and is not duplicated with a test-only starter seam. This packet proves correct consumer assembly and retained behavior.

## Fresh-agent cohort protocol

Freeze one exact prerelease version/tarball integrity, installed consumer instructions, documentation hashes, checker version, external policy, acceptance tests, agent configuration, and the two briefs before any run. The generated projects cannot write the checker, policy, held-out tests, or exception registry. Run three clean, independent attempts per scenario with no repository checkout, private skills, reference solution, prior run, or conversational architecture coaching.

After the initial acceptance run, deliver the scenario's withheld change request verbatim. Permit at most one repair round driven only by published checker/build/test diagnostics. Preserve the first result, change diff, diagnostics, repair, interventions, and final evidence. A public API, docs, policy, checker, prompt, or package-byte change invalidates the six-run cohort.

## Scenario A business brief: Waypoint workspace

Build a fictional workspace that lists neutral records in a navigation panel and shows the selected record on a detail page. A record detail is loaded through an injected asynchronous service. Direct URLs to a record must work, browser Back/Forward must remain correct, and choosing another record must cancel or reject obsolete work so an older response never replaces the current detail.

The detail page has an edit dialog. The dialog has a clear close rule: while its save is pending, Escape, backdrop, and Cancel cannot close it; after completion or cancellation it can close normally. Saving and failure are business actions with deterministic tests.

Customize one coordinated, fixed-target panel/detail transition and one element-level status animation. Navigation and control state update immediately; animation never decides whether navigation or saving succeeded. Interruption, reduced motion, teardown, SSR stable markup, keyboard operation, and a narrow responsive layout are required.

### Withheld change A

Add rapid keyboard selection across records and a compact layout in which the panel appears above the detail content. A delayed response from the previously selected record must remain stale. Change the detail status presentation so it conveys loading, saved, and failed states without delaying navigation or eligibility. Preserve direct URLs, Back/Forward, the dialog close rule, reduced motion, and interruption behavior.

This change does not require shared-element geometry, dynamic layout measurement, or reorder animation.

## Scenario B business brief: Field index

Build a fictional searchable list of neutral entries with a detail page. Search uses an injected asynchronous service and cancels or rejects obsolete requests. Users can reorder the currently displayed entries by stable identity; filtering or refreshed results must not transfer an old entry's work or selection to another entry.

The detail page includes an editor dialog with a documented dirty/save close rule and deterministic save failure. Add one coordinated, fixed-target list/detail or module transition and one custom element-level status indicator showing idle, searching, result, and failure states. Its semantic text/state changes immediately. Support direct detail URLs, Back/Forward, interruption, reduced motion, teardown, SSR stable markup, and keyboard use.

### Withheld change B

Add a “flagged only” filter and allow a reorder while a search is pending. Then change the query before the old response returns. The final list must reflect the current query/filter, retain the stable order of surviving identities, and ignore the obsolete response. Revise the status indicator's presentation for filtered and stale-result states without adding timers or making animation drive business state. Preserve routing, the editor close rule, reduced motion, and interruption behavior.

The requested reorder is a state operation; animated reorder geometry is not required.

## Externally owned acceptance matrix

| Gate | Scenario A | Scenario B | Required evidence |
| --- | --- | --- | --- |
| Package isolation | Exact pinned core prerelease; public exports only | Same | Lock integrity, physical install paths, no workspace links/source aliases |
| Managed ownership | One declarative application Root/Host; request-owned SSR | Same | Static/checker result plus repeated SSR isolation |
| Business effects | Selected-detail load; save success/failure; stale A response rejected | Search/save success/failure; cancellation; stale query response rejected | Exhaustive managed TestStore transcripts and deterministic fakes |
| Routing | Direct record URL, selection, Back/Forward, unsupported URL behavior | Direct entry URL, selection, Back/Forward, unsupported URL behavior | Browser tests controlled outside project |
| Presentation | Genuine managed editor view; pending-save close rule; reopen/replacement safety | Genuine managed editor view; dirty/save close rule; reopen/replacement safety | Browser behavior plus stale-view/owner acceptance where applicable |
| Coordinated motion | Fixed panel/detail targets using supported recipe graph | Fixed list/detail or module targets using supported recipe graph | Intermediate/settled browser relationships, interruption, reduced-motion endpoints, teardown |
| Element motion | Status state changes semantically before playback settles | Idle/search/result/failure indicator does likewise | Accessible state/text plus stable visual endpoints |
| Held-out adaptation | Rapid A→B selection and compact layout; stale A rejected | Filter + reorder during pending search; current query/filter/order wins | Pre-registered held-out functional tests |
| Accessibility/SSR | Keyboard selection/dialog, focus remains usable, stable nonhidden SSR | Keyboard list/dialog, focus remains usable, stable nonhidden SSR | Browser accessibility assertions and deterministic SSR |
| Architecture | No manual history writer, presentation subscription/timer, fabricated view, competing playback loop, hidden helper authority, DOM/I/O in reducers, or disabled scan | Same | Independent named policy; reachable graph; fail-closed unsupported inputs; zero final violations |
| Build integrity | Check, unit, production build, SSR, browser, architecture all pass | Same | Orchestrator-run commands; missing/skipped gate fails the run |

The functional harness should use roles and business-visible state rather than prescribe component/file names. Architecture and behavior are separate results; one cannot compensate for the other.

## Claims explicitly unavailable in this bounded upgrade

Even a green starter and six green runs do not establish the full application-authoring and motion specification. Keep these obligations open:

- The starter packet itself does not deliver the specification's routed starter with an optional feature; it is only the first managed ownership increment.
- Automatic page, presentation, focus, and motion defaults across the component catalog remain incomplete. Explicit `PresentationState`/deferred-dismissal compatibility paths are not automatic lifecycle generation.
- Dynamic/shared-layout transitions, shared elements, automatic animated reorder geometry, late-layout measurement, and arbitrary target discovery are unavailable; the exercises use declared fixed targets only.
- There is no public managed custom-driver extension, geometry/frame context, driver watchdog/fallback contract, or qualified third-party driver catalog.
- The first checker slice cannot claim complete presentation, motion, resource, pure-decision, or adapter enforcement. Unsupported analysis must remain fail-closed and inactive rules must be reported honestly.
- SvelteKit navigation, public memory routing, nested route outlets, link interception, scroll restoration, title policy, visibility policy, and alternative history codecs remain outside this scope.
- The complete §14.2 regression/mutation matrix, Chromium/Firefox/WebKit coverage, 100-cycle resource baselines, heap/frame profiling, repeated-list micro-binding measurement, and four reviewed bundle budgets are not supplied by these two exercises.
- The full fictional reference demo, migration responsibility diff, preset/recipe/custom-driver pairs, capability catalog, complete policy reconciliation, companion packages, and catalog expansion remain separate deliverables.
- Six bounded runs demonstrate only this pinned cohort. They do not prove universal agent reliability, close full AAM-15/SPEC-195, or permit moving `latest`.
