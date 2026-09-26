# External starter qualification commands

Handoff recipe only; these commands were not run while preparing this file. Use both
immutable Upgrade 1 `0.13.0-next.1` candidate tarballs (core and architecture), not
the historical `next.0` archive.

## Host and reusable inputs

- Current host: `/opt/homebrew/bin/node` `v24.10.0`; `/opt/homebrew/bin/npm` and `npx` `11.6.0`.
- Starter engine contract: Node `^20.19.0 || >=22.12.0`; record the exact runtime in every receipt.
- Genuine npm cache: `/Users/jonathanbelolo/.npm`. Reuse it through npm normally. Do not copy `node_modules`, Vite caches, locks from another fixture, or a fabricated cache.
- Proven command/config sources: `plans/core-prerelease-2026-09-21/evidence/installed-core-consumer-v1/candidate/{package.json,playwright.config.ts,scripts/ssr.mjs}` and `installed-motion-consumer-v1/final-consumer-v4`.

## Materialize outside the repository

```sh
QUAL_ROOT="$(mktemp -d /private/tmp/composable-upgrade1-qualification.XXXXXX)"
mkdir -p "$QUAL_ROOT/inputs" "$QUAL_ROOT/project" "$QUAL_ROOT/evidence/logs"
cp /absolute/path/to/immutable-upgrade1-core.tgz "$QUAL_ROOT/inputs/core.tgz"
cp /absolute/path/to/immutable-upgrade1-architecture.tgz "$QUAL_ROOT/inputs/architecture.tgz"
cp -R /absolute/path/to/extracted-starter/. "$QUAL_ROOT/project/"
cd "$QUAL_ROOT/project"
```

For lock construction only, make `package.json` pin core and architecture as the two
local `file:` archives; keep all other dependency versions exact. Record both archive
hashes. After npm creates the raw lock, preserve it, then normalize **only** the root
`package.json` and lock `packages[""]` specs to exact registry-shaped
`0.13.0-next.1`. The `node_modules/@composable-svelte/{core,architecture}` lock
entries must retain the physical local-tarball `resolved` values and integrity. This
keeps installed bytes local while satisfying the checker's intentional registry-shape
guard. Do not use workspace/link/portal dependencies, `--force`, or
`--legacy-peer-deps`.

For the first candidate materialization, use the normal npm cache, preserve the raw
file-spec inputs, normalize only the two root spec locations, then let `npm ci`
materialize the tested dependency tree:

```sh
npm install --package-lock-only --ignore-scripts --no-audit --no-fund 2>&1 | tee ../evidence/logs/install.log
cp package.json ../evidence/package.file-spec.json
cp package-lock.json ../evidence/package-lock.file-spec.json
node --input-type=module -e 'import fs from "node:fs"; const v="0.13.0-next.1"; const p=JSON.parse(fs.readFileSync("package.json","utf8")); const l=JSON.parse(fs.readFileSync("package-lock.json","utf8")); p.dependencies["@composable-svelte/core"]=v; p.devDependencies["@composable-svelte/architecture"]=v; l.packages[""].dependencies["@composable-svelte/core"]=v; l.packages[""].devDependencies["@composable-svelte/architecture"]=v; fs.writeFileSync("package.json",JSON.stringify(p,null,2)+"\n"); fs.writeFileSync("package-lock.json",JSON.stringify(l,null,2)+"\n");'
npm ci --ignore-scripts --no-audit --no-fund 2>&1 | tee ../evidence/logs/ci.log
npm ls --all --json > ../evidence/npm-ls.json
test ! -L node_modules/@composable-svelte/core
test ! -L node_modules/@composable-svelte/architecture
node -p "require('./node_modules/@composable-svelte/core/package.json').version"
node -p "require('./node_modules/@composable-svelte/architecture/package.json').version"
```

`npm ci` must create the tested physical installation. Verify both lock package entries retain
their local tarball resolution/integrity, both installed package roots are physical
and nonsymlinked, and the root package/lock specs are exact `0.13.0-next.1`. Preserve
the raw file-spec lock, normalized lock and exact normalization receipt.

## Gates and server lifecycle

```sh
npm run check 2>&1 | tee ../evidence/logs/check.log
npm test 2>&1 | tee ../evidence/logs/unit.log
npm run build 2>&1 | tee ../evidence/logs/build.log
npm run test:ssr 2>&1 | tee ../evidence/logs/ssr.log
npx playwright install chromium 2>&1 | tee ../evidence/logs/browser-install.log
npx playwright test 2>&1 | tee ../evidence/logs/browser.log
```

SSR uses Vite middleware mode and opens no TCP port; its script must close the Vite server in `finally`. Browser qualification uses `127.0.0.1:4173`, `--strictPort`, and `reuseExistingServer:false`; Playwright owns startup and clean teardown. Treat an occupied port or surviving preview/Chromium process as failure. Do not launch a separate preview server.

Run the installed candidate architecture checker afterward with its externally pinned
policy, policy SHA-256, expected candidate core version and records root. Save stdout
JSON and stderr separately. Qualification must report `qualification: passed`,
complete violations, zero violations and zero analysis errors. Bundled analysis-only
feedback cannot substitute for this qualification command.

## Review artifacts

```text
evidence/
  INPUTS.json                 # runtime, commands, tarball/package/policy/checker hashes
  package-lock.json           # generated candidate lock
  npm-ls.json                 # physical dependency tree
  logs/{install,ci,check,unit,build,ssr,browser-install,browser,architecture}.{log,json}
  installed-core.json         # name/version/realpath/symlink/integrity checks
  PROCESS-CLEANUP.json        # port 4173 and child-process postconditions
  RESULT.json                 # per-gate exits; no aggregate pass over a failed gate
```

Keep the entire run directory immutable for review. Placement may execute this recipe once the candidate tarball, starter and checker interface are frozen.
