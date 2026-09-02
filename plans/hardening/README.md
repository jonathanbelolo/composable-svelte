# Hardening — defect register

**An index of what is still open.** It used to be 2,088 lines, and about
two-thirds of that was narrative: round-by-round write-ups, and a running list of
corrections to its own earlier claims. All of it duplicated commit messages,
nothing linked to it, and it is recoverable from git — so it went. What is left
is the part a reader needs: what is open, and where the things code points at
live.

Its own history is the argument for the reduction. In the last full round, 56%
of findings were in *text* — prose, this register, commit messages — against 12%
in original code, and this file recorded **eight** wrong counts before its
numbers stopped being kept by hand. Two of those hand-maintained lists are now
guards instead (see *Retired into guards* below).

**Verification protocol:** `guides/VERIFICATION-PROTOCOL.md`. It used to be
buried at line 1449 of this file.

## Status at a glance

| | count |
|---|---|
| Fixed and committed | 68 commits through R7, plus the dead-behaviour campaign since `2443ab4` (`git rev-list --count 2443ab4..HEAD`) |
| **Open — components that crash** | **0** (was 6 — all fixed, see R1) |
| **Open — breaks a consumer at install/build** | **0** — was recorded as 6, which was never right: S2.6 closed in R6, S2.7 and S2.8 were already closed, and the row's own parenthetical said the count was stale while leaving it stale |
| **Open — silently-wrong behaviour** | **0**. All ten S4 items are closed; the last remainder — `syncBrowserHistory` requiring a `serialize` it never calls — is fixed. The row read 6 long after that stopped being true |
| Open — security | 0 (was 1; **the R2 fix was incomplete — see R3**) |
| Open — `svelte-check` errors | **0** (was 142, recounted to 69 in R6) |
| Open — `svelte-check` warnings | **0** (was 30) |
| Workspaces covered by `pnpm -r check` | **19 of 19** — the gate is complete |
| **Open — dead behaviour** | **0**. T1–T13 all closed; T12 is measured and registered rather than swept — see below |
| Workspaces that typecheck their tests | **14 of 14 that have tests** (S11 T1) |
| Optional props a wrapper can forward | **619 of 632** — the 13 left are `$bindable`, registered (S11 T8) |
| Animation-policy backlog | **none** — emptied and deleted (S11 T2–T4) |
| `examples/` animation violations | **0** — gated and cleared; was 78 across 33, not the 24 recorded (S11 T5) |
| Committed build artifacts under the gate | `ssr-server/static` — was serving 6 deleted transitions |

## S11 — the dead-behaviour campaign

The rule this section is measured against: **nothing a consumer can pass,
configure, click, or import may produce no effect.** `core`, `media` and `chat`
have been through it; `chat` shipped 0.3.0 after four review rounds. Everything
below is measured, not estimated — the commands that produced each count are
named so the next person can re-run them rather than trust them.

T1–T13 are done. What follows is what each turned out to be, kept because code
and later sessions cite these by name.

### T7. `ed855dd` reviewed — CLOSED

Flagged as unreviewed on the prior that every round in this campaign found
defects in the previous round's repairs. It held three, all in arms that commit
changed, and two of them were *the same defect it claimed to have fixed*, left in
place on other paths:

- The "announce presence on connect" arm it added could never fire: it read
  presence out of `state.users`, which inbound frames alone populate, so you are
  not in your own user map until the server echoes you. The same assumption made
  `updatePresence` a no-op for that whole window — the loss the arm existed to
  prevent. Its test passed by dispatching a synthetic `userJoined` before
  connecting, an ordering the library cannot produce.
- `stopGeneration` did nothing while an attachment was uploading, leaving the
  bar frozen at `uploading`.
- Upload progress was discarded on the edit and regenerate paths.

All unpublished when found — chat 0.3.0's changelog predates the commit by a day
and npm was on 0.2.3 — so all free to fix. It also changed six public action arms
with no changelog entry; they are recorded now.

### T10. Documented Svelte examples — CLOSED

**53 → 0 across every document**, and the `SWEPT_DOCS` throttle is gone: the
compile arm is unconditional.

Nineteen of the 53 went guard-side without touching a document. The guard was
reporting excerpts for eliding a store declaration the prose supplies, a
counter-example for failing on purpose, and a CHANGELOG for being a CHANGELOG —
the two sibling guards already excluded those.

The rest were ellipsis written inside code (`createStore({...})` is a syntax
error however clearly it reads), Good/Bad pairs sharing one fence, and three
blocks that were not Svelte at all: two React examples, and a catalogue of tag
names.

**A hole in the earlier fence sweep surfaced here.** Eight mixed listings were
hiding *inside* ```svelte fences, holding 501 lines of TypeScript no guard read —
`ALLOWED_MISLABELLED` only inspects fences labelled something other than svelte,
so it structurally could not see them. A mirror arm now does.

**What the compile arm still does not catch:** a missing required prop. `<Camera
position={…} />` with no `{store}` is valid Svelte, and only `svelte-check`
against a real generated component would object.

### T12. Optional properties in `.ts` — MEASURED, registered

**311**, produced by `optional-props.test.ts`'s own splitter. It had been
recorded as 472, then 436, then 427, by three greps — and a grep cannot tell
`() => void | undefined` (a function *returning* it) from `(() => void) |
undefined` (a property accepting it).

The props-shaped slice is closed: every finding that sat in a `*Props` type was
`FileUploadProps`, fixed with T11.

Reported rather than swept. Most of the rest are state and config shapes, so T8's
wrapper defect does not apply, and a careless `| undefined` sweep across 383
declarations would be worse than the hazard. `ALLOWED_BARE_OPTIONALS` stops the
number growing while that is decided.

**Scope, because a count without one is how this item collected three:**
discriminated unions written as `export type Action =` followed by `| { … }` open
with a pipe rather than a brace and are not scanned. In a library of reducers
that is a large family; covering them would raise 311, not lower it.

### Accessibility — CLOSED as a warning backlog, open as a question

This section listed 19 warnings — chat 13, media 5, charts 1. **All of them are
gone**: `svelte-check --fail-on-warnings` reports 0 warnings in every one of the
19 workspaces, and that flag is what gates CI.

Stated precisely, because "0 warnings" and "accessible" are not the same claim:
**11 of them are `svelte-ignore` suppressions rather than fixes.** Seven carry a
written justification beside them; the four that did not were in `Carousel` and
`Chart`, and on reading, `Carousel`'s explanation was there all along — a
detector I wrote to find unexplained ones produced a false negative on a
multi-line comment. `Chart`'s two are now explained: the surface is focusable
because it carries the keyboard cursor, and `role="application"` is not an
interactive role by the linter's reckoning.

So the honest position for a release: no reported warnings, every suppression
justified in place, `charts` has a keyboard cursor and a data-table fallback and
an AA review — and no independent WCAG 2.1 AA audit of the other packages has
been done. That last part is a gap, not a defect.

### Satellite components ignore the theme — CLOSED

**438 hardcoded colour declarations across 37 component files** in `chat`,
`media`, `code`, `maps` and `charts`, against **zero** references to any of
core's 39 theme tokens. So a consumer who overrides `--primary` restyles every
`core` component and not one satellite component.

It is worse than absence in `chat`, which hooks `:global(.dark)` — core's own
dark-mode class — and then hardcodes its own palette (`#1a1a1a`, `#333`). It
looks theme-aware and is not: change `--background` and it stays `#1a1a1a`.

**The constraint was real; the response was not the only option.** Satellites
cannot use Tailwind utilities, because the preset's `contentGlob` covers core's
dist only, so their classes are purged in every consumer app. But scoped CSS can
read tokens: `hsl(var(--background, 0 0% 100%))` costs the same keystrokes as
`#1a1a1a`, themes when core's stylesheet is present, and falls back when it is
not. Verified to work under Tailwind — the styleguide has preflight on and
renders satellite scoped CSS correctly today.

`@composable-svelte/auth` is built this way and is the reference — and it is now
measured rather than argued. `LoginForm` and `PasswordInput` write every colour
as `hsl(var(--token, fallback))` and contain no dark-mode CSS at all; adding
`.dark` to `<html>` in the built styleguide inverts all of them:

| | light | dark |
|---|---|---|
| card background | `rgb(255,255,255)` | `rgb(2,8,23)` |
| input text | `rgb(2,8,23)` | `rgb(248,250,252)` |
| submit background | `rgb(15,23,42)` | `rgb(248,250,252)` |

That is the whole difference from the five below, which would each need a
`:global(.dark)` block of their own — and `chat` has one, hardcoded, which is
how it manages to look theme-aware without being it.

The sweep across the other five is agreed, sized above, and wants its own
before/after in the styleguide plus a guard — no hardcoded colours in
`packages/*/src` — on the model of `animation-policy.test.ts`.

**Fixed, and the count here was low.** Measured at the sweep: **653**
declarations across **38** files, not 438 across 37 — the ninth wrong count this
register has held. All of them now read `hsl(var(--token, <the colour it was>))`,
so an app that never imports core's stylesheet is unchanged and one that does
follows the theme. Satellite token references went from ~9 to 320.

`chat`'s fake dark mode is gone: **68 `:global(.dark)` rules**, containing zero
non-colour declarations, deleted. Core redefines every token under `.dark`, so
the light rules now handle dark mode by themselves — which is what "theme-aware"
was supposed to mean.

Three things a value-based sweep got wrong, all caught by rendering rather than
by tests:

- **A colour's role depends on context.** `#e0e0e0` is a border in light mode
  and a text colour in dark. 51 substitutions were re-pointed by role.
- **`background: white` is invisible to a regex looking for `#`.** 66 bare
  colour keywords were missed on the first pass. In dark mode a white button
  kept its white background while the inherited text turned near-white — a
  contrast of 1.05 on four controls, found by computing contrast in the browser.
- **Text on a themed surface needs that surface's own foreground token.** 18
  pairs took `--primary-foreground` rather than `--background`, because
  `--primary` inverts in dark mode.

146 literals remain, and the residue is principled: neutral scrims
(`rgba(0,0,0,α)`), Prism and CodeMirror syntax palettes, and 33 colours in
categories core has no token for — success green, info blue, decorative
gradients, and error *tints*, which cannot use the fallback pattern because a
tint's fallback would render at 10% alpha rather than as the original solid.

Guarded by `packages/core/tests/repo/satellite-theming.test.ts`, which carries
the residue as a named list with reasons — so a *new* hardcoded `#3b82f6` fails
while these keep passing — plus a floor on token references and a positive
control.

### Library components hardcode a heading level — CLOSED

`core`'s `BannerTitle` renders `<h5>`. Put a `Banner` under an `<h2>`, which the
styleguide does, and the page outline jumps `2 -> 5`. That is not the demo's
doing and no demo can fix it: the level belongs to the page, and the component
picks it without being told.

Nine components across three packages do this:

| package | component | tag |
|---|---|---|
| core | `BannerTitle` | `h5` |
| core | `CardTitle` | `h3` |
| core | `ToastTitle` | `h3` |
| core | `Empty` | `h3` |
| core | `FileUpload` | `h3` |
| chat | `AttachmentPreviewModal` | `h2` |
| chat | `FileAttachment` | `h3` |
| chat | `PresenceList` | `h3` |
| media | `ConversationModePanel` | `h3` |

`@composable-svelte/auth`'s `LoginForm` is the pattern for the fix — a
`headingLevel` prop, defaulting to the level that suits an embedded component,
with the caller free to say otherwise.

**It is not free.** Changing a rendered tag is breaking for anyone whose CSS
selects by element rather than by class. That is not hypothetical: the sweep
recorded below broke exactly that way in two demos, and only
`svelte-check --fail-on-warnings` caught it.

**Fixed.** All nine take a `headingLevel` prop defaulting to the level they have
always rendered, so nothing changes for a caller who does not pass one, and
render through `<svelte:element>`. `FileUpload`'s prop lives in its sibling
`file-upload.types.ts`; `ConversationModePanel` destructures with `const`, not
`let`. `pnpm -r check --fail-on-warnings` was the gate, as this entry predicted:
it caught a first attempt that put the default after a rest element and, in two
files, rewrote the `<h3>` inside the doc comment instead of the markup.

### Controls with no accessible name in the styleguide — CLOSED

A browser pass over all 60 demo routes found 24 controls with no accessible
name, on 7 routes. They are **not one defect** and the number should not be
quoted as if they were:

- **Icon-only buttons** (`button-group` 6, `scatter-chart` 2, `line-chart` 2,
  `node-canvas` 1, `streaming-chat` 1) — genuinely nameless. A demo fix.
- **`combobox` (8)** — `core`'s `Combobox` renders `<input role="combobox">` and
  the demo passes no label. Whether the component should require one or the demo
  should supply one is the actual question, and it is unanswered.
- **`separator` (4)** — inputs labelled only by `placeholder`. That *is* an
  accessible name by the spec's last resort, so this is a weak finding: poor
  practice, not a missing name. Counted here because the detector cannot tell
  the difference, and pretending it can is how 24 becomes a headline.

**Fixed, and one of the three groups was a component defect rather than a demo
one.** `Combobox` rendered `role="combobox"` and spread no rest props onto its
input, so a consumer had **no way to name it at all** — those 8 were not the
demo's to fix. It now takes `ariaLabel`, defaulting to `placeholder`, which is
what a sighted user reads and means the control is never nameless.

The other 16 were demo fixes: six icon-only buttons in `button-group`, four
chart zoom controls, and a node input with only a placeholder. Icons are marked
`aria-hidden` so the name is not announced twice.

Measured after the fix by walking 12 routes in a real browser and computing the
accessible name for every control: **0 remaining**. One apparent violation was a
false positive — a `display:none` file input, which is not in the accessibility
tree at all.

### Styleguide heading outlines — CLOSED

Every one of the 60 demo routes had a broken heading outline; none were clean.
Two causes, not sixty: `layout/Header.svelte` marked the site name `<h1>` inside
a `<button>`, competing with the page title on every page; and the contract
between the chrome and a demo was never written down, so 51 demos opened one
level too deep. 59 demos and the chrome were corrected and
`packages/core/tests/repo/demo-headings.test.ts` now holds the contract.

Worth remembering how the sweep went wrong, twice:

- Two demos style headings with scoped **element** selectors rather than
  Tailwind classes, so retagging silently unstyled them. `--fail-on-warnings`
  caught it as an unused-selector warning.
- `CodeEditorDemo` holds a sample HTML document in a template literal, and the
  sweep rewrote the `<h1>` *inside the sample* — content, not markup. Only the
  runtime audit caught that. The guard reads the markup with `<script>` and
  `<style>` stripped for exactly this reason.

### A field error keyed by `path[0]` — OPEN, and a design limit rather than a bug

`form.reducer.ts` routes a Zod issue to a field with `issue.path[0]`, so a
nested object's error collapses onto its top-level key: an issue at
`['address','zip']` lands on `address`. Both the submit path and the per-field
path do this.

It is not obviously wrong — `FormState.fields` is keyed by top-level name, so
there is nowhere else for it to go — but it means a form over a nested schema
cannot show the error beside the input that caused it, and the message it does
show may name a field the user cannot see. Fixing it properly means keying
`fields` by path, which changes the state shape and every consumer's reads.

Found while fixing the cross-field defects above; deliberately left, because it
is a different change with a different blast radius.

## S8. Documentation — OPEN

Several of these were closed by the documentation sweep; the rest stand.

- ~~**`code`'s README** names factories that do not exist~~ — **stale, and
  dangerously so.** `2bfd769` renamed the exports to match the documentation
  rather than the other way round, so `createInitialCodeHighlightState` and
  `createInitialCodeEditorState` are the real names now. Acting on this entry
  would have broken working docs.
- ~~**JSDoc pointing at the wrong package**~~ — closed, and it was wider than
  recorded. `video-embed` had already been fixed, `audio-player` and
  `voice-input` had not, and **`chat`'s `streaming-chat` barrel had the same
  defect and was never listed** — it told consumers to import
  `FullStreamingChat` and `streamingChatReducer` from `@composable-svelte/code`.
  Now guarded by an arm in `side-effects.test.ts`: a package may not source its
  own exports from a sibling. This one ships, unlike a markdown error — the
  comment is copied verbatim into `dist/*.js` and `dist/*.d.ts`.
- ~~`charts` skill tells users to `npm install @observablehq/plot`~~ — **fixed.**
  It is in `dependencies`, so the line told a reader to install something they
  already had, and put a wrong step first in a troubleshooting list.
- ~~`maps` exports the component as `MapPopup`; `API.md` uses bare `Popup`~~ —
  **stale; the document is correct.** `Popup` *is* exported, as a type
  (`src/lib/index.ts:23`), and `API.md` uses it as one — `popups: Popup[]`,
  `interface Popup`, `popup: Popup`. Where it means the component it writes
  `<MapPopup>` (lines 335, 355, 365). Both names are used correctly, and acting
  on this entry would have broken working documentation — the same failure the
  `code` README entry above records.

The API-name errors this section used to list — `createTestStore`'s import path,
`createLiveAPI`, `matchPattern`, `createParserConfig`, `createMockStorage` — are
closed and now guarded: `doc-typecheck.test.ts` typechecks documented examples
against the built `.d.ts`, and its register is empty.

**Know what that covers before trusting it.** It reads only blocks that *name*
`@composable-svelte`, because a block without an import cannot be resolved
against anything. Measured: **277 of 1,435** ```typescript fences and **97 of
325** ```svelte fences. So a majority of documented TypeScript — excerpts that
use a library API without an import line — is read by nothing, and an excerpt is
exactly the shape that elides imports.

Two things found after that limit was written show it is not theoretical. Svelte
*markup* is outside the checker entirely, which is how `<FullAudioPlayer
{playerStore} />` passed a prop the component does not have. And a rune is
invisible to both guards — `$props<Props>()` appeared in eight examples and in
none of `src`, because `svelte-check` rejects it in a real component and only
documentation could keep it.

## Packaging, measured as a consumer — CLOSED

**The packages have now been installed the way a user installs them**, which had
never been done. `pnpm verify:package` (`scripts/verify-package.mjs`) packs all
eight, installs them **together** outside the workspace, and resolves every
declared entry point. Nothing contacts a registry.

Result, first run: **53 entry points, 0 broken.** 26 import in plain Node, 26
resolve but need a Svelte loader (Node has none — resolution is the check that
matters), 1 needs the optional `mapbox-gl` peer, and 3 deep paths are correctly
refused with `ERR_PACKAGE_PATH_NOT_EXPORTED`. Mutation-verified by declaring a
subpath that points at nothing.

Two further measurements taken against the tarballs:

- **A consumer typechecks clean under `nodenext`** with `strict`,
  `exactOptionalPropertyTypes` and — the part that matters —
  `skipLibCheck: false`, so the shipped `.d.ts` files were themselves checked.
- **Tree-shaking works, and here are the numbers** `side-effects.test.ts` says
  were only ever taken once by hand. Built from the tarballs through Vite:
  `createStore` alone is **29,305 bytes**; `createStore` plus `Effect` is
  **29,308**, because `Effect` is already in that graph; the whole core barrel is
  **506,010**, seventeen times larger. One auth flow is 111,139 against 324,709
  for the auth barrel.

**The Tailwind trap is real and the documented fix works.** Rendering core's
`Button` from a tarball with only `styles/globals.css` imported gives the
browser's default button — `rgb(239,239,239)`, `padding: 1px 6px`, no radius —
because the utility classes have no CSS behind them. Wiring Tailwind v4 exactly
as `CLAUDE.md` prescribes (`@import 'tailwindcss'` then
`@import '@composable-svelte/core/styles/tailwind.css'`) produces the intended
control: `--primary` background, 8×16 padding, 6px radius, 17:1 contrast, and
opaque rather than the see-through body that entry records. Components with
scoped CSS — `auth`'s and `media`'s — render correctly either way.

## Product gaps, not defects

- **WebGPU is not implemented.** `BabylonAdapter` accepts an `engine: 'webgpu'`
  option and runs WebGL. Real WebGPU is `WebGPUEngine` with its own async
  initialisation — a feature nobody built. Recorded here because
  `adapters/babylon-adapter.ts:90` points at this file for it.
- **`maps` is mid-phase** — its README says Phase 12C in progress.
- **Core's two validation paths disagree about which error to show.** For a
  field with more than one failing rule, per-field validation reports the
  *first* Zod issue (`form.reducer.ts:230`, `issues.find(...)`) while whole-form
  validation reports the *last* (`form.reducer.ts:349`, an assignment inside a
  loop). So `"   "` in an email field says "Email is required" while typing and
  "Enter a valid email address" on submit. Neither is wrong, but a field should
  not change its mind. Found while adding `emailField()`;
  `packages/auth/tests/magic-link-flow.test.ts` pins the current whole-form
  message so a fix has to come past it deliberately.
- **`component-coverage.test.ts:33` hardcodes its package list** where its
  siblings derive one. `export-surface.test.ts` and `doc-typecheck.ts` both use
  `listDirs`; that guard carries
  `const PACKAGES = ['core','chat','media','maps','charts','code','graphics','auth']`,
  so a ninth package's components would be silently unscanned. Same family as
  the gap `front-door.test.ts` was written to close — a register that rots in
  the disk-to-register direction — found while reviewing that guard.
- **19 dead links in `packages/core/docs/` and the example READMEs.** Measured
  and registered in `packages/core/tests/repo/front-door.test.ts`'s `DEAD_LINKS`,
  which fails on any *new* one and deletes an entry the moment its link resolves
  again. Most point at files that were never written — there is no root
  `LICENSE` or `CONTRIBUTING.md`, and no `docs/testing/unit-testing.md` — so
  closing them means authoring content in core's documentation tree, not editing
  links. Three worse ones *were* fixed in the same change: two dead links in the
  root README's own further-reading section, and three markdown links in
  `packages/core/docs/backend/dependencies.md` that were hardcoded absolute
  paths into one developer's home directory, shipped in a published package.
- **A pasted email address was refused rather than cleaned — CLOSED, in core,
  and the entry overstated the user impact.** Four fields, not the five recorded
  here first: email-verification's resend has no form and no schema. And
  **through the shipped components it was not reachable at all** — every one
  renders `<input type="email">`, whose HTML value-sanitization algorithm strips
  surrounding whitespace before any handler runs. Measured in a browser. The
  reachable cases are a `type="text"` input, a prefilled or URL-sourced value,
  and the headless reducers, which have no input element in front of them. Fixed one layer below where it was reported. Core's
  form reducer discarded the validated result, so a schema's `.trim()` decided
  only whether all-whitespace was rejected and every reducer had to trim again
  before sending — a two-step rule whose second step failed *silently*, and
  which the existing flows already disagreed about. The reducer now writes the
  schema's output back into `state.data` at **submit-time** validation only;
  doing it per-field would rewrite a keystroke mid-word. The two MFA reducers
  dropped their duplicated trims as a result.
- **`parseDestination` strips a leading slash when there is no `basePath`, and
  patterns written the obvious way then silently never match.** `basePath`
  defaults to `'/'` and the relative path is `path.slice(basePath.length)`, so
  `'/add'` reaches a parser as `'add'` while `'/shop/add'` under `basePath:
  '/shop'` reaches it as `'/add'`. A pattern is written `'/add'` in both cases,
  so one of them matches nothing at all — no error, no warning, just a route
  that never fires.

  Found while building `createParserConfig`, and it is not theoretical:
  `examples/ssr-server/src/shared/routing.ts` had worked around it by writing
  its patterns *without* leading slashes and leaving a comment explaining why.

  `createParserConfig` normalises the path it receives, so the new API is not
  born with the trap, and that example is now written the ordinary way.
  **`parseDestination` itself is unchanged**, because fixing it is breaking for
  anyone who has already worked around it — exactly as that example had. Open,
  and worth a decision rather than a quiet fix.

- **`Clock.live` / `Storage.live` are not being built, and here is why — in
  order of weight, because the weakest reason is the one a future reader will
  knock down first.**

  The weak one: `Clock` and `Storage` are type-only exports, so `.live` needs a
  runtime value of the same name. That is only an inconvenience — nothing stops
  `export const Clock = { live: createSystemClock() }` sitting beside
  `export type Clock`.

  The load-bearing ones. **`Storage.live` cannot be a value.**
  `createLocalStorage<T>()` is generic and takes `StorageConfig<T>` — `prefix`,
  `validator`, `debug` — and a bare `.live` discards all four facts. That is
  exactly what the pre-narrowing document did, and it is why the API read
  plausibly while being unimplementable. And **`createLocalStorage()` throws on
  a server** (`EnvironmentNotSupportedError`), so a `Storage.live` evaluated at
  module scope breaks SSR — which is not hypothetical: `packages/auth`'s README
  calls its dependency factories at module scope, and
  `flows/oauth-pending.ts` carries a try/catch for precisely this.

  The convention `create<Impl><Thing>()` is now 8 for 8 across the dependencies
  barrel with `createMockStorage` added.

  The last live claim, `packages/core/docs/troubleshooting.md`, is fixed — it
  sat inside a `// ✅ GOOD` block, i.e. presented as the correct form in the fix
  half of a broken/fixed pair. Two other things in the same six lines were also
  not the API (`new ApiClient()`, when it is `createAPIClient({...})`). The
  fence now carries an import line, so the next such error fails the build
  rather than sitting there.

- **Core ships `createMockStorage`. This entry was closed twice as a position,
  and the position was wrong.** It was first recorded as a gap, then closed as
  deliberate on the strength of a doc comment that had "already ruled on it",
  with the reason given as: adding one "would contradict a stated position for
  no caller".

  There were two callers in the tree at the time of writing, and neither was
  looked for. `packages/core/tests/dependencies/local-storage.test.ts` opened by
  hand-rolling an in-memory `Storage` and used it 48 times — its own comment
  said "since JSDOM storage is limited" — and
  `packages/auth/src/lib/flows/oauth-pending.ts` wrote a narrow substitute whose
  docstring named this exact absence as the reason it existed. The commit that
  first narrowed the docs even said so: "core's own tests hand-roll an in-memory
  double because there is none".

  A third reason surfaced only on building it: **`SyncStorage.subscribe` was
  testable by nothing.** No real cross-tab event can be produced in a test, and
  `createNoopStorage` has no listeners, so the cross-tab contract shipped
  unexercised. `createMockStorage` has `simulateSetItem` for exactly that, and
  deliberately does *not* fire `subscribe` from its own `setItem` — matching the
  browser, which never delivers a `storage` event to the tab that caused it.
  Copying the Phase 8 spec here would have been wrong: it notified from inside
  `setItem`, modelling a contract the real thing does not have.

  `local-storage.test.ts` now imports the shipped one at all 48 sites, which is
  the evidence it is a genuine drop-in for what a caller wrote unaided.
  `createMemoryPendingOAuthStorage` stays, for a reason the old entry got right:
  the nonce is single-use, and `{ put, take }` makes reading it twice
  impossible in a way a general `Storage` cannot.

  **The lesson worth keeping is about the method, not the API.** "No caller"
  was asserted rather than measured, and one `grep` would have refuted it.
- **R1 — six components crashed on mount.** All fixed, mutation-verified. Cited
  by `packages/graphics/tests/camera-config.test.ts:16`.
- **S2 — breaks a consumer at install or build.** All eight closed. **S2.4** was
  `chat` statically importing its own optional peer; cited by
  `packages/maps/tests/optional-peer-isolation.test.ts:11` as the archetype of
  the category.
- **S4.10 — `AuthGuard.onAnonymous` re-fires on every dispatch.** Not a defect;
  the claim was corrected. Cited by
  `packages/auth/tests/auth-guard-anonymous.test.ts:4`.
- **T11 — `FileUploadProps` did not match its component.** Closed: the component
  now annotates the exported type, and an arm in `optional-props.test.ts`
  requires every exported `*Props` type to be used somewhere that would break if
  it drifted.
- **T13 — five packages published their whole build tree.** Closed: `charts`,
  `chat`, `code`, `maps` and `media` each name their entry points, verified
  against Node's resolver.

## Retired into guards

Two hand-maintained lists in this file kept drifting, and both are now executable:

- **The intentionally-unused public members** — `packages/core/tests/repo/
  intentionally-unused.test.ts`. Recorded here as eight, corrected to ten, and
  actually **eleven**. It now fails if one is deleted, and fails if one gains a
  caller so the entry can be removed rather than the member.
- **The documented-example backlogs** — `doc-typecheck.test.ts` (API claims,
  register empty) and `doc-examples.test.ts` (fence labels, `ALLOWED_MISLABELLED`
  at 0).
