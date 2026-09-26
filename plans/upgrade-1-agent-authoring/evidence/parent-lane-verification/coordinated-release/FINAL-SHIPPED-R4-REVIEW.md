# FINAL-SHIPPED-R4-REVIEW: narrow delta from R3 to R4 (independent)

**Verdict: READY.** The `archives-r4` bytes are ready for final exact-artifact installed qualification and for fresh agent authoring (authors install the exact archives). I found no blocker. Gates still pending elsewhere: starter/checker qualification and architecture 0.13.1, the final installed matrix (including browsers), the media physical-microphone check, and nonshipped CI. The F1 dist-tag step at publish is the parent's accepted disposition.

Nothing was edited except this file. Scratch work is in `/private/tmp/final-review-work`; the negative-control dry runs used `/private/tmp/r4neg-*`.

## Byte delta (`/private/tmp/final-review-work/verify_r4.py`, 0 problems)
**Hashes and counts.** For all 8 archives, SHA256, SHA512, integrity, byte count and file count are recomputed from the `.tgz` files and match `archives-r4/MANIFEST.json`. `ARCHIVE-READY-R4.md` agrees; total files: 2,239. The directory and files are read-only. The r1, r2 and r3 archives still match their own manifests.

**Copied packages.** The core, auth, code, media and chat tarballs are byte-identical to R3 (whole-file compare). Their SHA256 values:

| Package | SHA256 |
|---|---|
| core | `30e044e1…d112d18b` |
| auth | `ac13e9a8…07226e62` |
| code | `f85b9452…e3a37026` |
| media | `c0bfa652…07b78298` |
| chat | `cfbfe99d…b07090` |

**Repacked packages.** New SHA256 values:

| Package | SHA256 |
|---|---|
| maps | `3730a67a…aee7116` |
| graphics | `366f918a…c7857b` |
| charts | `c36b7a06…a73c21d` |

- In each, exactly one file differs from R3: `fixtures/installed-consumer/verify.mjs`. No file was added or removed, and no file mode changed.
- The diff is a single line: `npmArgs` goes from `['install', '--ignore-scripts', '--legacy-peer-deps']` to `['install', '--ignore-scripts']` (maps `:37`, graphics `:31`, charts `:31`).
- Peers and `peerDependenciesMeta` are unchanged from R3.
- Every other packed file equals the live candidate.

**Nothing else in the helpers changed.** The same things are still passed or checked:
- the core tarball input (`*_CORE_TARBALL`) and the tarball-existence guard;
- the Svelte version and tarball overrides, and `--offline`;
- the pinned toolchain packages;
- `svelte-check --fail-on-warnings`, NodeNext `tsc` (charts and graphics), `vite build`, SSR, and the optional browser run;
- the hash printout.

No assertion was weakened, and `mapbox-gl` is still never requested. After normalizing package names, the graphics and charts helpers are identical.

## Strict-install evidence (checked, not taken on trust)
- The six logs in `/private/tmp/opus-r4-logs` (maps, graphics and charts × Svelte 5.20.0 / 5.55.3) all reach the end of the script. Every run:
  - reports `svelte-check found 0 errors and 0 warnings`;
  - completes `vite build` and SSR;
  - for charts and graphics, completes NodeNext `tsc`, since the script throws on any non-zero step.
- In every log, the companion tarball the helper packed has the same SHA256 as the R4 archive, and core is `30e044e1…` (R3 = R4).
- I inspected the six surviving install workspaces' `package-lock.json`:
  - the requested Svelte version is installed, with exactly one Svelte copy and one core copy;
  - the lock integrity for core and the companion equals the R4 manifest integrity;
  - `mapbox-gl`, `isomorphic-dompurify` and `tailwindcss` are absent, so optional peers are still not auto-installed.
- **I reproduced the negative control** with npm 11.6.0, installing the R4 core and maps archives with `--dry-run`:

| Svelte | Flags | Exit | Result |
|---|---|---|---|
| 5.19.0 | strict | 1 | `ERESOLVE … peer svelte@"^5.20.0" from @composable-svelte/core@0.13.1` |
| 5.19.0 | `--legacy-peer-deps` | 0 | resolves, so the old flag hid this failure |
| 5.20.0 | strict | 0 | resolves |

**F2 is closed.** No shipped file uses `--legacy-peer-deps` except in the instructions telling users not to.

## Candidate and source state
- **F3 is closed.** `candidate/packages/core/consumer/package.json` has SHA256 `f54301eff6ad4a3c301a2618702dbabe56ad798b00a50ca709d101d4095fd22f`. That matches the file inside the R3/R4 core archive and in `review-r3`: core 0.13.1, architecture 0.13.1, `--expected-core-version 0.13.1`, Svelte 5.57.0.
- Every shipped file in all 8 R4 archives, other than the top-level `package.json`, now matches the live candidate byte for byte.
- The restored starter is the only candidate file written after the R4 manifest.
- The Gemini follow-up process (PID 20791) has exited.

## Non-blocking notes
These describe how the helpers behaved before R4; R4 did not change any of them.
- The helpers always pack the companion from source with the `pnpm` on `PATH`, running scripts (prepack). They cannot consume a supplied companion archive. R4 equality was shown by hash. The final matrix should install the R4 `.tgz` files directly.
- No browser run was made; that belongs to the pending installed matrix.
- The `candidateSourceDriftSinceR3Pack` note in the R4 manifest and receipt is now historical, because the candidate was restored.
