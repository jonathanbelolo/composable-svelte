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

- **3,256 tests passing**, gate green. Breakdown from `pnpm -r test`:
  core 1,932 (browser) + 339 (node), graphics 363, chat 212 + 5, code 81,
  charts 65, auth 54, media 63, maps 36, examples 106.
- **The gate is `build → typecheck → svelte-check → test`** across all
  **19 of 19** workspaces. `svelte-check` genuinely covers all of them; it once
  covered two.
- **Repo-level guards** in `packages/core/tests/repo/`: animation policy, export
  surface, optional props, doc examples, dist freshness, peer ranges, published
  files, side effects, typecheck coverage, check coverage.
- **Export surfaces are good.** Six of eight barrels are explicitly curated;
  five packages have zero orphaned exported types; `auth` is exemplary.
- **11 example apps**, all building, six with their own tests.

## 3. What this session did (4 commits, `7742bb4..86b2da4`)

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
README quotes them verbatim. `EXPECTED_EXAMPLES` in that test now names **five**
files: those two plus the three `graphics` examples added in earlier rounds,
which mirror README blocks but are not quickstarts.

## 4. Open work, in priority order

### 4.1 Cut a release — blocking everything else

Nothing else reaches a user until this happens, and it is **not** a routine
bump. `git log --oneline 2443ab4..HEAD | grep -c '!'` returns **39 breaking
commits** out of 190 — by scope: graphics 20, chat 10, core 4, charts 3, auth 3,
media 2, code 2, maps 1.

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

> **This document is the only record of round six.** `plans/hardening/README.md`
> writes up rounds three, four and five (rounds one and two recorded no totals);
> round six was never written into it, because the register reduction in §4.7 was
> approved before it could be. If this file is lost, those findings are lost.
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

On the weak fixtures: the `empty` guard turned out to be covered by twelve arms
across four files, all from `f44bf81`, so no new test was needed for that half —
verified by deleting the branch. The image fixture was worse than recorded: a
256×0 image is refused by the image path's height check *and* by `validateSize`,
each covering for the other, so **deleting either left it green**. It pins the
refusal *message* now, which is the only thing that branch actually decides.

graphics: 426 → 452 tests.

### 4.5 Documentation beyond the front doors

A prototype (not committed) extracted every ```ts/```typescript block in live
docs that imports `@composable-svelte/*` — **317 blocks** — and typechecked them
against the built `.d.ts` files with the TypeScript compiler API.

- Most have semantic errors, but almost all are excerpt noise
  (`Cannot find name 'store'`), so a blanket typecheck guard is **not**
  adoptable.
- Narrowing to diagnostics that are *claims about the library's own surface*
  (`TS2305`, `TS2724`, `TS2749`, `TS2551`, `TS2339`, `TS2554`, `TS2345`,
  `TS2739`/`2740`/`2741`) gives **78 errors across 54 blocks** — measured at
  `e0dbb4c`, after this session's fixes. They are real: `AudioManager.load` /
  `.play`, `VoiceInputState.isRecording`, `RateLimiter.isRateLimited`,
  `'@composable-svelte/core/navigation-components'` has no exported member
  `Button`, and a long tail of wrong argument counts.
- Concentrated in `.claude/skills/*` and `packages/core/docs/*`. The package
  READMEs are now nearly clean.

**Re-measuring this caught a regression this session introduced.** The figure was
94 across 64 mid-session; re-running it at the end returned 85 across 58, and the
new entries were mine — renaming `code`'s and `media`'s exports broke
`.claude/skills/composable-svelte-code/SKILL.md` and
`composable-svelte-media/SKILL.md`, which still named the old symbols. That is
rule 5 (instance versus class) failing in the session that wrote rule 5 down: the
READMEs were swept and the skill files were not. Both are fixed, along with a
`deleteAudioManager(id)` row left behind in `packages/media/README.md`'s API
table when its two neighbours were corrected. The figure is 78 across 54 now.

**Important limitation discovered the hard way:** this guard would **not** have
caught `code`'s broken quickstart, because that block is fenced ```svelte — and
nothing typechecks Svelte blocks. The existing arm compiles them for *syntax*
only, in the two documents named in `SWEPT_DOCS`. The working mechanism for
consumer examples is the `tests/doc-examples/` pattern — five registered files,
of which the two added this session are quickstarts.

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
recorded: `createOverlay` is **not exported** (`src/lib/index.ts:25`), so the
README documented a call no consumer can make. `SKILL.md` had the right
signature all along, which is how the two came to disagree — and it had acquired
two false claims of its own since, both corrected here.

### 4.7 The register — decision made, not executed

**Approved:** reduce `plans/hardening/README.md` to a **backlog index plus the
verification protocol**.

Evidence for the decision: 2,088 lines, 65% prose, ~570 numeric tokens, 26 edits,
36 explicit self-corrections. In round six, **56% of findings were in text**
(prose 24%, register 21%, commit messages 12%) against **12% in original code**.

- **Keep**: the open items (T7, T10–T13), the charts accessibility gaps, the
  doc-example backlog, and the 20-line verification protocol at line 1449.
- **Move** the protocol to `guides/` and reference it from `CLAUDE.md`, so the
  one valuable part is reachable rather than buried.
- **Delete** the ~370-line round-by-round narrative (`#### Round three/four/five`
  and `#### What the sweep itself recorded`) and the "Corrections made to earlier
  claims" section. Both duplicate immutable commit messages, and nothing links to
  them. Six pointers cite the file, all for backlogs — that role stays.
- **Correct** the status table. Line 14 still reads
  `Open — breaks a consumer at install/build | 6`. It should be **0**: all eight
  S2 items were verified closed by a reviewer who did not gather the evidence.
  It was never right either — 8 items minus the 3 its own parenthetical names
  closed is 5, not 6.

Known errors inside the register, still uncorrected:

- **"ten zero-caller members" (line 1431) is eleven.** `BabylonAdapter.resize`
  (`babylon-adapter.ts:542`) is barrel-exported with no external caller — the
  only other `.resize(` in the package is `this.engine?.resize()` at line 193
  and inside the method body itself. The list has now been 8, then 10, then
  still short, in the entry whose stated purpose is to stop a later pass
  deleting these on a count.
- The paragraph correcting the invented `~40 → ~45 → ~45 → 19` progression
  misstates its own arithmetic (it quotes "three rounds … ~85" and then asserts
  the ~85 covered two).
- The "one-sided fix" heading misquotes `8e88776`: that commit said the
  *consumer value and the driver value* both go through one helper, and it did
  exactly that. The genuine defect was a third, unmentioned reader
  (`DeviceCapabilities`).
- Two mutation counts in the round-five entry disagree with the commits they
  summarise.

### 4.8 Longer-standing register items

- **T13** — five packages (`chat`, `code`, `media`, `maps`, `charts`) publish
  their whole build tree via a wildcard `exports` map. Measured: narrowing is
  **in-repo free for all five** — zero executable deep imports; the only two hits
  are JSDoc for already-declared subpaths. Cost is 42 subpaths carrying 14
  symbols; `maps` needs nothing at all, `code` and `charts` one each. Held by
  `export-surface.test.ts`'s `WILDCARD_EXPORTS_PENDING`. Each narrowing must be
  marked breaking — `f0c89bc` narrowed `graphics` as `fix(repo)` and should have
  carried `!`.
- **T11** — `FileUploadProps` is exported, unconsumed, and drifts from
  `FileUpload.svelte`. Worse than recorded: the component's local `onUpload`
  takes one parameter while the exported type, `FileUploadDependencies` and
  `file-upload.reducer.ts:69` all take two, so **upload progress is untypeable
  through the component's own prop type**. One fix, not a category — the other
  five exported `*Props` are all consumed by their components.
- **T12** — 427 optional properties without `| undefined` (not 472; the old
  figure was grep-shaped and counted optional *parameters*). Only **10 of 427**
  sit in a `*Props` type, and all ten are `FileUploadProps` — so fixing T11
  closes the entire props-shaped slice.
- **T10** — 126 blocks across 32 documents need work (85 mislabelled + 41
  non-compiling). The compile arms currently govern 54 of 1,896 blocks in 2 of
  71 documents. Largest single item is
  `.claude/skills/composable-svelte-charts/SKILL.md`: 19 of its 33 ```typescript
  blocks are Svelte markup — the same shape the graphics SKILL had.
- **T7** — `ed855dd` is unreviewed and **still worth reviewing**: 97.9% of its
  added lines are verbatim at HEAD after 87 commits, and its two chat reducers
  have had **zero** commits since.

### 4.9 Genuine product gaps (not defects)

- **`charts` is not accessible for interactive use**, by its own README: no
  `tabindex` and no key handler anywhere in the package, no data-table fallback,
  no WCAG 2.1 AA audit.
- **`maps` is mid-phase** — its README says Phase 12C in progress.

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
4. **Execute §4.7** — reduce the register, correct the S2 row and the "ten".
5. ~~§4.4 (harness), §4.6 (graphics README)~~ — done; §4.4 turned up a live
   rendering defect. **Then** §4.5 (the 78 doc errors across 54 blocks).

Do **not** start another general review round of `graphics`. Rounds four
through six found 19, ~29 and ~34; the count is not converging, and the majority
of what they now find is in text rather than code. Review should be triggered by
a change, and the highest-value verification available is the one this session
demonstrated: make the documented example a compiled file.
