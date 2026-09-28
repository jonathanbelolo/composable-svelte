# Independent narrow runtime recheck — build 9

**Changes required: handoff discard omits the newly transferred transforms.** The whole-run C-R1 continuity defect is fixed and its unchanged test passes. The requested unused-lease cleanup check exposes one narrow regression in the fallback that declines to create a successor run.

All117 snapshot files verified against manifest SHA `70abcc826518e4c363862997d811e3c3f19a54f374522365b4f910edfbd6f232`. Isolated `/private/tmp/fluid-overlays-core-build9-review`: source `406d1360d74fee78df19949b992b2c6e61f1b6387cbe90af76de118b5e8d3560`, dist `811e2068911467f310799f66afc8a68577253dfa1671f7c490c9901f03ff33f0`, independently matching full tree identities. Only `run.ts` changed in product source relative to build8. The other two packet deltas are the unchanged reviewer probe and author's targeted identity test. No product/source/snapshot edits.

## C-R1-discard — P2: declined successor leaks handed transform authority

`engine.ts:49–52`, `discard()`, releases only `OutgoingAdoption.lease` (opacity). Build9 adds `translate` and `scale` leases to that adoption. `RouteHost.admitted()` hands off and settles the predecessor before it checks reduced motion; the reduced branch calls this unchanged discard method instead of constructing a new run. No remaining run owns the handed transform leases after that point.

A real Host admission sequence (same route source, outgoing slide/scale at400ms, then a reduced successor admission) leaves **translate40px20px, scale0.8, liveChoreographyLeases2** after rejection and after Host disposal, all three browsers. Expected stable styles are empty and the ledger is0. Release every transferred transform channel in the engine's discard path, preserving idempotent/stale-lease behavior.

Probe `core-astra-evidence/build9/core-astra-unused-handoff.browser.test.ts` includes the ordinary-successor control first, then the actual reduced admission failure. The control restores pre-existing inline scale2/translate5px7px and balances leases. This order avoids polluting its global ledger count with the leaking case. The original reverse-order run is retained as diagnostic evidence and is not counted as two defects.

## Executed checks

- Unchanged whole-run continuity probe: **3/3 pass**, Chromium/Firefox/WebKit. Displayed translate40px20px/scale.8 remains identical at handoff.
- Author midpoint/progress/final-pose cleanup witness: **3/3 pass**, same engines.
- New unused-channel control: **3/3 pass**; reduced discard boundary: **3/3 fail**, same engines. No harness failures.

The correction now transfers transform leases and displayed base/value into the successor constructor, consumes them per channel, and releases untaken channels during finalization/early settlement. Those paths are coherent for a constructed successor; `engine.discard` is the missing terminal consumer.

Retain all build8 closures and passing live MSE, Back, native-surface, source-retention and C2 startup evidence. No broad suites rerun; no numeric exploration. A narrow frozen discard correction is sufficient for follow-up; current build9 is not fully approved.

Exact evidence/config/probe hashes: `core-astra-evidence/build9/identity.json`.
