# Native companion binding decision

Status: accepted for maps/graphics/charts migration by coordinating lead following Opus Map B4 review and independent parent checks. This does not approve the command-delivery experiment or claim full package qualification.

Implementation disposition: the reviewed Maps, Graphics and Charts migrations and their packaged managed guidance are integrated locally. Parent verification is recorded in `evidence/parent-lane-verification/maps/`, `graphics/`, `charts/` and `native-t5/`. The migration instructions below are retained as contract history, not a request to restart the completed lane. Final versioned qualification and publication remain tracked in `COMPANION-RELEASE-READINESS.json`.

Use a narrow structural state/dispatch/subscribe contract derived from ChildView for state-driven companion components. Both genuine managed views and supported standalone Stores must satisfy it. State becomes undefined at managed retirement; attachment cleanup and native callback suppression respond immediately, even if outgoing DOM remains. No new core lifetime API is justified by the Map proof.

Each physical renderer belongs to a captured feature view and DOM attachment. Replacement creates a new binding; a predecessor cannot mutate the successor. Supplied Map adapters retain existing transfer-of-lifecycle-ownership semantics: the component destroys the attached adapter once. Do not add speculative external-ownership modes or asynchronous initialization APIs. For genuinely async engines such as Babylon, preserve their native initialization contract and dispose any late result after retirement.

Managed native facts enter typed child actions. App business policy reduces lifted actions; standalone callback compatibility may remain but must not become managed business-result delivery. The public mapClicked action is an intentional companion API change, with migration notes and version decision at candidate freeze.

Map's reviewed implementation establishes feasibility. Parent independently inspected MapPrimitive and ran six viewport regressions, thirteen genuine managed-view tests and six real Chromium tests, all passing. Runtime source hash at review: cb804c1e729472867707872bd22d6b783cad9d7ce55a7876e8282086f4304ae9. Preserve B4 review and immutable artifact manifests.

Proceed with all remaining maps, graphics and charts capability rows, tests and shipped guidance. Existing D2-D3-NEXT.md is the concrete task list. Correct the documented nested equal-value structural-store viewport issue in the migration; a broad structural type must not silently promise behavior the implementation cannot support. Keep a bounded regression and avoid needless generic machinery.

Retirement stops live native work immediately; an outgoing DOM node is not continuing authority. Document any visual consequence for exit motion. Do not retain live engines merely to animate an exit. Static exit presentation, if needed, is a separate product decision.

Installed tarball ComponentProps, actual defineViews/FeatureViews recipes, nested parent composition, standalone compatibility, relevant SSR/device/native lifecycle and optional dependency checks remain required. Lane owns package fixtures and public examples; parent owns shared harness, final root lockfile/CI/checker integration. Lane may construct an isolated package-local installed proof instead of waiting idle on the shared harness.

Graphics/charts may migrate concurrently in separate owned scopes after this common lifetime contract, with Gemini via Antigravity and Opus escalation/reviews as authorized. Fix supported correctness gaps alongside migration. Final independent Opus review and parent verification are required per package; no publication yet.

## Graphics adapter clarification

The existing Babylon adapter already has asynchronous `initialize(canvas)` returning actual renderer/capability metadata. Preserve that genuine API. Approve a single typed Scene `createAdapter` factory seam, defaulting to a fresh BabylonAdapter per attachment. A GraphicsAdapter extends the existing SceneAdapter methods with required initialize returning the real result and required idempotent dispose. Do not expose optional initialization/disposal, invented fallback capabilities, an instance-or-factory union or hidden string-context injection. No external ownership option is needed. Pending initialization retirement and partial failure must release actual native resources, including late completion, without stale notification or duplicate native destruction. Public standalone Babylon behavior stays compatible. The prohibition on speculative asynchronous Map APIs does not forbid graphics' existing async initialization.
