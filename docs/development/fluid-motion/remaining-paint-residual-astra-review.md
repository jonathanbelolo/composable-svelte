# Independent paint residual closure — 2026-09-27

**Disposition: both paint residuals close against the identified candidate.** No new finding in this bounded scope. F2 explicit-font-family invalidation and mixed shared-flight ordering now pass their unchanged independent reproductions in Chromium, Firefox and WebKit. Prior outgoing ordering, backdrop, cleanup, Presence and lookup gates remain retained.

## Candidate

`remaining-core-residual-snapshot/manifest.json` SHA-256: **`8e627e2a2adfd498d37560e4da04f568289f555651bf297562ac09607d9c3614`**; reported coherent build **16:31:56 UTC**. All **1,771** listed files (521 source/test/config, 1,250 dist) verified before and after execution, with no mismatches. Isolated executed source also matches. The four prior reviewer files, including both residual reproductions, were preserved **byte-for-byte unchanged** and hashed in the evidence.

Read the residual section of `remaining-core-review-corrections-report.md`; the version read is retained in the evidence. This review used immutable source and existing local dependencies. No product edits, rebuild or live source were used. Counter formatting and the Armenian outside-range policy remain outside this gate.

## Correction assessment

**F2:** the general default-value exception is removed. The observer replays only the owned opacity/clip-path values **and their priorities** onto the previous attribute in a scratch element, then requires exact serialization equality. Records on one element are compared pairwise. A real font weight, inherited color or priority change cannot be excused merely because it contains `normal`/`initial` or an explicit font family.

The unchanged explicit-family probe now observes source and representation weight **400**, with **one recapture**, in every engine. Original normal/initial/priority probes also pass. A bounded added control writes opacity, then real font weight, then clip-path on the same element before observer delivery: the real paint change remains visible to invalidation and the copy updates correctly.

**Mixed shared ordering:** the first blended shared participant is determined before enrollment. That participant and later shared copies are placed beside the plane in their established order; earlier ordinary shared copies remain below them inside the plane. The unchanged mixed-shared reproduction now compares at **0.0000 differing pixels** in all engines. Both outgoing ordering directions and the shared-over-outgoing control also remain **0.0000**.

Placement still precedes `handle.attach()` on both paths. The correction does not repair order by reparenting already attached provider content. This conclusion is source inspection of the changed placement path, not a new player/iframe continuity qualification.

## Executed evidence

**57/57 targeted checks passed** across Chromium, Firefox and WebKit; **99 intentionally filtered-out instances** belong to unrelated cases in the broader author suites. Zero failures.

| Check | Result |
|---|---|
| Original F1/F2 and outside-plane cleanup probes | 21/21 pass unchanged |
| Explicit-family and mixed-shared residual probes | 6/6 pass unchanged |
| Chained owned-property / real paint mutation control | 3/3 pass |
| Mixed shared siblings: global cancellation, supersession and Host-destruction cleanup | 9/9 pass |
| Relevant author ordering, shared flight and standalone large-preparation controls | 15/15 pass |
| Public large default-budget staging witness | 3/3 pass |

The **public 1501-element** witness prepares in 11 slices with **330–351 ms work**, longest heartbeat gap **34–76.6 ms**, **zero recaptures**, successful business commit and **`completed`** settlement with cleanup assertions passing. The standalone large witness also has zero recaptures and longest gaps **53–64.7 ms**. Thus the invalidation correction does not restore the observed synchronous full-recapture defect on this fixture. The approved consistent 600 ms staging/visual defaults remain unchanged.

The added shared cleanup control verifies both the blended wrapper and the later ordinary shared wrapper are outside the plane, then checks for zero representations **anywhere in the document** after cancellation return, Host-owned supersession or actual Host destruction.

## Replay and boundaries

[Evidence](remaining-paint-residual-astra-evidence/) contains unchanged reproductions, the two new bounded controls, [browser results](remaining-paint-residual-astra-evidence/browser-results.log), hashes and preparation script. The isolated tsconfig adjustment only removes its unavailable parent extension, as in the prior review. Local browsers used normal approved escalation.

```sh
python3 docs/development/fluid-motion/remaining-paint-residual-astra-evidence/prepare.py /private/tmp/remaining-paint-residual-astra-replay
cd /private/tmp/remaining-paint-residual-astra-replay
node node_modules/vitest/vitest.mjs run --config review.config.ts -t 'review paint|blended copies|blended shared flight|large cold participant|large preparation'
```

This closes the two paint residuals, retains the prior 21/39 passing controls, and does not claim whole-feature acceptance or approval of unrelated counter/media work. Review elapsed approximately four minutes within the 600-second ceiling.
