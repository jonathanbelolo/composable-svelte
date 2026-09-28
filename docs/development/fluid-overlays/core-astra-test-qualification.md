# Independent final test qualification

**Both final test-only corrections approved; viewport and C1 qualifications closed.** Production/numeric source was not changed.

## Awaited viewport teardown

Frozen single-file delta `core-build10-test-delta/packages/core/tests/fluid-motion/visual-correction2.browser.test.ts`, SHA `e2f5769fe392303cb9962b63ad16b3af0d4d94933c5ffb3e2b1313038d115a19`, compared directly to the immutable build10 snapshot version, not HEAD. The only changes allow cleanup promises, await each cleanup in afterEach, and return all three viewport restoration promises. Assertions, tolerances, test bodies and production code are unchanged.

Independent isolated run against exact build10 runtime plus this file: **48/48 pass**, all three browsers. The change correctly establishes a teardown-before-next-test ordering; the prior fire-and-forget restoration could race a later viewport update. Author reported measured640→660 interference and negative controls; those remain author evidence, while this review independently confirms the specific synchronization correction and unchanged assertion strength.

## C1 endpoint velocity: captured cause, not a waiver

The previously unqualified failure was reproduced independently by extracting the existing C1 public-assembly test, keeping all assertions unchanged, repeating20 times per browser, and adding diagnostics only. **60 cases:53 pass,7 fail** (6Firefox,1WebKit). Full output is retained. Each failure is the endpoint `last.vx === 0` assertion; position and retarget-continuity assertions pass.

All seven final frames have `t=700` (one700.0000000000018), exact destination x300/y0/width120/height40, and completed settlement. Reported vx ranges approximately0.00460–0.00479. This disproves the suggested pre-end-frame explanation for these captured failures.

`run.ts` write diagnostics explicitly compute `vx = compose(t).x - compose(t - 1).x`, a backward1ms secant. At t700, the geometry is exactly at the endpoint, but the preceding sample t699 still moved. Therefore the logged secant is positive even though the instantaneous Hermite endpoint derivative is zero. The source's displayed-state convention uses the same interval; numeric implementation changes are neither needed nor authorized by this diagnostic.

An independent closed-form Hermite calculation from each recorded retarget (position/velocity, endpoint and700ms end) matches **all60** logged velocities with maximum error **5.684341886080802e-14**. Seven happen to end before the previous1ms interval lies entirely after the endpoint. Evidence: `core-astra-evidence/test-qualification/c1-secant-analysis.json` and `c1-diagnostic-repeat.log`.

Recommended correction: preserve every retarget continuity assertion and endpoint-position assertion; replace only the incorrect endpoint diagnostic-zero assertion with the expected backward1ms secant of the fixture's final segment, at unchanged six-decimal tolerance. This tests the actual diagnostic contract without weakening it. Verify that wrong reported velocity and wrong endpoint still fail. A later green rerun alone was not used to qualify the failure.

The production runtime verdict remains approved for exact build10. The final narrow C1 test delta has now been independently inspected and executed as recorded below; no broad rerun or numerical re-review was needed.

## Final C1 delta disposition — approved

Frozen `core-build10-c1-test-delta/packages/core/tests/fluid-motion/visual.browser.test.ts`, SHA `eee248467331db409bba98eae3e8bc27fe4dfbb81732a76ad0ea33013ec6a564`, compared directly with build10 snapshot. Only the endpoint diagnostic-zero assertion is replaced by a closed-form expected backward1ms secant. Every retarget position/velocity continuity assertion, actual endpoint-position assertion, interactive-destination assertion and cleanup check is unchanged. Velocity tolerance remains six decimals; endpoint position tolerance remains three decimals. No runtime or numeric source changed.

Independent executions on exact build10 runtime:

- Corrected C1 witness repeated20 times per engine: **60/60 pass**, versus7 failures in the earlier60-case run of unchanged old assertions.
- Exact frozen C1 test without repeat adaptation: **3/3 pass**, one per engine.
- Deliberately wrong reported velocity (`last.vx += .01`): **3/3 fail** at the diagnostic-secant assertion, tolerance5e-7.
- Deliberately wrong endpoint (`last.x += 1`): **3/3 fail** at the preserved actual endpoint assertion, tolerance0.0005.

These negative controls are isolated test copies only and retained with full failure logs. The corrected assertion independently evaluates the known fixture segment in closed form; it neither imports the implementation sampler nor compares the diagnostic to itself.

The promised instantaneous endpoint derivative is independently covered by retained numeric tests, not replaced by secant consistency: `packages/core/tests/fluid-motion/channels.test.ts:7`, “samples endpoint values and velocities exactly”, asserts actual `hermite().sample(100).velocity === 0` at line25 and `sample(150).velocity === 0` after the endpoint at line29. The equal-endpoint overshoot case also asserts terminal velocity0 at line154. Their prior approved58/58 numeric evidence remains applicable; numeric files were not edited or rerun in this qualification.

**Final disposition:** the reported C1 failure is fully captured and explained as a diagnostic/test semantics mismatch. The frozen test correction preserves actual C1 continuity, exact endpoint position, and assertion discrimination; it is approved. Neither a green rerun alone nor an unexplained tolerance change was used as a waiver. No viewport/C1 test qualification remains open in the reviewed integration packet.

Durable probes, source copies, positive/negative logs and hashes: `core-astra-evidence/test-qualification/identity.json`.
