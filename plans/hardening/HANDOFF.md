# Handoff — state of the library, and what to do next

Written 28 August 2026. Measurements taken at `86b2da4` and re-verified at
`e0dbb4c`; working tree clean, full gate green.

Everything below was measured at that commit. Where a number appears, the
command that produced it is named. Nothing here is estimated — that discipline
is the point, because this campaign has repeatedly recorded numbers that were
reached for while writing prose and never checked.

---

## 1. The headline

**The repository is in good shape. The published library is a different, older
thing.**

All eight packages are on npm. Every one is behind this tree, and `core` is
behind by six minor versions:

| package | repo | npm | drift |
|---|---|---|---|
| core | 0.11.2 | **0.5.2** | 6 minors |
| chat | 0.3.0 | 0.2.3 | 1 minor |
| code | 0.3.0 | 0.1.3 | 2 minors |
| media | 0.3.0 | 0.1.3 | 2 minors |
| graphics | 0.1.2 | 0.1.1 | 1 patch |
| maps | 0.1.3 | 0.1.2 | 1 patch |
| charts | 0.1.3 | 0.1.2 | 1 patch |
| auth | 0.1.1 | 0.1.0 | 1 patch |

Source: `package.json` versions against `npm view @composable-svelte/<pkg> version`.

Two consequences worth stating plainly:

- **None of the hardening work is in anyone's hands.** Six review rounds of
  fixes exist only here.
- **The install instructions cannot work.** Every sibling pins
  `@composable-svelte/core ^0.11.0`, which the registry cannot satisfy at 0.5.2.
  An `npm install` of `chat`, `code`, `graphics`, `media`, `maps`, `charts` or
  `auth` fails to resolve its peer. This was discovered when a pack-and-install
  probe hit `ETARGET` against a version that looked local.

**Cutting a release is the highest-value next action**, above any further review
round. Until then the campaign is improving something nobody can install.

## 2. What is measured and solid

- **3,865 tests passing**, gate green. `pnpm test` now serialises the workspaces
  (`--workspace-concurrency=1`), as does CI — seven of eight packages drive a real
  browser, and running four at once produced failures about scheduling rather
  than about code. Packages total 3,759: core 2,092 (browser, 3 skipped) + 413
  (node), graphics 482, chat 235 + 5, charts 191, maps 106, media 94, code 81,
  auth 54. Examples add 106.
  Examples add 106 across six workspaces, unchanged.
  *The figure before this campaign's last two sections, 3,256, included the
  examples; compare against 3,852, not against 3,746.*
  *The previous figure here, 3,256, included the examples; compare against
  3,849, not against 3,743.*
- **The gate is `build → typecheck → svelte-check → test`** across all
  **19 of 19** workspaces. `svelte-check` genuinely covers all of them; it once
  covered two.
- **Fifteen repo-level guards** in `packages/core/tests/repo/`, 251 assertions:
  animation policy, check coverage, component coverage, dist freshness, doc
  examples, doc typecheck, export surface, guard integrity, optional props, peer
  ranges, published files, side effects, typecheck coverage, walk, and
  intentionally-unused.
  `guard-integrity` is the one that checks the others *run* — a new guard has to
  be registered in two configs, and an unregistered one asserts nothing while
  looking exactly like coverage.
- **Export surfaces are good.** Six of eight barrels are explicitly curated;
  five packages have zero orphaned exported types; `auth` is exemplary.
- **11 example apps**, all building, six with their own tests.

## 3. What the front-doors session did (4 commits, `7742bb4..86b2da4`)

*This section describes the session that wrote this handoff. Everything after
`c036585` — the charts accessibility work, the maps adapters, the media video
fixes, the graphics console and lifecycle round, the shared guard walk, and the
two documentation registers of §4.5 — came later and is recorded in the §4
entries themselves, each of which says CLOSED where it is closed.*

The focus moved from `graphics` internals to the front doors, because an
independent API assessment found that **four of nine package quickstarts did not
work if pasted**, including the library's own first example.

| commit | what |
|---|---|
| `7221097` | `fix(core)!` — `Effect` is exported as a **type** as well as a value |
| `2bfd769` | `fix(code)!` — state factories renamed; quickstart compiled |
| `384a79c` | `fix(media)!` — two `AudioManager`s disambiguated; quickstart compiled |
| `86b2da4` | `docs` — four false claims the front doors made about themselves |

**The recurring shape, and it is worth carrying forward: the documentation was
right about what the name should be, and the API was wrong.** Each of the three
breaking changes fixed the code, not the docs.

- `Effect<Action>` was `TS2749` in the repo README, the core README and
  getting-started — roughly **50 instances across 10 live documents**. A value
  and a type may share a name when declared in the *same module*; the old
  comment claiming a conflict was true only of the two-`export…from` shape it
  tried. One line in `effect.ts`. `EffectType` remains and is not deprecated.
- `code` had **three naming conventions for one concept** and the README used a
  correct fourth. All three now match.
- `media` had two different `AudioManager` classes, and the un-suffixed name
  resolved to the *less* prominent one while being documented as the other.
  Because both factories take a string, **the wrong call typechecked and
  returned the wrong class** — a worse failure than one that does not resolve.
- Also fixed: `createTestStore` imported from the wrong entry point in **eight**
  documents (an assessment had said four); `charts` documenting a `$:` statement
  that is a compile error under runes; `charts` and `maps` claiming a peer of
  `^0.3.0` against the real `^0.11.0`; component counts that disagreed between
  two READMEs (77 vs 73+, with the real answer depending on what you count — 37
  families, 55 barrel exports, 57 files, 79 total, 98 built declarations, so the
  bare number was removed rather than replaced).

**Two quickstarts became compiled files this session** —
`packages/code/tests/doc-examples/code-highlight.svelte` and
`packages/media/tests/doc-examples/audio-player.svelte` — typechecked by
`svelte-check` in `pnpm -r check`, with `doc-examples.test.ts` asserting the
README quotes them verbatim. `EXPECTED_EXAMPLES` in that test now names **seven**
files: those two plus the three `graphics` examples added in earlier rounds,
which mirror README blocks but are not quickstarts.

## 4. Open work, in priority order

### 4.1 Cut a release — blocking everything else

Nothing else reaches a user until this happens, and it is **not** a routine
bump. Re-measured at `16c015f`: **46 breaking commits out of 263** — by scope,
counting a multi-package commit once per package it names: graphics 21, chat 10,
charts 5, maps 4, core 4, media 3, auth 3, code 2.

(This paragraph read "39 out of 190" until the hardening sessions added to both
figures. Re-measure it before drafting a changelog rather than quoting it; the
repository also carries **no git tags at all**, so `2443ab4` is a commit someone
remembered, not a marker anything points at.)

So this is a **major-version release across most of the monorepo**, not a patch.
`core` in particular has four breaking changes on top of a registry version that
is already six minors behind, and the three from this session alone are
`Effect` occupying the type namespace at the package root, and renamed exports in
`code` and `media`.

Practical consequence: the CHANGELOGs need to carry these, and `core`, `chat`,
`code`, `media` and `graphics` should almost certainly go to a new major rather
than continuing the 0.x line — or, if 0.x is retained deliberately, that decision
should be written down, because 39 breaking changes under a 0.x minor is a choice
someone will have to defend.

### 4.2 The round-six code defects — CLOSED

A three-reviewer hostile review of round five found ~34 defects. The severe ones
are now fixed, in `6dc6111`, `8af6938`, `02bf3e4`, `6689aa9`, `7fbc5a4`,
`f44bf81`, `f5fbcee` and `581844a`. What each turned out to be, against what the
entry below claimed, is recorded after it.

> **This document is the only record of round six**, and since §4.7 was executed
> it is the only prose record of rounds three, four and five as well. The
> register used to write those three up in 368 lines; that narrative duplicated
> the commit messages, nothing linked to it, and it went when the register was
> reduced. It is recoverable with `git show` — but nothing in the working tree
> summarises those rounds any more, and round six was never written into the
> register at all. If this file is lost, the summaries are lost.
> Everything in §4.2–§4.4 and §4.6 comes from that review.

The severe ones, all in `graphics`, all introduced by round five's own fixes:

- **The `empty` guard made the case it names permanently unrecoverable.**
  `texture-validator.ts:190` refuses a zero-dimension source; the refusal leaves
  `registration.texture` undefined and `webgl-overlay.ts:826`
  (`handleElementUpdate`) early-returns on exactly that. A `<canvas>` refused
  before layout is inert for the life of the page. **Before round five it
  recovered on the next `updateElement()`.** A silent cosmetic failure was
  turned into a permanent one.
- **Two fixes in one commit interfere** (third occurrence of this pattern).
  `elementSize` returning `null` skips the whole `if (size && previous)` block at
  `texture-factory.ts:397` while `texImage2D` still runs below — so the `empty`
  guard is structurally unreachable from `updateTexture`, `if (refusal.empty)`
  is dead at that call site, and a live canvas collapsed to height 0 uploads
  silently with stale tracked dimensions. The `elementSize` doc comment
  attributes the defect to a function the creation path never calls, which is
  why the change landed in the wrong place.
- **`<Mesh>`'s hoisted pre-check orphans a renamed mesh.** A component owning
  `first` that is given `id="second"` with invalid geometry returns before
  `removeMesh: 'first'` dispatches. `MeshGeometryHarness.svelte` hard-codes one
  id, so no test can reach it.
- **`onTextureLoaded` is still dropped when the *initial* creation fails.** The
  debt enters `owedTextureLoaded` only on the context-lost branch
  (`webgl-overlay.ts:354`). Round five fixed this for a failed *rebuild* and left
  the identical failure on the immediate path — and the README added this round
  claims it fires either way.
- **`owedTextureLoaded.delete(id)` on unregister survives its mutation** at
  363/363. A real property with no coverage.

Plus: the "no pixels" condition reports two different error codes (canvas →
`TEXTURE_CREATION_FAILED`, image/video → `INVALID_ELEMENT_TYPE`) while the README
states the first unconditionally; `overlay-error.ts:22` still says
`MEMORY_BUDGET_EXCEEDED` is the only refusal; `TextureTooLarge` is exported and
referenced only by the union that defines it.

**Outcome, and where the entry was wrong.**

Every severe item was real. Two were *under*-stated and one was wrong:

- **The retry fix was itself incomplete, in the same way.** Making a refused
  element recover on the next update reached `<canvas>` (infers `manual`) and a
  playing `<video>` (infers `frame`) and missed `<img>` — which infers `static`,
  so `updateElement()` refused it a second time for having the strategy every
  image has. The commonest not-ready case there is, and what
  `examples/shader-gallery` does, stayed permanently inert until `f5fbcee`.
  Found only by checking a README sentence before publishing it.
- **The retry introduced a leak the entry could not have known about.** An async
  creation started per update stacked concurrent creations, each overwriting the
  previous `registration.texture`: three updates in one tick made three textures
  and two survived `destroy()`. Fixed with a `creating` guard in `6689aa9`.
  Likewise the collapsed-source refusal reported 60×/second, because the
  suppression went on the creation path and not its twin — instance-versus-class
  failing inside the commit that cites the rule.
- **`TextureTooLarge` is not a phantom.** `validateSize` returns it and callers
  consume it by destructuring `validation.scaled` rather than narrowing on the
  name, which is why a grep found nothing. Deliberately left alone; recorded so a
  later count does not delete it. *Unused is not dead.*

The `owedTextureLoaded` item deserves its own note, because the first attempt at
it was worthless. A test file asserting the deletion passed the mutation 7/7: the
two writes that hide the strand — registration *overwrites* the entry, a
successful creation *deletes* it — mean the obvious test cannot fail. Only an id
that returns without a callback and is refused at creation can observe the leak,
by the retry path or the post-restore rebuild. `7fbc5a4` covers those two and
relabels the rest as the properties they are, stating in the file which arms are
not guards. A test that cannot fail is worse than no test, because it is counted.

graphics: 391 → 426 tests.

### 4.3 The guard that deletes itself — CLOSED

`packages/core/tests/repo/doc-examples.test.ts`:

- **`docs()` at line 93 uses the throwing `statSync(full)`** while
  `docExamples()` was given `throwIfNoEntry: false`. One dangling `.md` symlink
  makes the file fail to **collect** — every test in the file ceases to exist
  (17 at the time of writing), and no vacuity arm can fire because none load. The commit message claiming "both use
  `statSync` now" is false.
- **`docs()` at line 82 uses `entry.isDirectory()`**, which is false for a
  symlinked directory; it then fails the `.md` check and vanishes silently. Same
  class as the "third bare `continue`" that commit made its headline.
- `export-surface.test.ts`: a *registered* package that drops `exports` entirely
  — worse than the wildcard it is registered for — is exempt from
  `exportProblems()` and caught only by the staleness arm, which reports the
  opposite.

**Outcome, and where the entry was wrong.** Fixed in `70a2497`, `c9fab5e`,
`13bb67a`, `68b0d32` and `193092b`.

All three findings were real. Two corrections:

- **It was never one file.** The throwing `statSync` was in five guards
  (`doc-examples`, `optional-props`, `typecheck-coverage`, `animation-policy`,
  `dist-freshness`), and *every* guard decided directory-ness from
  `Dirent.isDirectory()`, including the one-level `packages/*` listings that
  decide what gets walked at all. One shared `tests/repo/walk.ts` now does both,
  and `guard-integrity.test.ts` stops a copy coming back.
- **"The suite still reports green" is false**, in this entry and in my own
  commit message for `70a2497`. Measured with a real dangling symlink: vitest
  reports the collection failure and exits non-zero. What is true is that every
  assertion in the file stops being made and is replaced by one ENOENT about a
  symlink — seventeen checks traded for an error that says nothing about what
  they guarded. Worth fixing; not silent.

**Nothing here had ever fired**: the working tree contains no symlinks. This is
hardening against a failure mode, not a repair of a live defect, and the tests
build a fixture because the real tree cannot demonstrate either case.

A fourth hazard turned up while doing it, of the same family and worse:
`vitest.node.config.ts` lists its test files **explicitly rather than globbing**,
so a guard added to `tests/repo/` simply does not run — no output, no failure,
nothing to notice. It nearly happened to the first file this work added.
`guard-integrity.test.ts` now checks that list in both directions.

core node suite: 353 → 397 tests.

### 4.4 The harness — CLOSED

`packages/graphics/tests/helpers/fake-gl.ts`:

- `bufferData(target, size)` hardcodes `view: Float32Array` and `bufferSubData`
  never updates it, so a 6-byte index buffer throws `RangeError` from
  `bufferContents` and allocate-then-sub-upload returns garbage.
- `DataView` and bare `ArrayBuffer` — both legal `BufferSource` — fall through
  both branches and produce the same false "has had no bufferData" message the
  campaign already claimed to have closed for `Uint16Array`. **The instance was
  fixed; the class was not.**
- The fake does not model a lost context at all: per spec every `create*` should
  return `null` while lost, and `isContextLost()` does not exist. The
  `CONTEXT_LOST` tests therefore verify only the overlay's own bookkeeping flag.
- Two weak fixtures, both mine: `honours the allocate-only form` uses 32 bytes +
  `Float32Array`, the unique combination where the hardcoded default is correct;
  and `refuses an image with no height` uses `loadedImage(256, 0)`, which no
  decoded image reports — with the realistic `0, 0` it passes **with the entire
  `empty` guard deleted**.

**Outcome.** Fixed in `cec9ce4`, `60b2f83`, `7965f86`, `000f7ef`. All four items
were real and reproduced before being touched. Three things the entry could not
have known:

- **Modelling the lost context found a real defect.** `RenderPipeline` set
  `initialized = true` even when `createBuffer` returned `null` for both quad
  buffers, so `render()` bound the program, set the uniforms and called
  `drawArrays` with no geometry — drawing nothing, every frame, in silence. The
  two `if (buffer)` guards read as careful handling and were the mechanism.
  Fixed in `7965f86`; it had been unreachable from any test, which is how it
  survived six review rounds.
- **The fake aliases every canvas onto one context**, and that mattered the
  moment lostness became state: `checkWebGLSupport` probes a throwaway canvas
  and releases it with `WEBGL_lose_context` on every `createOverlay`, so one
  shared flag killed the overlay's context and **112 tests failed, none of them
  about context loss**. The src is correct; lostness is now tracked per canvas.
- **`failNextCreate` was necessary, not decoration.** `registerElement` refuses
  with `CONTEXT_LOST` before the texture factory is called, so losing the
  context cannot reach its three null guards at all. Modelling allocation
  failure separately is what makes them reachable — otherwise the new file would
  have claimed coverage it did not have.

**A hostile review of the above found three errors of mine, fixed in `c33b9f1`
and `aba1945`.**

- **"Six unreachable guards" was five, one of them not mine.** Mutating each
  guard separately: the **video** one was covered by nothing before or after,
  and the **image** one was already covered — by two older suites that reach it
  by monkey-patching `createTexture`, having improvised what `failNextCreate`
  now provides. The video path has an arm now. Reading the diff would never have
  shown this; only a mutation per site did.
- **The pipeline fix traded silence for a flood.** Making the failure audible
  made it audible from `render()`, which runs per element per frame: 61 console
  errors for 60 frames. The same trade `reportRefusal` exists for, missed one
  commit after the message citing it.
- `createOverlay` is not exported — the claim holds, but both `abd7fbe` and this
  file cited `src/lib/index.ts:25`, and the barrel is **`src/index.ts`**. A path
  I did not open, in two committed documents.

On the weak fixtures: the `empty` guard turned out to be covered by twelve arms
across four files, all from `f44bf81`, so no new test was needed for that half —
verified by deleting the branch. The image fixture was worse than recorded: a
256×0 image is refused by the image path's height check *and* by `validateSize`,
each covering for the other, so **deleting either left it green**. It pins the
refusal *message* now, which is the only thing that branch actually decides.

graphics: 426 → 482 tests.

**A third review, run as a checklist rather than a read-through**, closed the
class instead of another instance. All 46 `console.*` sites in `src` were
enumerated and classified by whether a loop can reach them, which produced the
rule the package now follows:

- a message about a **standing condition** fires when the condition worsens —
  fixed for the render pipeline, missing uniforms, memory pressure (`ff8d43e`)
  and low frame rate (`7fdce85`)
- a message about a **caller's action** fires every time, because each call is a
  separate mistake — measured at 30 reports for 30 bad `updateElement` calls and
  deliberately left, since suppressing it would undo §4.2's work

Memory pressure was the worst: **21 warnings for 10 updates**, because a
re-upload calls `trackAllocation` twice. An edge trigger on "crossed 80%" would
not have helped — the same release-and-re-track dips usage to 0% and back every
update, so every update is a fresh crossing.

`tests/overlay/console-quiet.test.ts` now bounds the whole class end to end, so
the next instance fails a test rather than waiting for a review. **Its first
version did not work**: it drove `updateElement` only, and a log planted in
`RenderPipeline.render` — where two of the three defects lived — passed every
arm. Planting a defect is what showed it; reading it would not have.

**A second hostile review, of the first review's own fixes**, found three more —
`c440ad6`, `617aaa5`, `4a517f0`:

- **The pipeline fix missed its sibling six lines away.** `c33b9f1` suppressed
  the per-frame log in `render()` and left `renderBatch` with the identical
  unguarded `console.error`: 61 errors for 60 batches, the same number and the
  same defect that commit was written to remove. Both route through one method
  now. It escaped because I read the diff instead of grepping the file — the
  fourth time in this campaign a fix has landed on one path and not its twin,
  and the second time inside a commit whose message names the rule.
- **The same class was already live one file away.** `ShaderProgramManager`
  warns when a program does not declare a uniform being set, from two methods
  both reached by `render()`: 60 warnings over 60 frames for a shader without
  `uTexture`. Pre-existing, and found only by sweeping for the class after
  fixing two instances of it — the sweep that should have followed the first.
- **The buffer store's type precedence was untested and wrong.** Two uploads
  disagreeing kept the *first* type, so `[9, 9, 9, 9]` written as `Uint16` read
  back as `[8.26e-40, 8.26e-40]`. And `describeValue`, which shapes every refusal
  message, had no arm at all: the existing ones match only the fixed half of the
  sentence.

Also corrected: this line said 452, which stopped being true three commits after
it was written.

### 4.5 Documentation beyond the front doors — CLOSED

Two committed guards, both burned down to zero.

**`tests/repo/doc-typecheck.ts` + `.test.ts`** extracts every ```ts/```typescript
fence and every `<script lang="ts">` body from a ```svelte fence that names
`@composable-svelte`, and compiles them against the built `.d.ts` files with the
TypeScript compiler API. It reports only the codes that can be produced *by
getting this library's surface wrong* — `TS2305`, `2724`, `2749`, `2551`, `2339`,
`2554`, `2345`, `2739`/`2740`/`2741` — which turns ~1,969 semantic diagnostics
into 86. The rest is excerpt noise (`Cannot find name 'store'`), which is what an
excerpt is; a blanket typecheck is still not adoptable and never will be.

86 measured → 84 registered (CHANGELOG excluded: a record of the past is not an
instruction) → 80 after four of the guard's own findings turned out to be wrong
→ **0**. `REGISTER` stays in place, empty, with both arms: an unregistered error
fails, and a registered error that no longer fires fails too.

**`ALLOWED_MISLABELLED` in `doc-examples.test.ts`** went 22 → **0**. Widening the
mislabelled-fence arm from `SWEPT_DOCS` to every document found 82 wrong labels;
60 were relabelled outright and the 22 mixed listings — one fence carrying a
state interface, a reducer *and* the markup using them — are now split into a
```typescript fence and a ```svelte fence whose script is typed, so both halves
are checked rather than neither.

**What it covers, and what it does not.** Svelte **markup** is not typechecked —
only the `<script>`. `doc-typecheck.ts` says so in its own docstring rather than
implying coverage it does not have. That limit is not theoretical: splitting the
media skill's quickstarts turned up `<FullAudioPlayer {playerStore} />` and
`<VoiceInput {voiceStore} />`, both of which pass a prop that does not exist and
omit the required `store`. Neither guard could see them; reading `dist/*.d.ts`
while editing did. For markup, the working mechanism is still
`tests/doc-examples/` — a real file compiled by `svelte-check`, quoted verbatim
by the document.

**Three things the guards got wrong, all caught before acting on them.** `types:
[]` removed Vite's `ImportMeta`, so four correct uses of `import.meta.env`/`hot`/
`glob` were reported as defects — uncorrected, that would have had me rewrite
four working examples into broken ones. `looksLikeSvelte` matched an HTML error
page inside a template literal, and separately missed `<svelte:head>` entirely,
passing one SSR listing while failing its identical neighbour forty lines up.
Both rules are narrowed and both directions are checked.

**And two the documents got wrong in a way a rename would not have fixed** —
recorded in 4.9 as product gaps rather than deleted quietly.

### 4.6 The graphics README — CLOSED

Reviewer findings still live at `packages/graphics/README.md`:

- **Line 372** documents `registerElement(id, element, options)` with a `type`
  option. That is `createOverlay`'s **internal** API. The public component method
  takes a single object — `{ id, domElement, shader, updateStrategy?,
  onTextureLoaded? }` — and infers `type`. It contradicts the README's own
  compiled example forty lines above.
- `maxTextureSize` "defaults to the driver's own" is false on mobile:
  `device-capabilities.ts` caps at `Math.min(driver, 2048)`.
- The `BabylonAdapter` line says it drives `<Scene>` when it replaces it, and
  sits inside the WebGL Overlay section.
- `SKILL.md`'s `OverlayOptions` table never received the two new
  `maxTextureSize` rules the README got — the two documents disagree again.

**Outcome.** Fixed in `abd7fbe`. All four were real, and the first is worse than
recorded: `createOverlay` is **not exported** (`src/index.ts:25` — `src/lib/`
was a path I cited without opening), so the README documented a call no consumer
can make. Verified against the built package as well as the source: it is absent
from `dist/index.js`, and the `exports` map has no wildcard, so no deep import
reaches it either. `SKILL.md` had the right
signature all along, which is how the two came to disagree — and it had acquired
two false claims of its own since, both corrected here.

### 4.7 The register — CLOSED

`plans/hardening/README.md` is **183 lines**, down from 2,088. It is now an index
of what is open, plus pointers to the entries that code cites by name.

Deleted: the 368-line round-by-round narrative and the 58-line "Corrections made
to earlier claims", both of which duplicated commit messages that nothing linked
to, and the long DONE write-ups. Git keeps all of it.

Corrected on the way out: the status row that read `Open — breaks a consumer at
install/build | 6` now reads **0**, which it always was — its own parenthetical
named three of the closures while leaving the count alone.

**The verification protocol moved to `guides/VERIFICATION-PROTOCOL.md`** and is
referenced from `CLAUDE.md`'s Resources list, which previously pointed at neither
it nor `plans/hardening/` at all. It gained three rules this campaign learnt and
had never written down: a zero-reporting guard needs a positive control; build
before running the gate, because mutation testing updates mtimes; and write edits
incrementally, never behind a late assertion.

**Two hand-maintained lists became guards instead of prose**, which is the part
worth carrying forward. Both had drifted every time they were touched:

- The intentionally-unused public members — recorded as eight, corrected to ten,
  actually **eleven**. Now `intentionally-unused.test.ts`, which fails both when
  a member is deleted and when one gains a caller.
- The documented-example backlogs, already guards, with both registers empty.

The seven citations of the register were checked individually rather than
assumed. Six needed an anchor kept; the seventh —
`babylon-adapter.ts:90`'s pointer to a WebGPU gap — turned out to be **already
half-dangling**: the register's only WebGPU mentions were inside a DONE section
recording the *removal* of false WebGPU claims, not a forward-looking gap. The
reduced file now carries the gap properly.

Numbers that were wrong and are not carried forward: T10's three
(heading 41, body 139/63, guard comment 41/16 — different populations, all
predating the fence sweep) and T12's three (472, 436, 427). T10 is re-measured at
**53 blocks in 18 files**, 35 of them real syntax errors. T12's is deliberately
left unmeasured, with the reason: every recorded figure was grep-shaped, and a
grep cannot separate a function *returning* `| undefined` from a property
accepting it. Extending `optional-props.test.ts` to `.ts` files is the next step
for that item.

### 4.8 Longer-standing register items — CLOSED

All four remaining items are done. `T13` and `T11` closed earlier; `T7`, `T10`
and `T12` closed here.

**T7 — `ed855dd` reviewed, and it was worth reviewing.** Three defects, all in
arms that commit itself changed, all unpublished (chat 0.3.0 predates it by a
day; npm has 0.2.3), so all free to fix:

- The "announce presence on connect" arm it added **could never fire**. It read
  presence out of `state.users`, which is filled only by inbound frames — you are
  not in your own user map until the server echoes you. And the same assumption
  disabled `updatePresence` for that entire window, which is the loss the arm
  existed to prevent. Its test passed by dispatching a synthetic `userJoined`
  before connecting, an ordering the library cannot produce.
- **Stop did nothing while an attachment was uploading**, leaving the progress
  bar frozen at `uploading` — the exact symptom that commit's message describes
  as the defect it was fixing.
- **Upload progress was discarded on the edit and regenerate paths**, because
  only `sendMessage` marked attachments `uploading`. Also the defect its own
  comment claims to have fixed, fixed in one arm of three.

It also changed six public action arms with no CHANGELOG entry — the omission it
criticises `code` and `media` for. All three are now recorded there.

**T10 — every documented Svelte example compiles.** 53 → **0** across every
document, and `SWEPT_DOCS` is gone: the compile arm is unconditional. Nineteen of
the 53 went guard-side without touching a document (declaring the stores an
excerpt elides, honouring the counter-example markers, excluding CHANGELOGs as
the two sibling guards already did).

A hole in §4.5's close turned up on the way: **eight mixed listings were hiding
inside ```svelte fences**, holding 501 lines of TypeScript that neither guard
read. `ALLOWED_MISLABELLED` only inspects fences whose label is *not* `svelte`,
so it structurally could not see them. A mirror arm now does, and it landed
before the splits so the number was measured down rather than asserted.

**T12 — the number is 311**, not 472 or 436 or 427. Those were greps, and a grep
cannot tell `() => void | undefined` from `(() => void) | undefined`. The
splitter that already knew the difference now runs over `.ts`. Reported rather
than swept, with its scope written beside it: discriminated unions opening with
`|` are not counted, and covering them would raise the figure.

### 4.9 Genuine product gaps (not defects)

- ~~**`charts` is not accessible for interactive use**~~ — closed. It has a
  keyboard cursor in the reducer, a data-table fallback, and an AA review. One
  a11y warning remains (`tabindex="0"` with `role="img"`, `Chart.svelte:102`),
  recorded in the register.
- **`maps` is mid-phase** — its README says Phase 12C in progress.

**From the §4.5 burn-down.** Nine documented APIs turned out not to exist, or not
to exist in the documented shape. Each was corrected in the document, because a
document must describe what ships — but the correction is a *narrowing*, and the
gap is worth a decision rather than a quiet deletion.

One was a real omission and was fixed in the library instead (`903a05b`): the
navigation DSL builder was built, tested, and never exported. Renaming the
3-argument state constructor to `destinationState` freed the name
`createDestination` for the builder the documents had been describing all along.
Breaking, deliberate, and the better API.

*Documented but never built* — five:

- `createMockStorage`
- WebSocket **queue inspection** (`ws.queue.length` and friends). Judged not
  worth building: the queue is an implementation detail of reconnection, and
  exposing it invites reaching into it.
- `serializeState` with custom serializers
- `Clock.live` / `Storage.live`
- `createParserConfig`

*Built, but a different shape than documented* — three. None is a naming
problem, so none would have been caught by an export-name check:

- `combineReducers`
- `ParserConfig`
- `parseQueryParamsWithSchema`

Two more that only the split turned up, in markup no guard reads:
`FullAudioPlayer` and `VoiceInput` were documented with `{playerStore}` /
`{voiceStore}` shorthand, and both components declare `store`.

## 5. Method rules that earned their place

These are the ones that actually caught things, and each has a scar behind it.

1. **Every mutation is run, never predicted — and read the output, not the exit
   code.** Several mutations across the campaign misfired on their anchors and
   reported clean passes without ever applying.
2. **A survivor is rebuilt once before it is believed.** This session:
   `svelte-check` reported 0 errors against a renamed export, which read exactly
   like a guard that does not guard. It resolves through `dist` and the rebuild
   had been skipped. A control error injected into the example separated "not
   checked" from "mutation not landing".
3. **Mutate the fixture, not only the code.** A mutation probes the axis you aim
   it at; aiming it requires already knowing where the weakness is. The fixture
   and the code share the author's blind spot because one person wrote both.
   Twelve instances of "the convenient setup hides the defect it was written to
   find" have now been recorded.
4. **Assert the observable is non-vacuous before asserting its value.** One line,
   and it does not depend on the defect model being right — unlike rule 1.
5. **Ask whether a fix is the instance or the class.** Five of round six's
   findings were the same defect surviving in a sibling site.
6. **Compile the claim before publishing it.** A signature written from memory is
   a guess in whichever direction it is being corrected. This session produced a
   *corrected* signature that was also wrong (`getAudioPlayerManager` takes two
   arguments, and its config has no `id`); the fix was to write the example as a
   file, compile it, and paste the compiled form.
7. **A commit message states what a test proves, or marks the claim unverified.**
   Round six found four false claims of this kind, including a method name
   (`getCapabilities()`) that does not exist.
8. **Measure counts before drafting.** Eight wrong counts across the campaign,
   several inside paragraphs about wrong counts.

## 6. Suggested order for the next session

1. **Cut a release.** Everything else is invisible until this happens.
2. ~~**Fix §4.2**~~ — done. Eight commits; see the outcome note under §4.2 for
   what the entry got wrong, including a fix of mine that repeated the very
   defect it was closing.
3. ~~**Fix §4.3**~~ — done. The defect was in eleven guards, not one, and the
   config that decides which guards run was itself unguarded.
4. ~~**Execute §4.7**~~ — done. 2,088 lines to 183; the protocol moved to
   `guides/VERIFICATION-PROTOCOL.md`; two hand-maintained lists became guards.
5. ~~§4.4 (harness), §4.6 (graphics README)~~ — done; §4.4 turned up a live
   rendering defect.
6. ~~§4.5 (the documented examples)~~ — done. Two committed guards, both
   burned down to zero: 84 false claims about the API, and 22 fences that were
   neither TypeScript nor Svelte. Read the "what it does not cover" paragraph
   before assuming a documented example is checked — markup is not.
7. ~~**§4.8**~~ — done. T7 found three live defects in unpublished chat code;
   T10 reached zero and the compile arm is now unconditional; T11, T12 and T13
   closed. **Nothing in §4 is open except the release.**

Also fixed on the way, and worth knowing before trusting a green CI run: the
workflow ran `pnpm -r test`, which defaults to four workspaces at once while
seven of the eight drive a real browser. The gate was flaky by construction and
`guides/VERIFICATION-PROTOCOL.md` said so while CI did the opposite. Both now
pass `--workspace-concurrency=1`.

Do **not** start another general review round of `graphics`. Rounds four
through six found 19, ~29 and ~34; the count is not converging, and the majority
of what they now find is in text rather than code. Review should be triggered by
a change, and the highest-value verification available is the one this session
demonstrated: make the documented example a compiled file.
