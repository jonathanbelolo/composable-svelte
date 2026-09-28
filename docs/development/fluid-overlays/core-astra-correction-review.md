# Independent core correction review — builds 5 and 6

**Changes required.** The immutable build 5 packet closes the original executable R1–R6 cases; build 6 adds retention corrections. Five additional bounded probes expose remaining runtime gaps. No product source, original tests or snapshot files were changed. This is the completed initial final-delta review, pending author corrections and the separately moving media/Back/two-native-surface witnesses.

## Identity and scope

Baseline `2e07f650c1421c25f6b29d2db9c0cc885ea891ed`. All 88 build-5 manifest entries and all 91 build-6 entries verified. Manifest hashes respectively `684235fdb87173d7dd926cbf4d27711b6927e8bb4921ca1889c4db015a514eaf` and `49557968073fa930beec44bf2a2a3b944cecf11e19c8113597356cc009a3f710`.

Both full source and copied dist tree identities independently match the author's exact shell hash method (including `./` paths): build 5 source `83bfd00955d4c3446c51d4f3ae52836ca134e8ce0ea469346fab4140ad643f1e`, dist `7b206161952b48d98f816c1e4d966ecbd132ca07875e6313f0677b79cea8b600`; build 6 source `737c38fcf301d609cf7e978cc6900d233e86d707d5ac0d37e0e7fef5d3ead8d8`, dist `d522f2e5fc40d37dea58afae9fea984809e6e2573089c822e485eff290ed68ff`.

Isolated trees: `/private/tmp/fluid-overlays-core-build5-review` and `/private/tmp/fluid-overlays-core-build6-review`. Tests exercise source in these hash-verified trees. Dist identity was checked; no reviewer rebuild or product edits. Build 6 initialization initially omitted two baseline files named cache.ts due to a copy ignore pattern; that non-executing import-error attempt is excluded. Both files were restored from the verified build-5 tree before the full source hash and all reported build-6 executions.

Owning decisions: `default-phase-main-disposition.md`, `conditional-declaration-main-disposition.md`, and `reaction-retention-main-disposition.md`. Numeric correction-3 identities remain unchanged and approved; no repeated extreme-number review. Reference/docs changes are excluded.

## Runtime findings

### C-R1 — P1: active transform successors still reset their displayed pose

Build 6 `run.ts:1417–1481`, `transformLease` / `transformMotion`. The new transform continuation consults retained resting values, but an active predecessor's yielded translate/scale leases still produce samplers from authored endpoints. After the destination arbitration checkpoint, at the same clock time 400 ms, an incoming predecessor's translate `60px 30px`, scale `0.7` resets to `100px 50px`, scale `0.5`. Rect x jumps **175→225**, all three browsers. The same-node successor has acquired authority but lost the displayed state. Preserve live channel samples through partial and whole-run handoff, not only the resting registry. This is a residual of original R1; the original opacity and shared-geometry probes pass.

Probe: `core-astra-correction.browser.test.ts`, “partial incoming conflict adopts displayed slide and scale”. Measurement deliberately executes the next frame callback at the unchanged clock value after registration, so it observes accepted arbitration rather than the pre-checkpoint old writer. Log `build6-transform-probe.log`.

### C-R2 — P2: unreachable-layer settlement leaks custom-driver lifetime

Build 6 `run.ts:718–729`, `settleUnreachable`. It removes the SharedItem from the run without `disposeDriver`. A cross-document enrolled-layer destination correctly removes the copy and releases endpoint suppression, but driver disposal remains **0**, including after normal run expiry and Host destruction. All three browsers fail. Dispose the driver exactly once before dropping its last item, as now done for original R4's partial-yield path.

Probe: “unreachable destination disposes its shared driver exactly once”; log `build6-c3-driver-failure.log` (initial two-probe run; the transform measurement in this early log was subsequently strengthened to wait for its arbitration checkpoint).

### C-R3 — P2: reduced resting transforms omit stylesheet base transforms

Build 6 `route-host.ts:527–553`, `applyResting`. Reduced-motion scale/translate use only the saved inline `lease.stable`, defaulting to identity when it is empty. Normal animated transforms resolve the underlying computed style. For stylesheet `scale:2; translate:20px 10px`, a resting scale factor `.95` and slide `(12,5)` produce **scale .95 / translate 12px 5px**, instead of the equivalent animated terminal pose **1.9 / 32px 15px**. All three browsers fail both assertions. Resolve supported stable transforms consistently with the animated path, preserving foreign/unsupported ownership behavior.

Probe: “reduced resting transforms compose with stylesheet base like animated transforms”; log `build6-retention-boundary-probes.log`.

### C-R4 — P2: retiring the reacting source owner does not release its retained channels

Build 6 `route-host.ts:265`, `475–565`. Retained entries record only the overlay epoch owner, with no reacting participant/source-owner lifetime. A page reaction held for a surviving shell overlay remains retained after the source route owner retires and its DOM is removed: live lease count stays **1 instead of 0** in all three browsers. Host disposal eventually clears it; that does not meet the specified source-owner-disposal boundary. Track/release the source participation lifetime independently of the overlay epoch, without restoring over later channel owners. The author's removed-region probe checks only after a later overlay close and therefore misses this interval.

Probe: “retiring reaction source owner releases retained channels while shell overlay survives”; same retention log.

### C-R5 — P1: the direct-bindable pre-render checkpoint has a subscription startup window

Build 6 `overlay-motion.ts:152–171` and `ApplicationHost.svelte:35–37`. The root pre-effect initially executes before descendant probes exist; `probesChanged` notifies it only in a queued microtask. A real mounted public assembly, after `flushSync()` has created its handle, primitive, source and DOM, can synchronously update direct-bindable presentation and remove the source in a second flush before that microtask. The default run then reports **`card:missingSource`**, with no flight. Immediate update fails in all three browsers; the same unchanged update after one frame passes in all three. This is a framework subscription timing gap, not a late-created declaration. Register the tracked before-render observation in time for the next valid update, without requiring an app delay/hook.

Separate immutable probe: `core-astra-c2-public.browser.test.ts`; log `build6-c2-subscription-comparison.log`, which records missingSource versus successful source capture for the comparison. No product edits or broad sleeps were used to repair the failing case.

## Positive evidence and qualifications

- Original eight R1–R6 probes run unchanged: build 5 **24/24**, and again pass within build 6 controls. R2 includes author's additional same-key/different-scope control. R3 pending preparation disposal, R4 partial-yield disposal, R5 ambiguity arbitration and R6 rotated noncentral origin are closed for the reported reproductions. R1 remains incomplete as C-R1 above; the newly introduced C3 terminal path needs C-R2.
- Build 5 focused C2/C3/identity/store checkpoint controls: **51 passed, 54 skipped**, all three engines. Review confirms changed-state checkpoint after accepted reduction and before subscriber/destructive DOM work, explicit precedence, idempotent discard, stable conditional declaration, and source capture before destructive render in the tested normal timing. Direct-bindable startup is the remaining measured C2 failure.
- Build 6 focused unchanged probes plus C2/C3/retention controls: **102 passed, 3 failed, 51 skipped**. All three failures are the already-snapshotted live-MSE C3 witness (`video.paused === true` after removal/re-home). Author is still qualifying live media and native-surface reach; this report does not reclassify that failure as harmless or approve it. Canvas portability, frame fallback, actual cross-document endpoint settlement, nested unwind, reduced identity-base pose, per-channel resting independence, rapid reopen, and Host cleanup pass their included controls. See `build6-final-controls.log`.
- Exact build 5 and build 6 Firefox reruns each: **10/10** (four retirement-continuation tests plus six retained production-boundary probes). Production running probes never pause/rewrite the replay clock; aligned native references stay faithful over 84 frame comparisons, and two already-paused cases remain at time400/value.58. The accepted test-only self-assignment synchronizes Firefox's test-owned paused measurement; this remains distinct from production continuation fidelity. Prior native-only reproduction and deliberately-wrong-replay negative control remain in `core-astra-evidence/firefox-timing/`.
- Four-test correction probe is frozen at SHA `bc5bc5a4fc287a6833493030428a4a9aaa6ed60fa1b7dff46be0aa9f9bd96c98`. Additional C2 probe is a separate file. All runtime finding probes fail consistently in Chromium, Firefox and WebKit.

Durable evidence, executable probes, configs, run logs, source/dist identities and file hashes: `core-astra-evidence/corrections/identity.json`. No new whole-workspace gate was run. Final correction deltas and pending media/Back/two-native witnesses require their targeted follow-up; no approval is given to changes after these frozen candidates.
