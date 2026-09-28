# Independent final-batch review — build 8

**Changes required: C-R1 remains incomplete for whole-run successors.** The exact build closes all five retained failure reproductions and the pending live-media/Back/native witness failures. A targeted check of the already-required whole-run branch still reproduces transform discontinuity. No new broad exploratory review was performed.

## Exact candidate

All 116 entries in `core-correction-build8-snapshot/manifest.json` independently verified; manifest SHA `6761bff555833b76d7dd387350d8d07aa9dfe1b3ef60f6a75af255dc3aeecaf3`. Isolated baseline-plus-snapshot tree `/private/tmp/fluid-overlays-core-build8-review`, copied complete dist and symlinked dependencies. Full source `266d4b46c7379379002d803a1a306d460075396cb5a22c1884c023e08962dbc5`; full dist `9190602581b154907533347dd01ab3dbd391982086f69b3cc555bbc290660db2`, both exactly matching the author (sorted `./` paths, SHA-256 per file then aggregate). No live source/test or snapshot edits.

The only product source deltas from reviewed build 6 are `run.ts`, `route-host.ts`, and `overlay-motion.ts`. Review covered those five correction paths, shared-source retirement for live MSE, and old-slot release on native re-home. Prior numeric/R1–R6/Firefox and unaffected controls retain their earlier evidence.

## Residual finding: C-R1, P1 — whole-run handoff loses live slide/scale

`run.ts:1750`, `handOff()`, still carries only outgoing/incoming opacity in `OutgoingAdoption`. `RouteHost.local()` (also the route/other whole-run supersession path) calls this handoff, settles the predecessor, and creates the successor. Predecessor settlement restores its translate/scale leases; the successor then starts from authored endpoints. The new `yieldedTransformPose` implementation applies only when partial conflict calls `yieldNode` and therefore does not cover this branch.

Independent identical-clock probe: a plain same-owner local outgoing track has `translate:40px 20px`, `scale:0.8` at400ms. Superseding it with the same plan at400ms changes to `translate:0px 0px`, `scale:1`. Rect x **150→100**, y **124→100**, width **80→100**. Chromium, Firefox and WebKit all fail the three continuity assertions. This is the already-specified C-R1 partial-and-whole-run requirement, not a new capability request.

Carry transform authority and displayed channel state through whole-run adoption, with untaken channels still released once and stable baselines preserved. The reviewer made no fix.

Durable probe `core-astra-evidence/build8/core-astra-final-boundary.browser.test.ts`, SHA `d359d9e68e9e8d248d97f980b2fc3b556a12f0268e97ea36d5a3dfcfa2d9b884`; `whole-transform-boundary.log` includes old/new CSS values and rects.

## Executed evidence and closure

- **18/18 pass**: unchanged four-test correction file plus two-case public C2 file, all three browsers. Their original hashes are preserved. This closes unreachable custom-driver disposal, stylesheet-base reduced pose, retained source-route retirement and direct-bindable startup for the reported cases. Partial active transform adoption now passes; C-R1 is only partially closed because of the whole-run result above.
- **21/21 pass**: focused frozen C3/native/Back/Host witnesses, all three browsers. Includes live canvas/frame fallback, actual cross-document faithful settlement, live MSE source retirement/re-home with advancing currentTime AND changed canvas pixels, two native modal surfaces with old/new slot cleanup, actual `history.back()` through managed routing with exactly-one dismissal and no history push echo, and two-Host isolation. All selected tests executed;87 unrelated tests skipped.
- **3/3 expected-invariant failures**: whole-run boundary probe, three browsers, no harness failure.

The media change retires already-removed shared sources after deferred acceptance so the existing provider can resume detached media; no video/provider source was changed. Old slot removal after successful movement checks that it is an overlay slot and has no remaining children. Reduced resting target identity now carries source owner to route retirement. Probe registration synchronously invalidates Host tracking under `untrack`, while teardown remains deferred; the immediate-update witness now captures the source.

Broad author gates (951/951 motion,1057/1057 navigation/store,606/606 targeted) are author evidence, not rerun or substituted for this review. No approval extends beyond the identified immutable candidate. The residual handoff correction requires a targeted frozen follow-up; no additional broad review is requested.

Evidence/configs/hash identity: `core-astra-evidence/build8/identity.json`.
