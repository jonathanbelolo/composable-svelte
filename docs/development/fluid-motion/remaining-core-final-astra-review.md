# Independent final RC2/RC4 closure review

**Accepted for this bounded correction. RC2 is closed under the observer/pre-paint lifetime contract; RC4 is closed under Main’s explicitly approved deterministic participant-settlement policy. No new correctness finding remains in this reviewed delta.** Prior RC1/RC3, original B2, shadow and other unchanged gates retain their earlier scope; this is not a newly executed whole-workspace acceptance gate.

Delegated Astra HIGH, 2026-09-27. Exact frozen manifest SHA-256 **`ce2284649c74fcb3e2c7958448ffa548f897a4a32fa930652f5920670d45eb1a`**, observed 16:48:58Z, coherent build 16:47:05Z. All **521 source/test and 1,250 dist entries** match the manifest before and after review. Changed scope prefixes: projection `72eb4e8c`, representer `da91c9a5`, counters `7890cbd5`, engine `4189f725`; targeted authored tests `a9394f52`. No product edits were made. Execution used the immutable source harness; matching dist identity was verified without an independent rebuild.

The observed author report and both Main decisions were copied into the evidence directory with hashes. The reported 708 browser / 83 node / 18 capture results remain attributed to the author. This independent pass executed the 27 checks below.

## RC2: active layer ordering and owned observer lifetime

The unchanged paint-boundary repro now passes **3/3**. Its prior failing source and assertions are byte-identical (SHA-256 `f467a908202a01fceb3d50ce3fd4d64acc9bb320f1b7c35dc822f634afa249e2`). After a new important author layer is prepended, the ordering marker is restored and the active copy’s native pseudo remains `none` at the observed paint boundary. The source still paints `A`, and the copy contains exactly its materialized `Ax`. The same fixture failed across all three engines on the prior freeze, so the unchanged witness is sensitive to the corrected behavior.

The implementation retains a per-document, head-child-list-only observer when the completed wrapper contains materialized-pseudo suppression. Checking the wrapper after moving the fragment covers both fresh and cached projections. The representation abort signal owns the idempotent release; the last retaining copy disconnects the observer. The engine’s observer ledger includes this guard.

Independent warm/cold lifecycle controls pass **3/3**:

- warming a pseudo-containing template alone acquires no guard;
- a real cache hit and a cold copy share one guard in the same document;
- after a head prepend, both copies are suppressed before the next animation-frame callback;
- disposing one copy preserves the guard for the other;
- final, repeated disposal returns the guard count to zero;
- after cache disposal and the last representation’s release, a later head prepend is not reordered, demonstrating actual disconnection rather than only a decremented counter.

The unchanged ordinary singleton/cleanup control also passes **3/3**. Source markup remains untouched, per-copy suppression styles and handles are removed, and one inert `@layer composable-pseudo;` order statement remains. That bounded persistent declaration is intentional; no live observer remains after the last owner.

The historical immediate same-stack `getComputedStyle()` assertion remains recorded as failing before MutationObserver delivery. It was not rewritten into a pass or rerun as a closure gate here. Under the agreed observer/pre-paint contract, synchronous script reading immediately after its own prepend may observe the intermediate cascade; the engine does not monkeypatch DOM methods. The passing first-rAF and unchanged two-rAF controls demonstrate the required visible update behavior. This explicitly closes the earlier persistent active-copy defect, not a stronger synchronous-script-read contract.

## RC4: truthful participant settlement with real cleanup

Both Main dispositions are applied. The final policy conservatively settles a participant using predefined `lower-armenian` or `upper-armenian` outside **1–9999 in every engine**. This includes Firefox/WebKit cases where decimal happened to match; it is an approved qualification fallback, not a claim that those engines inherently fail to render them. It does not disable in-range Armenian or unrelated/custom styles.

The counter resolver reports a settling reason, the projection carries it into the existing whole-participant S4 path, and the representer discards that projection before acquiring a representation handle or source paint lease. The width probe and per-value cache are absent. Author-defined overridable styles are looked up before the predefined algorithm; lookup caching is local to one resolver and keyed by distinct style names, not persistent counter values.

Authored real-Host cases for lower-Armenian **10000** and upper-Armenian **0** pass **6/6**. Independent configured-Host/provider cases add **6/6** and verify the disposal obligation directly:

- a provider encountered before the unsupported counter acquires once;
- settlement disposes it exactly once and aborts its own signal;
- the affected participant has no copy and no opacity lease, with the live source still connected until commit;
- the unrelated participant remains represented;
- the test invokes the business-removal hook, removes the old source, then completes the run;
- completion occurs once, disposal remains once, no representations remain, and the actual engine resource ledger is **observers 0 / handles 0 / media 0**.

The reason is exact: `settled:counterStyleOutsideQualifiedRange:<style>:<value>`.

The authored strict pixel checks for in-range **1, 9999 and 2024** pass **3/3**, with zero differing pixels. The author override named `lower-armenian` at 10000 and an unrelated custom style also pass **3/3**, with zero differing pixels and no settlement or counter warning. These prove the tested narrow boundary and override behavior; no whole counter-style catalogue is inferred.

Old RC4 repros that require a captured copy at 0/10000 intentionally predate Main’s changed outcome contract. Their known failures and text-attribution evidence remain preserved; they are not silently deleted, weakened, or counted as successful fidelity. The new closure gate asserts settlement, commit and disposal instead.

## Actual independent checks

| Check | Result |
|---|---|
| Unchanged RC2 singleton cleanup and two-rAF head-order repro | **6/6 passed** |
| Authored real-Host RC4 settlement, in-range and override cases | **12/12 passed** |
| Independent warm/cold guard ownership and disconnection | **3/3 passed** |
| Independent configured-Host settlement with prior provider acquisition and actual ledger | **6/6 passed** |

**27/27 passed** across Chromium, Firefox and WebKit. Title-filter deselections are excluded. The earlier separate 27-pass B2 gate is retained, not represented as a repeated full run in this pass.

Main’s fractional-text qualification remains separate: no origin or trajectory rounding was introduced, and expected compositing rasterization differences are not claimed to be universal zero-pixel error. The RC2/RC4 closures above rest on actual suppression, generated-content outcome and lifecycle evidence, not that rasterization qualification.

Evidence: [hashes and unchanged assertion identity](/Users/jonathanbelolo/.codex/worktrees/67a5/composable-svelte/docs/development/fluid-motion/remaining-core-final-astra-evidence/hash-verification.json), [unchanged RC2 and authored RC4 results](/Users/jonathanbelolo/.codex/worktrees/67a5/composable-svelte/docs/development/fluid-motion/remaining-core-final-astra-evidence/targeted-closure.log), [independent lifetime/Host checks](/Users/jonathanbelolo/.codex/worktrees/67a5/composable-svelte/docs/development/fluid-motion/remaining-core-final-astra-evidence/final-lifetime.browser.test.ts), [lifetime/Host results](/Users/jonathanbelolo/.codex/worktrees/67a5/composable-svelte/docs/development/fluid-motion/remaining-core-final-astra-evidence/final-lifetime.log), [preserved Main dispositions](/Users/jonathanbelolo/.codex/worktrees/67a5/composable-svelte/docs/development/fluid-motion/remaining-core-final-astra-evidence/remaining-final-main-disposition.md), [observed author report](/Users/jonathanbelolo/.codex/worktrees/67a5/composable-svelte/docs/development/fluid-motion/remaining-core-final-astra-evidence/remaining-core-review-corrections-report.md).
