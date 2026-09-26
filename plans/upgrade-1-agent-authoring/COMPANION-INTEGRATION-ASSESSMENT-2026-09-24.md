# Companion integration to the Upgrade 1 standard

Assessment: 24 September 2026. This is an investigation and proposed implementation plan, not a claim that companion integration is complete. No package was published or implementation source changed during this investigation. Builds refreshed generated output; the evidence and this plan are new.

## Conclusion

The seven companion packages have a useful, tested implementation base. The remaining work is chiefly to make their public component contracts, native-resource bindings, examples and verification agree with Upgrade 1's managed application architecture. Publishing the current local peer-range changes alone would not achieve that.

The standard is normal agent iteration: an agent can build, test, diagnose and refine a clean application using installed public references. First-attempt success is not required. The framework must make the intended architecture achievable without separate per-widget stores, fabricated managed views, parent action-stream tunnelling, or consumer-maintained resource ownership.

Scope: integrate the existing supported capabilities of auth, charts, chat, code, graphics, maps and media. Core and the architecture checker are enabling dependencies. Deferred products such as CRDT collaboration, real WebGPU, new map routing/geocoding/clustering, additional chart families and streaming video are separate feature decisions, not prerequisites for this integration. Existing advertised capabilities still need an explicit acceptance row; unsupported claims must be corrected.

## Evidence collected now

Every package passed build, TypeScript, Svelte checks and its normal test command against the current core 0.13.0 workspace. Graphics' separate real-Chromium shader check also passed.

| Package | Passing tests | Current npm latest | Published core peer |
| --- | ---: | --- | --- |
| auth | 660 | 0.2.1 | ^0.12.0 |
| charts | 229 | 0.2.1 | ^0.12.0 |
| chat | 310 | 0.4.1 | ^0.12.0 |
| code | 115 | 0.4.1 | ^0.12.0 |
| graphics | 539 | 0.2.1 | ^0.12.0 |
| maps | 139 | 0.2.1 | ^0.12.0 |
| media | 174 | 0.4.1 | ^0.12.0 |

Total: **2,166 tests passed**, with no failed package checks. These are the actual configured suites, not an inferred count of source filenames. Graphics' 539 comprises 537 normal tests and two shader-pixel browser checks. Maps' normal suite is jsdom; these numbers do not establish full real-engine/browser or device coverage.

The existing `scripts/verify-consumer.mjs` also passed with current local tarballs and the published checker: 51 typed entry points under Bundler and NodeNext resolution, 70 packed documents, 271 relative links, 23 extracted README/guide files, browser/SSR checks, Tailwind 3 and 4, and 12 deliberately rejected regressions. This proves substantial packaging and standalone-example compatibility. It does not compose the seven packages as managed children. Its mounted satellite examples cover chart, auth, highlighting/editor, chat and audio; they do not establish real MapLibre/Babylon or microphone lifecycle behavior.

Evidence: [summary](evidence/companion-integration-audit-v1/SUMMARY.json), [checks](evidence/companion-integration-audit-v1/CHECKS.json), [registry snapshot](evidence/companion-integration-audit-v1/REGISTRY.json), [external consumer log](evidence/companion-integration-audit-v1/logs/installed-consumer.log), [source inventory](evidence/companion-integration-audit-v1/SOURCE.json).

## Confirmed integration gaps

### 1. Managed views do not fit the component props

Core's `ChildView` deliberately exposes state, dispatch, selection and subscription; state becomes undefined on retirement. It does not grant store destruction, history or a raw action stream. See [the public view contract](../../packages/core/src/lib/navigation/managed-integration.ts#L267) and [FeatureViewProps](../../packages/core/src/lib/application/view-definition.ts#L6).

A source scan found 32 component/support files across the six non-auth packages declaring full `Store` props. Auth already uses narrower props in many places, but its LoginForm still requires non-optional state and subscriptions.

An actual TypeScript probe against **physically installed tarball declarations** failed for all seven representative components: LoginForm, Chart, FullStreamingChat, CodeEditor, Scene, Map and VoiceInput. Six reject the managed view because it lacks `history` and `destroy`; LoginForm rejects its potentially retired state. There is also a separate compiler error for the absent `subscribeToActions` method. These are measured API incompatibilities, not speculative leak claims. [Probe](evidence/companion-integration-audit-v1/type-probe/probe.ts), [installed diagnostics](evidence/companion-integration-audit-v1/INSTALLED-TYPES.log).

A cast or a manually fabricated Store facade would hide the mismatch. The supported interface needs to accommodate managed retirement and grant only the capabilities the widget needs.

### 2. Some command paths need more than a prop-type edit

CodeEditor's undo/redo/insert/focus and NodeCanvas viewport commands depend on `subscribeToActions`; the code explicitly warns when it is missing. Managed child views do not offer this method. NodeCanvas requires action lifting and asks the caller to supply the inverse mapping when a parent wraps its command actions. CodeHighlight and VoiceInput also subscribe to action notifications.

A single last-command state field observed by a reactive effect can coalesce repeated same-tick commands. An ordered state-carried command queue with explicit identity may be viable; T2 must compare that with an owner-scoped action/effect seam before choosing a design. A root-stream subscription is not equivalent either: it must respect the captured child owner, replacement and command destination. [CodeEditor](../../packages/code/src/lib/code-editor/CodeEditor.svelte#L179), [FlowCommands](../../packages/code/src/lib/node-canvas/FlowCommands.svelte#L1).

### 3. The managed authoring path is missing from package references

None of the seven package README/docs sets inspected provides `defineApplication` / managed-slot / FeatureViews assembly. Quickstarts largely teach standalone `createStore` or specialized store factories. Auth's README explicitly navigates with `history.pushState` after login, contrary to the Upgrade 1 routing contract. LoginForm also coordinates flow-to-session completion in the component, rather than offering a demonstrated parent-owned/headless composition path.

Only auth currently publishes a docs directory. The other six manifests do not include `docs` or a consumer/reference directory. Media has an internal audio-player spec, but it is not a packaged agent guide. Existing low-level tutorials can remain as clearly labelled low-level material; they should not be the default managed-app instructions.

### 4. Checker coverage stops at the core starter boundary

The bundled policy approves core and Svelte only. On the existing installed standalone README-example fixture (not a managed application), after temporarily replacing local file specs with matching registry-shaped pins, the checker exits 21 and reports missing package approvals for auth, charts, chat, code and media—the companions actually imported by that fixture. The original manifest was restored afterward. Rule findings after granting those approvals remain unknown; this probe did not test that next stage. [Result](evidence/companion-integration-audit-v1/INSTALLED-ARCHITECTURE.json).

This is an explicit policy boundary, not a reason to suppress analysis errors. The next release needs reviewed package identities/profiles and a clear separation between application code and qualified package-owned rendering/resource internals. Opacity alone must not be described as proof that the opaque package is correct.

### 5. Native lifecycle reliability needs composed evidence

There are many existing cancellation, disposal, mount, renderer and operation-identity tests; preserve them. But the package test/reference scan found no managed application/slot assembly in the package-owned test sets searched. Existing passes therefore do not establish two sibling widgets, child replacement, parent removal, SSR request isolation and native callback retirement through the actual Upgrade 1 boundary.

The planned common render-engine contract already appears in [the architecture specification, section 9](../../specs/frontend/application-authoring-and-motion.md#9-effects-integrations-and-backend-boundaries): host element, visual inputs, typed output events and disposal; migrate existing wrappers incrementally. Package-owned D3/Babylon/CodeMirror/MapLibre work is legitimate implementation work. It should not be replaced wholesale or exposed as application-owned orchestration. This audit does not claim that every current native callback leaks; it identifies the missing shared contract and proof.

### 6. Release and historical status need reconciliation

The local manifests now say `^0.13.0`, but npm still serves the old `^0.12.0` companion peers. The root README's release summary and some package README peer claims are stale. Chat's optional code/media ranges currently point to the old minor lines and will need coordinated updating when those packages migrate.

The large remediation ledger contains both old open findings and integrated-but-unclosed work. Its labels are not a reliable current bug count. Join each relevant finding to current source, regression evidence and the new package artifact; do not redo completed fixes or claim unreconciled entries are resolved merely because broad tests pass.

## Package-specific work

| Package | Preserve | Integration work and decisive verification |
| --- | --- | --- |
| auth | Injected HTTP/session dependencies, flow reducers, existing browser and SSR tests, backend contract | Compose persistent session plus temporary flow slots; make flow results, MFA/challenge replacement and navigation parent-owned and usable headlessly; accept managed view retirement. Test logout/removal/replacement during a request, stale challenge results, SSR isolation and the existing fixture backend. |
| charts | Five existing chart types, reducer/data transforms, Plot/D3 rendering, accessibility work | Audit data generic precision and make managed view inputs retirement-safe; bind resize/zoom/brush/render callbacks to the widget attachment and owner. Test two charts, data replacement, hide/remount/retire during zoom, listener/frame cleanup, keyboard and reduced-motion behavior. |
| code | CodeMirror, Prism and SvelteFlow wrappers; save-snapshot and command tests | Provide scoped ordered command delivery and managed input contracts; eliminate required parent-action tunnelling for the normal path. Test repeated same-tick commands, late language loading, edits during save, overlapping saves and two independent editors/canvases. |
| media | Existing AudioManager/recorder implementations, subscriptions and cancellation regressions | Bind manager lifetime to owner plus attachment; give consumers one documented initialization/disposal path; audit registry identity across two instances. Test late permission grant, stop/restart/removal, transcription after replacement, autoplay rejection and actual browser resource release. Distinguish deterministic fake-device tests from real-device acceptance. |
| chat | Streaming transport subscription, stream identity, optional media/code loading, SSR behavior | Compose conversation, uploads and optional presentation children; keep stream acceptance in reducers and owned transport in effects. Test stop/clear/restore/replace plus late chunks, independent simultaneous conversations, attachment/modal cleanup, and optional peers both absent and present. Integrate after code/media contracts settle. |
| maps | MapLibre default and public MapAdapter/Mapbox separation | Bind engine initialization, camera completion, layers/popups and native listeners to a managed feature. Test delayed initialization followed by removal, same-ID replacement, two maps, style/provider changes and a real browser engine. Keep optional Mapbox out of default installs/bundles. |
| graphics | Babylon adapter, scene diffing, render-loop and shader regressions | Bind Scene/overlay resources to the managed owner and DOM attachment without making application code own frame loops. Test real Babylon scene/overlay mount, retirement, context loss/restore, asynchronous texture work and two instances. Keep shader-pixel checks in the required relevant CI lane. |

## Decisions incorporated after Opus 5.5 review

- **No interim peer-only release.** Published companions remain on their declared core 0.12 compatibility line until the qualified coordinated release. The local ^0.13 ranges are provisional and do not establish published support; do not recommend forced peer resolution.
- **Business output has one architectural route.** Child business-result actions are composed into parent reducers; native engine facts enter through typed dispatch. Callback props must not become a second business-result channel. Auth should provide reusable headless flow-to-session coordination while application navigation policy remains explicit. Existing callbacks may remain as labelled standalone compatibility APIs.
- **Core changes require an explicit T2 decision.** The coordinating implementation lead, core maintainer (if distinct) and independent Opus reviewer classify the result as no core change, additive 0.13.x change, or breaking 0.14 change. Record justification and regression obligations in an ADR before migration; derive core peer floors, checker compatibility and chat cross-peers from that decision. No new core API is assumed necessary.
- **Composite API shape is a T2 deliverable.** The lead, with auth/chat implementation owners and Opus review, decides whether packages expose composition fragments/slots or leaf reducers/views and documents the assembly contract before composite migrations, including typing/declaration when optional chat peers are absent. Add an auth headless composition proof alongside CodeEditor and Map.
- **Checker trust stays bounded.** Keep the core starter lean; add separately named bundled companion profiles maintained with the checker. Exact version pins intentionally require a profile/checker update for subsequent companion patches. Package opacity requires independent package qualification; it does not certify internals. The currently inactive presentation/no-fabricated-view and adapters/least-authority rules remain inactive unless separately scoped. Named independent review, public type checks and runtime controls cover these obligations; do not claim the current checker automatically enforces them.
- **Optional peers remain optional.** Registry metadata confirms maps' Mapbox peer and chat's code/media/Prism/PDF peers are optional. Preserve this in publication and exercise absent/present configurations. [Registry metadata](evidence/companion-integration-audit-v1/OPTIONAL-PEERS.json).

## Proposed assignments and order

**T1 — Freeze the integration acceptance matrix.** Inventory supported public capability families, dependency edges and authoring snippets. Each row records Store members actually used, concurrency policy (serialize, supersede or independent), owner/task, recipe, type/behavior/lifetime/installed test IDs and status. Unsupported claims get explicit documentation corrections. Reconcile relevant historical findings against source and regression evidence without blocking the shared proof on unrelated ledger administration. Exit: every advertised capability has a concrete disposition and responsible assignment.

**T2 — Prove the smallest shared managed binding contract.** Use CodeEditor for ordered commands, Map for asynchronous native initialization and auth for headless business composition. Define retirement, inputs, typed outputs, command timing (including drop/buffer/error while unattached and queue acknowledgement/trimming if applicable), attachment replacement, cancellation/disposal and errors. Compare an ordered state-carried command queue with explicit identity against an owner-scoped action/effect seam under repeat, replacement and stale-delivery tests. Preserve pure reducers, captured owner identity and lack of child destruction authority; expose neither root action buses nor a general plugin framework. Exit: actual managed recipes compile without authority casts, preserve command order and survive replacement; an Opus-reviewed ADR settles the binding, composite API and core-version decisions above.

**T3 — Migrate the seven package surfaces incrementally.** Apply T2 to existing implementations. Code/media precede chat; auth, charts, maps and graphics follow the shared contract. Keep compatible standalone APIs while making managed assembly primary. Share binding/disposal mechanics and keep business policy explicit. Media specifically audits module-level manager identity, state reads after retirement and mount-triggered workflow changes. Exit: actual ComponentProps checks plus runnable defineViews/FeatureViews managed recipes pass from installed tarballs for all seven packages; separate positive controls preserve supported standalone Store use. Each supported capability passes its T1 matrix, not just the representative component.

**T4 — Add the shared composition regression matrix.** Exercise two siblings and remove or replace one during pending work. Include same-ID replacement, rapid reopen, repeated same-tick commands, detach/reattach, parent removal, whole-app retirement and SSR request isolation. Assert the sibling remains live and stale callbacks cannot mutate replacements. Use captured production views and scheduling; distinguish callback retirement, transport cancellation and backend persistence. Extend focused existing tests. Require real MapLibre/Babylon lifecycle coverage and graphics' relevant shader CI lane. Media uses deterministic browser fake-device tests plus separately recorded real-device acceptance by the release verification owner; an unavailable required device check remains an explicit release gate for the affected advertised capability, never a simulated pass.

**T5 — Ship an agent reference in every package.** Include an entry document, public ownership contract, runnable managed recipe, deterministic tests, operation-policy examples, troubleshooting and limits. Update package allowlists, README and starter instructions; compile and execute the shipped examples. Explain when epochs/save snapshots/stream IDs remain necessary and what owner retirement supplies. Exit: all required guidance exists in exact archives, its links and examples pass, and an agent can author from installed references without repository-only lifecycle knowledge.

**T6 — Qualify checker companion profiles.** Design boundaries after T1; freeze exact pins only after T3 assigns final candidate versions. Add reviewed package identities, qualified native boundaries and actionable recipe diagnostics. Test active rule families and incomplete-analysis refusal with positive and negative controls. For fabricated authority/least-authority obligations not covered by active rules, record named independent source-review signoff plus type/runtime evidence rather than promising automatic checker rejection. Bind the exact checker candidate and runtime candidates in consumer verification. For pre-publication checks, materialize exact tarballs with matching registry-shaped dependency pins and record their hashes/provenance; this is candidate verification, not evidence of a registry publication. Recipe diagnostics improve existing rule and approval messages; new rules require a separately justified T1 row and positive/negative controls. Exit: managed references pass the intended profile, active controls reject their regressions, and uncovered obligations have explicit reviewed evidence.

**T7 — Qualify combinations and normal agent iteration.** Keep deterministic package fixtures. Require chat + media + code as a combined app because it exercises real cross-package optional dependencies. Add auth + charts + code and maps + graphics + charts only where a matrix row identifies a distinct composition risk not already proven by smaller fixtures; avoid redundant large demo runs. Cover absent/present optional peers, exports, SSR no-work behavior, lifetime, styling/accessibility and native engines. Assert unused optional engines stay absent from minimal fixtures; bundle size is report-only unless T1 establishes a justified budget. Run the agent qualification in an isolated workspace with exact candidate tarballs installed, no repository checkout, no private skill and no inherited implementation context. Record task briefs mapped to selected T1 capability rows, final artifacts, repair/iteration logs and every point where installed references lacked needed information. Turn each information gap into a T5 documentation fix or an explicit supported-scope limit, then requalify affected guidance. Agents may test and refine normally; there is no first-attempt score or iteration cap. Exit: exact installed references pass the core application-contract checklist and architecture checks; a named independent reviewer signs off final factoring, ownership, freshness and absence of fabricated authority or casts masking incompatible contracts. Record final artifacts and repairs, not first-attempt scores.

**T8 — Publish the qualified package set.** Candidate version assignment occurs after T3 and before final T6 pins/T7 artifact qualification. Expect companion minor lines for changed core compatibility/API contracts, likely 0.3.x for auth/charts/maps/graphics and 0.5.x for code/media/chat, subject to the ADR and registry availability. Update cross-peers, migration guidance and lockfiles before packing. Pack once, qualify those exact bytes and publish in dependency order: required core first, code/media before chat, other runtime companions as dependencies permit, then the checker with profiles pinned to published companion versions. Verify clean registry installs and rerun the published checker against published companions before latest promotion. No release is complete until published bytes, documentation, peer metadata and fixtures agree.

Dependency order: **T1 → T2 → T3**, with T4/T5 included in every migration. T6 design can proceed after T1, but **candidate version assignment → T6 profile freeze → exact-artifact T7 qualification → T8 publication** is mandatory. If qualification changes bytes or versions, repack and rerun the affected gate before publishing. Documentation and tests are part of each implementation assignment, not deferred cleanup.

## Completion criteria

- Supported capabilities can be composed under one Upgrade 1 application without per-widget root stores, casts or manually fabricated managed authority.
- Native resources and command callbacks have explicit owner/attachment lifetimes; domain requests retain explicit freshness and conflict policies.
- Package and combined-app checks pass against exact installed artifacts, including realistic retirement/replacement behavior.
- References, declarations and diagnostics are sufficient for coding agents to iterate to clean, factored code.
- Public scope and npm peers are accurate. Historical defects and deviations have concrete dispositions.

No runtime performance improvement or code-reduction percentage is claimed by this investigation. Establish representative baselines before T3 and compare the resulting application code and loaded modules afterward. Passing current component tests is useful evidence to preserve, but it is not the completion criterion for managed integration.
