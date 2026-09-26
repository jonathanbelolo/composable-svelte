# FINAL-SHIPPED-REVIEW: `archives-r3` (fresh independent review)

**Verdict:**
- **Installed qualification: READY.** All eight `archives-r3` archives are internally consistent, correctly versioned, hash-verified, and match the frozen `review-r3` source. No finding needs a change to r3 bytes before the installed matrix runs.
- **Fresh agent authoring: READY, with one condition.** Authors must install the exact r3 archives, not a registry tag, because of finding F1.

This is not release signoff. These gates are still open and owned elsewhere:
- starter/checker policy qualification and publication of architecture 0.13.1;
- the final installed matrix;
- media physical-microphone verification;
- nonshipped CI/examples/root docs (Gemini);
- registry and changelog-date recheck at freeze.

Nothing was edited except this file. Archives were read in memory and extracted only to `/private/tmp/final-review-work`.

## Verified (independent script: `/private/tmp/final-review-work/verify.py`, 0 problems)

**Hashes and inventory.**
- For all 8 archives, SHA256, SHA512, integrity, byte count and file count are recomputed from the actual `.tgz` files and match `MANIFEST.json`. Total files: 2,239.
- Every row of `ARCHIVE-READY-R3.md` matches the manifest.
- `archives-r3/` and its files are read-only (`dr-xr-xr-x` / `-r--r--r--`).
- The r1 and r2 archives still match their own manifests, so they are untouched and superseded.

**Contents match frozen source.**
- Every packed file except the top-level `package.json` is byte-identical to `review-r3/packages/<pkg>`.
- No file is in an archive without also being in source.
- No `/private/tmp` or `/Users/` path appears in any shipped file.

**Exact delta from r2.** Recomputed; it equals the manifest's `changedFromR2` exactly, with nothing added or removed:

| Package | Changed files |
|---|---|
| core | `CHANGELOG.md`, `README.md`, `docs/consumer.md`, `docs/prerelease.md` |
| auth | `consumer/README.md` |
| maps, graphics | `MANAGED.md`, `fixtures/installed-consumer/README.md` |
| charts | `INTEGRATION.md`, `MANAGED.md`, `README.md`, fixture `README.md` |
| code | `CHANGELOG.md`, `README.md`, `recipes/managed/README.md` |
| chat | `CHANGELOG.md`, `recipes/managed/README.md`, `package.json` |
| media | byte-identical (same SHA256 as r2) |

Chat's `package.json` is semantically identical to r2 once keys are sorted; only the devDependency key order changed.

**Versions and peers.**
- Versions: core 0.13.1; auth, maps, graphics and charts 0.3.0; code, media and chat 0.5.0.
- Every companion declares core `^0.13.1`.
- Svelte `^5.20.0` everywhere except code, which declares `^5.30.0`. (@xyflow/svelte 1.4.1 peers `svelte ^5.25.0`, which is consistent with the changelog's reasoning.)
- Optional peers are intact:
  - chat: code `^0.5.0`, media `^0.5.0`, prismjs, pdfjs-dist;
  - maps: mapbox-gl;
  - core: isomorphic-dompurify, tailwindcss, vitest.
- Packed manifests differ from source only by pnpm dropping `prepack`/`prepublishOnly` and rewriting `workspace:*` devDependencies: core becomes `0.13.1`, and chat's code/media become `0.5.0`.
- No `workspace:`, `link:`, `file:` or `catalog:` appears in any packed `package.json`, including nested ones.
- Nested pins:
  - core starter: core 0.13.1 and architecture 0.13.1 (exact), `--expected-core-version 0.13.1`, Svelte 5.57.0. The diff against baseline is exactly those three lines.
  - auth consumer: core 0.13.1, auth 0.3.0, Svelte 5.20.0.
  - charts, graphics and maps fixtures: `^0.13.1` / `^0.3.0` / `^5.20.0`.
  - agent-patterns example: core 0.13.1.

**Caches and links.**
- No `node_modules`, `.vite`, `.svelte-kit`, `.cache`, `coverage`, `.DS_Store`, `.tgz`, `tsbuildinfo` or logs in any archive.
- Every relative Markdown link outside fenced code resolves inside its own archive: 0 broken.

**R1/R2 items in the actual archives.**
- **B1: fixed.** The three `MANAGED.md` files and three fixture READMEs now make plain `npm install` of the manifest ranges the main path. The tarball/`verify.mjs` flow is labelled "Maintainer qualification only", and the 5.20.0/5.55.3 runs are labelled as earlier pre-release evidence.
- **B2: fixed.** In `auth/consumer/README.md:41-47,133-145`, the published pins are the main path. The text says "Do not bypass peer checks with `--force` or `--legacy-peer-deps`". The `file:` flow is maintainer-only and no longer bypasses peers. The `/private/tmp` paths are gone, and the September 25 runs are framed as historical 0.13.0/0.2.1 evidence.
- **B4: fixed.** `charts/README.md:35-36` now says `^0.13.1` / `^5.20.0`. `charts/INTEGRATION.md:231-239` matches `package.json` (plot plus the four d3 packages, no `motion`).
- **N1: fixed.** `core/README.md:50` and `docs/consumer.md:8` pin `architecture@0.13.1`, and `prerelease.md:24` names 0.13.1. The README's companion list names the Code 5.30 floor. `prerelease.md:22` covers the Code 5.30 floor (including via chat's optional peer) and restores the no-bypass rule.
- **O1–O6: fixed.**
  - code README floor and reason;
  - code changelog `### Changed — breaking`;
  - "checked at 5.30.0 and 5.55.3, not every patch";
  - chat recipe and changelog Code-5.30 note;
  - chat headingless bullets moved to `### Fixed`;
  - core `[0.13.1]` Changed/Notes with the starter re-pin.
- No `###` heading repeats within any release section. The newest changelog entry equals the manifest version for all 8 packages.
- The shipped docs contain none of "unpublished", "release path", "For a local candidate", "isolated candidate", "tested through", "remain incompatible", `architecture@0.13.0`, `^0.12` or `^5.0.0`.

**S2: rebuilt `dist` equals R2.** There is no `REBUILD-DIST-EQUALITY.json`. The equivalent evidence is `SHIPPED-REPAIR.md` plus `/private/tmp/opus-r3-work/{predist,build-*.log}`, and I reproduced the result independently:
- For charts, chat, code, graphics, maps and media, both the pre-rebuild `predist` (13:39–13:40) and the rebuilt `review-r3/packages/<p>/dist` (14:01:53–14:02:05) differ from the r2 archive's `dist` in **0 files**.
- r3 `dist` equals the r2 `dist` because no `dist` path appears in the r3-vs-r2 delta.
- Every candidate companion `node_modules/@composable-svelte/*` link resolves into `candidate/packages`.

**Pack tool.** The manifest records pnpm 9.15.9 with `--config.ignore-scripts=true`, and the pack session log shows `pnpm@9.15.9 --version` being checked. The packed bytes show the pnpm-specific changes (workspace rewrite, prepack stripping). The archives cannot prove the tool version by themselves, but everything they show is consistent with it.

**Main repository.**
- 5,155 of 5,157 `baseline-sha256.json` entries still match main.
- The two mismatches are coordinator plan docs, not package source:
  - `plans/upgrade-1-agent-authoring/COMPANION-RELEASE-CANDIDATE-PLAN.md` (13:47:59);
  - `plans/upgrade-1-agent-authoring/COMPANION-AGENT-QUALIFICATION-BRIEFS.md` (14:03:01).
- No worker log writes them.
- No main `packages/**` source file is newer than the snapshot. Main package versions are still 0.13.0, 0.2.1 and 0.4.1.
- Main's pre-existing uncommitted worktree (1,101 entries, latest 12:42) predates this session.

## Findings

**F1: shipped core docs install `core@next`, which is stale on the registry.** This was already in the baseline; R1 and R2 missed it.
- Locations:
  - `core/docs/getting-started.md:26-30` (the tutorial linked from `README.md:326` and `docs/README.md`);
  - `core/docs/quick-reference.md:8`;
  - `core/docs/i18n/internationalization.md:20`.
- All three say `npm install @composable-svelte/core@next`.
- Registry today: `next` = `0.13.0-next.0`, `latest` = `0.13.0`.
- `semver.satisfies('0.13.0-next.0', '^0.13.1')` is **false**, and that prerelease also lacks the 0.13.1 `observeChildActions` seam.
- The effect: an author who follows Getting Started gets a stale prerelease core that no 0.13.1-train companion accepts.
- The core README (`:76-78`), `docs/consumer.md:7` and the starter correctly pin 0.13.1.
- Disposition, without changing the core bytes:
  1. Add a recorded publish step: `npm dist-tag add @composable-svelte/core@0.13.1 next` (or drop the `next` tag).
  2. Tell fresh-authoring agents to install the exact r3 tarballs and to ignore `@next`.
- Otherwise, fix the docs and repack core in a later revision.

**F2 (minor): three shipped maintainer helpers bypass peer checks.**
- The `fixtures/installed-consumer/verify.mjs` files in r3 charts (`:31`), graphics (`:31`) and maps (`:37`) run `npm install --ignore-scripts --legacy-peer-deps`.
- This contradicts the shipped no-bypass rule (`core/docs/prerelease.md:22`, `auth/consumer/README.md:45`).
- Consumers are not affected: the READMEs mark it maintainer-only, and the recipe path is plain `npm install`.
- It does weaken any qualification run through these helpers. The installed matrix must use a strict install either way.
- A concurrent session (`OPUS-NATIVE-VERIFY.txt`) has already removed the flag in `candidate/` (14:05:33) to produce `archives-r4` for these three packages. That delta needs its own narrow review. Until then, r3 is the reviewed revision for all eight.

**F3 (process, not r3 bytes): the live `candidate/` has drifted from r3.**
- At 14:03:55, after the r3 pack, the Gemini follow-up worker ran `cp baseline/packages/core/consumer/package.json candidate/packages/core/consumer/package.json` (`gemini-followup.jsonl`, step 906).
- That reverted the coordinator-staged starter to core 0.13.0, architecture 0.13.0 and `--expected-core-version 0.13.0`. It was still reverted at 14:07:52.
- The r3 core archive is correct (0.13.1).
- Any core repack from `candidate/` would regress the starter. r4 must copy the r3 core bytes (as its brief says), and Gemini should not touch shipped package files.
- The candidate charts, graphics and maps `dist` trees currently still equal r3.

## Pending gates (not defects)
- Starter/checker policy qualification and publication of architecture 0.13.1 (the starter pins an unpublished `architecture@0.13.1`).
- Final installed matrix against the exact hash-verified archives: r3, or r4 for charts/graphics/maps if it is adopted.
- Media physical-microphone check.
- Nonshipped CI/examples/root README/CONTRIBUTING (Gemini).
- O8 floor guard.
- Registry state and changelog dates (2026-09-26) at freeze.
- Publish ordering: core 0.13.1 before its companions, plus the F1 dist-tag action.
