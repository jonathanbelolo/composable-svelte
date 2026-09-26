# Scored project materialization and gate launch

This design prepares the six sealed runs without launching an authoring model. The
materializer consumes only frozen external inputs: exact core and architecture
archives, a public root, a sealed acceptance root, a control root, and a new output
root. It creates `a-1` through `a-3` and `b-1` through `b-3` as separate physical
projects with separate append-only evidence directories.

## Frozen input layout

- `public/seed/` is the public managed starter/toolchain, without `node_modules` or a
  lock. The public root also contains the four exact `SCENARIO-*-{INITIAL,WITHHELD}.md`
  prompts. It contains no reference app or sealed assertion.
- `sealed/SCORING-GATE-MAP.json` and its harness are invisible to the agent. The map
  remains `ready:false` until every reference coupling below is removed.
- `control/boundary-verdict.json` binds the exact GPT-6 controller boundary.
  `control/qualification/` owns policy, records, date and qualification inputs. The
  boundary verdict is deliberately outside the gate root because the controller
  requires it to be disjoint from gates.

The local tarballs are used once to generate an npm lock. The raw file-spec package
and lock hashes are retained. Only the root package and `packages[""]` dependency
specs are normalized to exact `0.13.0-next.1`; `node_modules` lock entries retain
their local `.tgz` resolution and integrity. This satisfies the checker's registry-
shape rule without downloading or substituting framework bytes. Every scored copy
then runs `npm ci --ignore-scripts`, verifies physical nonsymlink package roots and
records the installed integrity. The per-project `.qualification-inputs/` directory
must be passed as an extra immutable controller pin.

The authoring project is never used as the gate workspace. `fresh-gpt6.py` binds the
withheld change to the exact whole-project hash emitted by the initial authoring
phase, so build outputs or Vite caches there would invalidate the phase boundary.
`prepare-scored-execution.py` makes a physical, non-hardlinked, mode-preserving copy
of that same submission, proves equality before warming, runs only reviewed warm
commands, permits writes only under their declared output/cache roots, and freezes a
distinct post-warm execution hash while proving the original remained unchanged.

`run-scored-gates.py` reads commands only from the sealed map, uses argv arrays rather
than a shell, permits Node/npm/npx/the installed checker only, requires semantic log
or JSON result contracts, hashes the complete submission and execution trees before
and after, and refuses incomplete maps, reference assumptions, overwrites or
model/worker executables. Timeouts and command/validation errors still produce a
receipt and preserve collected logs and drift. It requires shared frozen adapter and
browser-contract validators plus an externally owned adapter manifest bound to both
the original submitted hash and the post-warm execution hash, scenario and phase. The manifest pins a
reviewed adapter module and review receipt plus explicit browser mount boundary, SSR
entry/input/output mapping, declared motion targets/states/recipes, causal controls
and observation scope. A separately hashed, reviewed JSON-only browser contract maps
source-anchored semantic UI descriptors without executable callbacks or candidate
hooks. `sourceArtifacts` contains only byte-identical submitted source; generated SSR
or mount artifacts are bound by the full execution hash and their explicit adapter
entries. Missing, unsupported or unreviewed adaptation is inconclusive,
never a pass. The adapter is frozen after read-only source inspection, before gate
execution, never modifies the candidate and is never supplied to the agent. Agent
process completion remains separate from gate success.

## Phase mapping to freeze

Both phases require strict Svelte/TypeScript, deterministic reducer/effect tests,
production build, SSR isolation, browser functional acceptance, motion/reduced-
motion/teardown acceptance, installed checker qualification and independent manual
source compliance. The change phase reruns the initial regression surface plus its
withheld cases.

| Scenario | Initial sealed browser surface | Change-only addition |
| --- | --- | --- |
| A | route/deep link/history; A→B stale detail; editor dismissal/save/focus; fixed panel/detail and status motion; reduced motion; unmount | rapid keyboard A→B, compact panel-before-detail order, revised immediate status semantics, old response rejection |
| B | route/history; stable-ID reorder; stale search; dirty/save editor; fixed list/detail and indicator motion; reduced motion; unmount | flagged-only filter plus reorder during pending search, query replacement, accepted-response survivor order, obsolete success/failure ignored |

The architecture command is the installed bin in `qualification` mode with the
external policy path/SHA, exact core version, records root and frozen date. A passing
analysis-only command cannot occupy this gate.

## Reference couplings that block `ready:true`

1. Both lifecycle fixtures import `../reference-{a,b}/src/App.svelte`; the reviewed
   per-submission adapter must instead discover the generated public Vite entry and
   mount/component/style boundary without assuming a source filename. It stays sealed
   and may use only public Svelte mount/unmount and the candidate's reachable entry.
2. The SSR scripts require a custom built `renderApp` export and reference-specific
   strings. Freeze a public SSR entry contract in the seed or drive the generated
   app through an external Vite SSR wrapper; do not require an undocumented filename.
3. Motion tests assert reference recipe opacity endpoints (`0.72`, `0.74`, `0.8`,
   `0.85`, `0.88`). Scored gates must assert each agent's declared recipe endpoints
   and observable relative/intermediate behavior from a sealed declaration, rather
   than the reference's numeric choices.
4. Current configs use reference roots, fixed ports and partial test globs. Create one
   sealed per-scenario config with a strict unique port, `reuseExistingServer:false`,
   initial and change globs, and no imports from qualification reference directories.
5. Several B follow-up/review assertions encode repaired reference copy and exact
   button phrasing. Keep business-required roles/names/statuses; remove copy and
   layout assumptions absent from the public prompt.
6. The generic harness config selects only Scenario A and expects an externally
   started server. The final map must own server startup/teardown and include B.

These are harness architecture decisions, not framework gaps. A separate independent
review is warranted before `ready:true` because the entry/recipe declaration contract
becomes part of the scored public seed and can accidentally leak a solution or make a
valid alternative implementation untestable.

The repair policy is one diagnostics-driven repair total across the whole run. It may
be used after the initial or change phase, but never once per phase. Initial and change
submissions and failed gate evidence stay immutable; repair authorization is an
external verdict bound to that exact receipt and project hash. No architectural
coaching or prompt amendment is permitted.
