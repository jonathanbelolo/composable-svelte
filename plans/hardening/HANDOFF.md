# Handoff — state of the library, and what to do next

Written 28 August 2026, at `86b2da4`, working tree clean, full gate green.

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

### 4.2 The round-six code defects (all still open)

A three-reviewer hostile review of round five found ~34 defects. **None of the
code findings has been fixed** — this session went to the front doors instead.

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

### 4.3 The guard that deletes itself

`packages/core/tests/repo/doc-examples.test.ts`:

- **`docs()` at line 93 uses the throwing `statSync(full)`** while
  `docExamples()` was given `throwIfNoEntry: false`. One dangling `.md` symlink
  makes the file fail to **collect** — all 18 tests cease to exist, and no
  vacuity arm can fire because none load. The commit message claiming "both use
  `statSync` now" is false.
- **`docs()` at line 82 uses `entry.isDirectory()`**, which is false for a
  symlinked directory; it then fails the `.md` check and vanishes silently. Same
  class as the "third bare `continue`" that commit made its headline.
- `export-surface.test.ts`: a *registered* package that drops `exports` entirely
  — worse than the wildcard it is registered for — is exempt from
  `exportProblems()` and caught only by the staleness arm, which reports the
  opposite.

### 4.4 The harness

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

### 4.5 Documentation beyond the front doors

A prototype (not committed) extracted every ```ts/```typescript block in live
docs that imports `@composable-svelte/*` — **314 blocks** — and typechecked them
against the built `.d.ts` files with the TypeScript compiler API.

- 266 have semantic errors, but almost all are excerpt noise
  (`Cannot find name 'store'`), so a blanket typecheck guard is **not**
  adoptable.
- Narrowing to diagnostics that are *claims about the library's own surface*
  (`TS2305`, `TS2724`, `TS2749`, `TS2551`, `TS2339`, `TS2554`, `TS2345`,
  `TS2739`/`2740`/`2741`) gives **94 errors across 64 blocks**, and those are
  real: `AudioManager.load` / `.play`, `VoiceInputState.isRecording`,
  `RateLimiter.isRateLimited`, `'@composable-svelte/core/navigation-components'`
  has no exported member `Button`, and a long tail of wrong argument counts.
- Distribution: `.claude/skills/*` ~40, `packages/core/docs/*` ~25, package
  READMEs 6.

**Important limitation discovered the hard way:** this guard would **not** have
caught `code`'s broken quickstart, because that block is fenced ```svelte — and
nothing typechecks Svelte blocks. The existing arm compiles them for *syntax*
only, in the two documents named in `SWEPT_DOCS`. The working mechanism for
consumer examples is the `tests/doc-examples/` pattern, now proven on three.

### 4.6 The graphics README — untouched this session

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
2. **Fix §4.2** — the graphics defects round five introduced, especially the
   permanently-inert canvas, in narrow one-theme commits.
3. **Fix §4.3** — the doc guard that deletes itself on a dangling symlink.
4. **Execute §4.7** — reduce the register, correct the S2 row and the "ten".
5. **Then** §4.4 (harness), §4.6 (graphics README), §4.5 (the 94 doc errors).

Do **not** start another general review round of `graphics`. Rounds four
through six found 19, ~29 and ~34; the count is not converging, and the majority
of what they now find is in text rather than code. Review should be triggered by
a change, and the highest-value verification available is the one this session
demonstrated: make the documented example a compiled file.
