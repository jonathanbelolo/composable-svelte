# Contributing

## Getting set up

```bash
pnpm install
pnpm -r build      # required first: `dist/` is gitignored and every package
                   # resolves its siblings through the exports map, not `src/`
```

Node 20 or newer, pnpm 9 (the version is pinned in the root `packageManager`
field, so `pnpm/action-setup` and Corepack pick it up on their own).

## The gate

Run these in order. `pnpm test` deliberately passes
`--workspace-concurrency=1`: five of the eight packages drive a real Chromium
through Vitest browser mode, and running workspaces in parallel makes suites
fail on scheduling rather than on code.

```bash
pnpm -r build
pnpm -r typecheck
pnpm -r --workspace-concurrency=1 test
pnpm -r check                     # svelte-check --fail-on-warnings
pnpm --filter @composable-svelte/example-auth-server test:e2e
```

`--fail-on-warnings` is the flag that gates. `--threshold` only filters what is
*printed* and never affects the exit code, which is how a `<button>` nested in a
`<button>` was reported for months while CI stayed green.

**There is no ESLint and no Prettier, deliberately.** `svelte-check`, `tsc` with
`exactOptionalPropertyTypes`, and the repo guards under
`packages/core/tests/repo/` do that work. Several of those guards exist because
a conventional gate turned out to be measuring nothing.

## Verifying the packages as a consumer

```bash
pnpm -r build
pnpm verify:package
```

`scripts/verify-package.mjs` packs real tarballs, installs all eight **together**
in a temporary directory outside the workspace, and asks Node to resolve every
declared entry point. **Nothing contacts a registry**; it is safe to run any
time.

It matters because every other gate runs *inside* the workspace, where pnpm
links `src/` and the exports map is never consulted — so a broken `exports`
entry is invisible until somebody installs the package. Installing the set
together is also the point: installing one alone makes npm resolve its peers
from the registry, which is what makes the currently-published `chat`
uninstallable.

Two results are expected and not failures: entries that re-export `.svelte` need
a Svelte loader Node does not have (resolution is the check that matters), and
`@composable-svelte/maps/mapbox` needs the optional `mapbox-gl` peer.

## Before you believe a change

Read `guides/VERIFICATION-PROTOCOL.md`. Its first rule is the one that matters
most: **mutation-verify every fix — the test must fail with the fix reverted.**
A test that cannot fail is not a guard, however much it asserts. And when a
guard's job is to report zero, it needs a positive control, or an emptied rule
set and a clean repository are indistinguishable.

## Adding a repo guard

`packages/core/vitest.node.config.ts` lists its test files **individually**
rather than globbing, so a new guard in `tests/repo/` simply does not run until
it is registered there — and in `vite.config.ts`'s browser-mode exclude list,
because these read the disk. `guard-integrity.test.ts` catches both omissions;
expect it to.

## Releasing

**Nothing here is automated, and that is deliberate — read this before running
anything.**

### `pnpm publish`, never `npm publish`

Every satellite declares `"@composable-svelte/core": "workspace:*"` in
`devDependencies`. pnpm rewrites the `workspace:` protocol at publish time; npm
does not, and would put that literal string into a published manifest.

```bash
pnpm publish -r
```

### The bump is one commit, not eight

`packages/core/tests/repo/peer-ranges.test.ts` requires every satellite's
`@composable-svelte/core` peer to equal `^<major>.<minor>.0` of core's **local**
version. The moment core's version moves, all seven satellite manifests are red
until they move with it. That is by design — it is what stopped a satellite
advertising `^0.4.1` while importing an API added in 0.11.0 — but it means core
and its seven peers change in a single commit.

### chat, code and media go together

`chat` peers on `@composable-svelte/code` and `@composable-svelte/media` as well
as core. Publishing chat without them leaves its peers unsatisfiable, which is
the state the registry is in today.

### Order

core first — every satellite's peer range is unsatisfiable until it is on the
registry — then the rest.

### Versioning

This project is on a **0.x line**, and staying there through a large number of
breaking changes is a deliberate choice rather than an oversight. See the
"Versioning" section of the root `README.md` for what 0.x means here and what
would move it to 1.0.
