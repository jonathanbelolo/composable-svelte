# Representation architecture — revision 1 (after Main's response)

Opus 5.5 (native Claude Code, auto mode; effort as launched, stated HIGH), session `91bd68c8-cf5b-4475-ac3e-25a78ad989ca`. This is the single revision requested by `main-representation-response.md`. The first draft is preserved unchanged as `representation-design-v1.md` (SHA-256 `29f37e58…c50e75`). Evidence is in `representation-probes/`: README, `ADDENDUM.md` for the follow-up, and `results/`. **No production, runtime or reference file was changed.** This is design, not approval, and does not authorize implementation.

## 0. Decisions and remaining disagreements (packet for Main)

| # | Main's position | Revision | Status |
|---|---|---|---|
| D1 | Structural projection is the default candidate. Namespaced IDs are confined. No mutation of source animations without proof. Same-asset loading is allowed. Test cold and warm. | Adopted. The effect-detach read is **withdrawn**: P5b found spurious events in Chromium and WebKit. It is replaced by non-mutating **sample-and-solve** plus exact replay of explicit keyframes (§3.2). The network rule is reworded to the D1 wording. | Agreed. Sample-and-solve is **unproven**; it needs one witness. |
| D2/C6 | Rejected "frozen after retirement". | **Visual render lifetime** (§3.4): live surfaces are transferred to or retained by the Host visual run until settle. WebGL uses a retained render resource (P3b-B). Video uses a framework visual player (P3b-C). Unknown third-party renderers are an integration path, not an impossibility. | Agreed in principle. **Open trade-off:** video continuity currently needs a second decoder (§3.4). |
| D3 | Adapter hooks are good, but don't require them; investigate streams. | `captureStream` acquires frames from default non-preserved WebGL **without app cooperation** (P3b-A). Adapter hooks are needed only to *retain render authority* after retirement. v1's C2 is withdrawn as a constraint. | Agreed. WebGPU is unqualified (no adapter here). |
| D4 | The VT probe violated contracts, but VT isn't rejected categorically. | Corrected: overlay `pointer-events:none` plus root excluded keeps real controls clickable, typeable and painting live (P4b). VT is still **not the default**. It is a candidate provider for content that projection can't reach. Interruption behavior stays a provisional observation. | Agreed. No exclusion is proposed. |
| D5 | Rejected an arbitrary 8 ms cutoff and a routine surface fallback. | Preparation runs as **bounded, chunked, cached work within the declared preparation budget** that the design already specifies (§3.3). No routine surface fallback. | **Escalation:** cold large participants exceed the current fixed 250 ms preparation constant. This needs a default or per-plan budget decision (§3.3). |
| D6 | Explicit scoped provider capability, per-app/Host configuration. | Adopted (§3.5). | Agreed. |
| D7 | Capability injection; structural module-graph proof; no byte budget. | Adopted (§3.6). Staging, scroll and choreography are reachable only through imported configuration values. | Agreed. |

## 1. Requirements versus agent choices

**Requirements** (user and established contracts):
- broadly faithful participation of ordinary web-rendered content; SVG and WebGL are explicit priorities;
- live stays live, and live→static is not equivalent;
- flex/grid, nested clipping, rich paint;
- semantic routing, focus, usable real controls, business retirement, inert decoration, bounded visual lifetime and cleanup;
- framework-owned machinery;
- a motion-free Host.

**Agent choices, open to objection:** the provider set, sample-and-solve, the visual player for video, cache and chunking parameters, and VT as a non-default provider.

## 2. Evidence summary

Scripts and data: `representation-probes/`. Corrections are in `ADDENDUM.md`.

| Question | Result (Chromium 141 / Firefox 142 / WebKit 26, headless) |
|---|---|
| Rich participant fidelity: grid/flex root, gradients, shadows, pseudo-elements, rotated positioned badge, SVG refs, cross-origin img, scrolled list, canvas (P2) | 0.047–0.048% differing pixels. Current `captureHTML` skips it. Cold projection 13–18 ms for 34 elements. |
| SVG paint servers (P2d, aligned; supersedes P2c sampling) | Inlining styles on paint servers: 12.3% differing, black fill. Attribute-only paint servers: **0 differing**. |
| Scroll/clip ancestor chain, half-visible row (P5) | 0 / 0 / 0.017% differing. Shadow ink stays outside the clip. |
| CSS animation phase replay (P5) | In phase (Δ 0 / 0 / ≤ 58 ms), but used effect detach, **now withdrawn** (P5b: spurious events in Chromium and WebKit). |
| Cost at scale (P2, P5) | 1,500 elements cold: 327–387 ms writing every property; 153–208 ms writing only values differing from a baseline. |
| WebGL acquisition (P3, P3b-A) | Later-task `drawImage` is blank. `captureStream` into a framework `<video>`: 0 blank frames, lag 0–2 frames, with no ordering cooperation. |
| WebGL after retirement (P3b-B) | Source canvas removed, render loop kept by the visual lifetime: the mirror advances to the current frame, the context isn't lost, and stopping the tracks ends them. |
| Video after retirement (P3b-C) | A removed source `<video>` pauses, and its derived stream stops advancing. A framework visual player (second decoder) keeps playing (0.60 s, 13–18 frames in 600 ms) and disposes to `networkState 3`. |
| Cross-origin image / iframe (P3) | The tainted copy displays; readback is blocked. The iframe document is unreachable. |
| View Transitions (P4, P4b) | Default config blocks input. Named-only config plus overlay `pointer-events:none` keeps input live in Chromium and WebKit. A second VT skips the first and restarts from DOM geometry. Absent in Firefox 142. |
| WebGPU (P3b-D) | No adapter / no API in these headless builds. **Unqualified.** |
| Host attribution (P6; agrees with lead `bundle-attribution.md`) | Choreography modules are 103,121 rendered pre-minify bytes of the Host fixture. |

**Limits.** Small fixtures; Playwright headless builds only, not shipping Safari or current Firefox; DPR 1. Primary platform references are the lead's `platform-references.md`. Normative spec text is not browser qualification.

## 3. Architecture

### 3.1 Representations and providers

A **representation** is a framework-owned, inert visual owned by the Host **visual run**, not by any feature. A **provider** creates it, and the run drives every provider through the same checkpoints: preparation, per-frame read and write, `beforeRemoval`, adoption, settle and dispose.

| Provider | Continuity | Covers |
|---|---|---|
| **Live-real**: leases on the real element | Fully live | Anything painted, while motion stays in its own clip/stacking context and before retirement |
| **Structural projection** (default) | Static layout and paint; animations continue (§3.2); mutation recapture | Ordinary HTML/SVG layout and paint |
| **Surface mirror**: framework `<video>` fed by `captureStream`, or a 2D canvas fed by adapter-hook copies | Live while a renderer draws; **render authority can be retained** (§3.4) | Canvas 2D, WebGL, video; WebGPU once qualified |
| **Native snapshot** (VT, named participants only, overlay non-interactive) | Old state static, new state live | Candidate for projection-unreachable content: cross-origin iframes, closed shadow roots. Not default. |

**Selection is automatic and per participant.** It picks live-real when the geometry stays in context and the source outlives the segment. Otherwise it picks a projection, with mirrors for embedded surfaces inside it.

**Fallbacks.** A necessary fallback, such as a representation that fails, preserves semantics and controls. It is **reported with its visual impact** and never silently substituted. There is no routine surface-box substitute.

**Asset loading.** Same-asset loading under the original request semantics (image URLs, fonts) is allowed. No business action, form, navigation, script, duplicate audible player or unrelated fetch occurs.

### 3.2 Projection rules (revised)

- **As in v1, with the probe evidence:**
  - every computed longhand, written only where it differs from a cached per-tag baseline;
  - materialized `::before`/`::after`;
  - open shadow roots flattened through slots;
  - custom elements become neutral elements;
  - same-URL replaced elements;
  - form state copied without identity;
  - scroll offsets restored;
  - an ancestor clip chain, with ink outside the clip.
- **SVG.** Copied by attribute. Paint servers are attribute-only (P2d). `href`/`url(#)` are rewritten to **representation-scoped IDs**: confined visual identity, collision-checked against the document, never referencing unrelated document IDs, and never semantic.
- **Animations, non-mutating** (P5b rejected effect detach):
  1. **Explicit keyframes** (every animated property has offsets 0 and 1): replay the effect on the copy with the source's timing and `currentTime`. No base value is needed. This is exact.
  2. **Implicit keyframes:** *sample and solve*. While the source is alive, the run's batched read phase records the source's animated computed value, plus the effect's `getComputedTiming().progress`, over two or more frames. The copy's implicit keyframe is then solved for interpolable types (numbers, lengths, colours, 2D transform function lists of matching shape, and opacity) under the effect's easing. This is purely reads.
  3. **Unsolvable** (for example discrete values, or mismatched transform lists): the copy follows the source's live computed value each frame while the source exists (live tracking). After retirement, the animated property holds its last value, **reported** as `animationFrozen`. This is a disclosed, bounded fallback, not presented as live.
- **Cold and warm fidelity** are both acceptance cases (§5). The warm cache must be invalidated by mutation, resize, font, image and animation-set changes.

### 3.3 Preparation and readiness (D5 revision; one escalation)

**Contract today.** The design already defines the cue deadline as *admission + declared preparation budget + cue + slack*, and t0 as the frame preparation completes. The implementation hard-codes `preparationBudgetMs: 250` (`run.ts:19`) and prepares synchronously in one frame.

**Proposal (implements the existing contract; no semantic change):**
- **Chunked preparation.** Projection work is sliced into frame-sized chunks with a slice ceiling to avoid long tasks. It runs within the budget in the Host's read/write phases, before t0. Admission, cue ordering and deadline semantics are unchanged.
- **Warm cache.** Registered participants are projected in idle time. The cache is invalidated precisely (§3.2), and preparation reprojects only dirty entries. Participants named by the admitted plan are prioritized.
- **Bounded memory.** Entry and node caps; LRU eviction on unregister or retirement. Measured, with totals reported.
- **Emergency recovery unchanged.** A preparation overrun settles visuals, and the valid transaction takes the next-turn cue.

**Escalation (timing default, not semantics).** A cold 1,500-element participant needs about 150–210 ms of projection work (P5). Sliced without long tasks, that exceeds 250 ms of wall time. Options for Main:
- (a) a plan-declared preparation budget, which the design text already implies;
- (b) a higher framework default;
- (c) keep 250 ms and rely on the warm cache, with cold large-tree overrun disclosed.

I recommend (a) with a default of 250 ms, plus the warm cache. Measure total work, long tasks and cache memory in acceptance.

### 3.4 Visual render lifetime and live-surface handoff (D2 revision)

A live surface's **render authority** can be transferred from its feature to the **Host visual run** for a bounded visual lifetime. That lifetime ends at settle, supersession (adopt or dispose), Host destruction, preference change, context loss or the run deadline. The visual run has **no store, dispatch, history, focus or effect authority**. It never keeps the feature store alive and never re-runs feature effects.

- **WebGL / canvas** (P3b-A, B):
  - Before the cue, frames come automatically through `captureStream` (or an adapter hook).
  - At `beforeRemoval`, a **retaining provider** (a first-party adapter, or any renderer using D6) transfers its render loop for that canvas and context to the visual run. The scene **continues, not restarts**, drawing into the same context. The mirror stays live until the destination is live, then crossfades.
  - On `webglcontextlost` the track reports `contextLost` and crossfades to the destination. It is never presented as live afterwards.
  - Disposal stops the tracks, releases the loop and drops context references.
  - **Unknown third-party renderers without a provider:** frames are live until their own loop is torn down, then the last frame is shown, reported `liveUntilRetirement`. This is an integration gap addressable through D6, not an impossibility.
- **Video** (P3b-C):
  - Removing the source pauses it (platform behavior), and reparenting page nodes is prohibited by the contract.
  - Continuity uses a **framework visual player**: muted, inert, same URL under the original request semantics. It is seeded to the source's time and play state during preparation, drift-corrected in read phases, and shown after `beforeRemoval`. It is disposed with `pause`, remove `src`, `load()`.
  - **Trade-off for Main:** this is a second decoder and possibly a second fetch, depending on cache and range requests, for the visual lifetime. Audio stays with the business-owned player; the visual player is always muted.
  - The only alternative found is live-real in context, which cannot outlive retirement.
- **Destination continuity.** The destination's real element becomes live at commit. The framework does not seed destination business state, such as playback position or scene state. If the app wants the destination to resume the same moment, that is an explicit business decision in its state. The framework crossfades the retained visual against it.

### 3.5 Provider capability (D6)

- **Configuration.** Declared per app/Host (`defineApplication({ visual: { providers: [...] } })`, or through an adapter's `visualProvider()` value). No global registry and no import side effects.
- **Interface.** As in v1: `qualify`, `prepare`, `read`, `write`, `invalidate`, `retire`, `dispose`. Additions:
  - `retainRender?(ctx)` returns `{ frame(t), dispose() }` for D2;
  - `identity` (a key scoped to the provider and participant);
  - readiness as a bounded promise within the preparation budget;
  - observable failure as diagnostics.
- **Scope.** Providers receive visual capabilities only. Ordinary HTML/SVG needs no app-authored provider.

### 3.6 Motion-free Host (D7) and small fixes

- **Motion-free Host.** `ApplicationHost` depends only on a `RouteVisualPort` interface. The choreography runtime and providers enter through a configuration value imported from `/application/motion`. Staging and scroll restoration enter through configuration values imported from their subpaths, so reachability is static for the bundler.
- **Structural acceptance for the Host.** The module graph of the motion-free Host fixture contains no choreography/representation/staging/scroll modules, compared on the same exports against the base. The residual delta is attributed per module (lead `bundle-attribution.md` baseline).
- **Image recapture.** Outgoing recapture goes through the same registry and policy. Fixed once, with a witness.
- **Legacy `CaptureChannel`** (immediate navigation) is unchanged unless the shared abstraction requires it; if it changes, it needs a regression proof.

## 4. Capability disposition (revised)

**Supported today:** only the existing qualified block/inline scope, `img`, 2D ancestors, numeric channels and live-real leases.

**Not yet implemented; feasibility shown:**
- flex/grid/positioned roots and descendants, rich paint, pseudo-elements, nested clipping (P2, P5);
- SVG with local references (P2d);
- explicit-keyframe animation replay;
- WebGL/canvas acquisition and retained rendering (P3b);
- video continuity through a visual player (P3b);
- VT named-participant input (P4b).

**Not yet implemented; unproven:**
- sample-and-solve for implicit keyframes;
- chunked cold preparation of large trees within budget;
- warm-cache invalidation completeness;
- SVG SMIL, filters, masks and text;
- same-origin iframe projection;
- `backdrop-filter`/blend fidelity in the plane;
- `::marker`, `::first-letter`, `counter()` content;
- sticky/fixed descendants;
- WebGPU (P3b-D: no adapter);
- VT interruption continuity;
- closed shadow roots (honestly unqualified);
- cross-origin iframes through live-real or VT.

**Proven constraints, mechanism-specific** (no exclusion proposed; Main disposes):
- Cross-origin iframe documents are unreachable for **structural projection** (P3). Mitigation: live-real in context, or the VT named-participant provider.
- `drawImage` from a non-preserved WebGL canvas after the frame is blank (P3). Mitigation: `captureStream` (P3b-A).
- A removed media element pauses (P3b-C), and a source-derived stream stops advancing. Mitigation: the visual player.
- Effect detach dispatches events (P5b). Mitigation: sample-and-solve.

v1's C2 (WebGL needs an app hook), C5 (VT intrinsically blocks input) and C6 (freezing is contract-inherent) are **withdrawn**.

## 5. Acceptance witnesses (small, three engines unless noted)

1. **Restored rich reference, no capture-avoidance CSS.** All scenarios, cold and warm. The t0 copy-vs-source diff meets the threshold, mid-commit overlap frames are captured, and the F1/A5 control and focus witnesses are unchanged.
2. **SVG participant** with gradients, clip/mask, `use`, text and one explicit and one implicit animation. Aligned-crop fidelity; animation phase continuous across commit; representation-scoped IDs with no collisions.
3. **Animated WebGL across commit** (first-party adapter). Frame counter advances continuously in the plane before and after commit, then crossfades to the live destination. Context-loss variant. Resources zero after settle, supersede and destroy.
4. **Video across commit.** The visual player advances through the commit and the audible source is unaffected. Disposal is verified.
5. **Cold preparation of a large tree**: t0 within the declared budget, no long tasks over the slice ceiling, total work and cache memory reported.
6. **Controls, focus and identity safety** in the restored reference: no hit testing, focus, duplicate IDs, custom-element construction or new business activity from representations.
7. **Motion-free Host module-graph proof**, and the image-recapture witness.

## 6. Remaining disagreements and questions for Main

1. **Video second decoder (D2).** Approve a muted visual player for the visual lifetime, or name an alternative. I know of none that satisfies both the contract (no page-node reparenting) and continuity.
2. **Preparation budget default (D5):** (a), (b) or (c) from §3.3. This is the only timing-default change.
3. **Sample-and-solve.** Accept it as the non-mutating strategy, subject to a witness, with the reported `animationFrozen` fallback for unsolvable types.
4. **VT provider scope (D4).** Keep VT optional for projection-unreachable content only, in engines where named-participant VT is available. Or defer it until element-scoped VT and interruption continuity are qualified.

Final probe state: follow-up results and `ADDENDUM.md` are recorded, and earlier results are preserved.
