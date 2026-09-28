# Independent core Astra review — intermediate candidate

**Changes required.** This review covers only the immutable 55-file core packet, not the moving native/media C3 corrections, the remaining default-source phase disposition, or the eventual integrated release. No product or original snapshot files were edited.

- Baseline: `2e07f650c1421c25f6b29d2db9c0cc885ea891ed`.
- Packet: `core-review-snapshot/manifest.json`, SHA-256 `b476047a84010f3ddc7d08f4b2151d786b31842b5fb1d8b15ffa18fd595cd3ae`; all 55 source/test hashes independently verified.
- Executable review tree: `/private/tmp/fluid-overlays-core-astra-review`, created from `git archive` of the baseline plus exactly the packet files. Dependencies are symlinked; source is isolated from the live authors.
- Policy: canonical `MULTI_AGENT_ARCHITECTURE.md` v2.10; fresh independent Astra review, no self-authored fixes.
- Owning contracts: packet `final-design-disposition.md` C2/C5 and `implementation-interface.md` §§1–2, 7; existing driver lifecycle contract in `drivers.ts`.

## Findings

### R1 — P1: accepted successors restart displayed channels and geometry

`run.ts:536–574` (`yieldNode`), `run.ts:1491–1500` (incoming initial write), `run.ts:1335–1371` (transform samplers), and `route-host.ts:407–423` (same-instance default handoff).

The lease token is handed over, but the displayed visual state is not. A partial conflict deletes the old shared representation and constructs the successor from the underlying source rect. Incoming paint is explicitly written from the new track's authored `from`. Whole-run handoff carries outgoing opacity only into another outgoing item, so an accepted dismissal→open reversal also resets.

Independent results in **Chromium, Firefox and WebKit**: a conflicting incoming run jumps opacity **0.4→0**; a shared flight jumps viewport x **170→20**; a real public Modal dismissal→open reversal jumps opacity approximately **0.67→0**. The earlier author tests prove one writer and eventual completion, but do not test continuity at the handover. C5 and interface §2 require adopting displayed values, not only lease ownership. Preserve the conflicting channels' displayed pose/value (and contract-required continuation state) across both default and explicit successors while leaving disjoint tracks running.

Probes: `core-astra-probe.browser.test.ts` tests 1–2 and `core-astra-public-probe.browser.test.ts` test 2.

### R2 — P1: scoped shared tracks disappear on whole-run handoff

`run.ts:607` and `run.ts:772–775`.

Preparation skips capture when an adoption has the same `keyOf(track)`. Enrollment then searches using `candidate.participant === adoption.key`. A scoped participant is an object while the adoption key is a string, so it can never match: the copy is disposed and its lease restored, with no replacement item. The same key also loses its scope identity during adoption, so mixing same-key participants from different scopes cannot be matched safely.

A plan with `participant: scope.select('hero')`, superseded by the same valid plan in the same owner, goes from **one representation to zero immediately**, in all three engines. Carry and compare the full resolved participant identity through adoption, including owner/epoch where required.

Probe: `core-astra-probe.browser.test.ts`, “whole-run handoff preserves a scoped shared participant”.

### R3 — P2: overwriting an explicit pending entry leaks its deferred preparation

`overlay-motion.ts:92–95`; `route-host.ts:344–369`.

`transition()` replaces `state.pending` without discarding the previous prepared run. Each scheduled cleanup discards only if its own pending entry is still current. Two synchronous `handle.transition(plan, () => {})` calls therefore discard only the second preparation; the first remains in `host.localRuns`, retaining captures, role registrations, its media listener and resize owner until Host destruction. A local deferred run has no preparation timeout to recover this.

The public assembly probe starts with zero runs and still has **one unaccepted deferred run after tick**, on all three engines. Discard an overwritten entry exactly once without changing any accepted predecessor's resources or obligation.

Probe: `core-astra-public-probe.browser.test.ts`, “two unaccepted explicit entries in one flush discard both preparations”.

### R4 — P2: partial shared yield omits custom-driver disposal

`run.ts:551–564`.

`yieldNode()` removes a shared item directly instead of using a terminal path that calls `disposeDriver`. The item is no longer in `this.shared`, so later run settlement cannot dispose it either. A registered custom visual driver with a counted `dispose` receives **zero calls after conflicting adoption and both run/Host teardown**, on all three engines. This violates the driver's existing once-at-settlement lifecycle and can retain user resources.

Probe: `core-astra-probe.browser.test.ts`, “partially yielded shared driver is disposed once”.

### R5 — P1: route destination ambiguity can irreversibly cancel unrelated motion

`run.ts:1469–1475`, `run.ts:1507–1510`, `run.ts:1517–1523`.

Batch admission is limited to runs with `overlayRoles`. For a route whose destination owner is already known, the first fresh destination is immediately acquired; a second same-owner/key destination later marks the track ambiguous and releases the lease. If the first candidate was already animated by another live run, that first acquisition has called `yieldNode`, permanently deleting its previous track. Rolling back the new lease cannot restore the earlier animation.

A bounded probe runs an unrelated incoming fade, then presents two candidates for the route's shared destination. After ambiguity is diagnosed, the previously animated node is restored to **computed opacity 1** rather than continuing at **0.5**. Reproduced in all three engines. C2's uniqueness-before-acquisition rule must apply before irreversible arbitration for route registrations too, not only the overlay/local admission path.

Probe: `core-astra-probe.browser.test.ts`, “an ambiguous route destination does not cancel an unrelated earlier node animation”.

### R6 — P2: the transform-origin correction does not compose with own rotation

`run.ts:1379–1386` and `run.ts:1683–1695`.

`moveCopy` marks a rotated/skewed item as `centred` and calls `copyMotion(..., false)`. The sampled noncentral transform origin is only used when the final `corner` argument is true, so the rotated branch always scales the representation around its centre instead of preserving the real element's authored origin.

A browser-native oracle uses the same 100×40 element at (100,100), `rotate(30deg)`, `transform-origin:0 0`, and a linear scale 1→0.5. After capture/removal at 416 ms, at 700 ms the copy's left is **91.995 px** (Firefox 92), while the live oracle's left is **87 px**, in all three engines. The existing controls separately cover noncentral unrotated scale and centred rotated scale, leaving their supported combination untested. Preserve the transformed origin through the rotated copy path as well.

Probe: `core-astra-probe.browser.test.ts`, “rotated outgoing scale preserves a noncentral transform origin after removal”; separate log `transform-composition-probe.log` (**3/3 expected-invariant failures**, other probes deliberately skipped).

## Executed evidence

- Final independent probes: **7 probes × 3 engines = 21 expected-invariant failures**, each attributable to R1–R5 above. No collection or runner errors in this probe run.
- Unchanged author controls: **27 engine/file combinations, 96/96 passing**. The scope is `overlay-*.browser.test.ts` plus `s1-transform-*.browser.test.ts`; includes public explicit pre-commit capture, refusal, completion, nested combined dismissal, managed Escape/outside pointer, Command/Lightbox, layer pixels/geometry, and R1–R3 transform regressions.
- The first parallel control attempt had 6 Firefox suite-initialization failures (`Vitest failed to find the runner`) and 67 passing tests. Repeating the same controls with `fileParallelism:false` and a separate cache produced 96/96. Both logs retained; no source changes were involved.
- Browser listener execution required ordinary sandbox escalation after `listen EPERM`; the escalation succeeded. No approval-review rejection occurred.
- Durable probes, config, logs and hashes: `core-astra-evidence/identity.json`. The executable probe files can be copied unchanged into `packages/core/tests/fluid-motion/` of an isolated candidate checkout.

## Retained evidence and boundaries

The three numeric files retain the independently approved correction-3 identities exactly: `channels.ts` `480494cd96f7b64657a5239ac80456fef442a156ecf2f737adaf08b6a5c814bb`; `hermite.ts` `22404659c856fe456ea5073a48dae553d842b5a7cebcc76b84b8c20f272d8163`; `channel-types.ts` `6ad7096d83c50865d015246189097f5b22ed166aca448479ca8c09c20fe7f84a`. Extreme-number work was not repeated.

The packet itself acknowledges the post-commit source phase of default plans, nested default-plan effect ordering, absent Browser Back witness, C3 live-media re-homing and two-native-surface gaps. Those are **not independently approved exclusions** by this review. C3 is moving under the retained author; default-source qualification remains with the coordinator. Browser Back, separate Sheet/Drawer motion, two-Host isolation and async-save acceptance lack dedicated witnesses in this packet. These are evidence/contract-disposition gaps, distinct from R1–R6's reproduced runtime defects. Reference/docs scope is excluded.

A final frozen integration delta and targeted fresh review are still required after corrections. This intermediate review provides no approval for subsequent source changes.

## Subsequent coordinator disposition (read-only context)

After this intermediate report, Main explicitly rejected the post-render default-source qualification in `default-phase-main-disposition.md`: default plans must capture before destructive render. The author is correcting that and C3 build 3 independently. Neither moving delta is approved here; both belong in the final frozen review.
