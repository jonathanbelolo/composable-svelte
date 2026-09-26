# Auth cross-cutting qualification and archive closure

Status: qualified local candidate; independent Opus 5.5 **CLEAR TO LAND** and all coordinator gates pass. The exact archive and integrity receipt are recorded below. This is local candidate evidence, not publication or integration into main.

## Capability coverage

| Capability | Source evidence | Installed consumer evidence |
| --- | --- | --- |
| HTTP/default backend and mocks | `http-error-mapping.test.ts`, `session-http.test.ts`, `malformed-2xx.test.ts`, `mock-auth-deps.test.ts`; reference backend suite (110 tests) | `consumer/scripts/browser.mjs` imports the public `/http`, `/testing`, `/errors` paths. It checks anonymous session resolution, `credentials: 'include'`, structured invalid credentials, the identical AbortSignal reaching fetch, mock anonymous start/login/abort, and a nested MFA wire error preserving its challenge ID. |
| Structured errors | `auth-error.test.ts`, `remaining-boundaries.test.ts`, `http-error-mapping.test.ts`, managed login/MFA routing tests | Installed `isAuthError`/`isMfaRequired` classification and HTTP error decoding. `retryDelaySeconds` derives delay from a domain error; wire header parsing belongs to the HTTP adapter. |
| Input/gating primitives | `password-input.test.ts`, `components.smoke.browser.test.ts`, `gate-unresolved.test.ts`, `auth-guard-relogin.test.ts`; source ComponentProps controls | Installed ComponentProps positive and negative controls for AuthGuard, RoleGate, PasswordInput, PasswordCriteria, OneTimeCodeInput. Browser checks criteria linkage, show/hide label and pressed state, and reactive criteria. |
| Subject/role helpers and accepted session | `subject.test.ts`, `session-established.test.ts`, managed composition tests | Gates use a passive read-only projection of the live parent's accepted SessionState. They show member access after login child retirement, deny admin access, and return to anonymous after deletion. The live-parent conditional removes them when the owning feature retires. No Store mutation authority is fabricated. |
| Password policy | `password-input.test.ts`, `signup-flow.test.ts`, `password-recovery-flow.test.ts` | Installed signup rejects a short password; sign-in accepts the existing 13-character fixture credential; guidance and field errors render. Policy is length only: 12–128 characters, with no uppercase, lowercase, digit or symbol requirement. Reset-policy equivalence and short existing sign-in passwords are source-suite evidence, not a separate installed negative reset case. |
| SSR isolation | Existing request-cookie and managed SSR tests | `consumer/scripts/ssr.mjs` renders separate member, admin and anonymous requests and checks role markup and request markers do not leak. These are sequential isolated renders, not a concurrency stress test. Password guidance renders on the server; counted auth dependencies remain unused. |

AuthGuard and RoleGate are UX only; the backend authorizes requests. AuthGuard keeps an accepted subject visible during revalidation. Pending markup represents unresolved state; it is not shown for every operation on an already authenticated subject. OneTimeCodeInput's standalone input contract is retained. Mock expiry is configured by `sessionExpiresAt` and a matching session snapshot; refresh-time decisions use the flow's injected clock.

## Source measurements

Coordinator final measurements: check (0 errors/warnings), typecheck, build (25 declaration bridges), 942 Chromium tests across 55 files and 62 SSR tests across 11 files, all passing (1004 total). The reference-backend baseline is independently measured at 110/110 passing (`/private/tmp/auth-cross-cutting-backend-tests.log`).

## Physical package qualification

The fixtures are `/private/tmp/auth-oauth-min` (Svelte 5.20.0) and `/private/tmp/auth-oauth-current` (Svelte 5.55.3). Both use Vite 6.4.1 and @sveltejs/vite-plugin-svelte 6.2.1. Core is the qualified 0.13.0 local archive with SHA256 `230233b99c4f04117f302d3bb6a408ba3d13a347ee9694919c318a4a0a354355`; Auth's local version label is 0.2.1. Labels are not claims about published registry bytes.

Author runs of check/build/browser/SSR passed in both physical fixtures while developing the candidate. These runs do not substitute for the coordinator's final archive-matching checks. `installed-backend-proof.mts` also exercises the installed HTTP adapter against the real reference backend: login, structured invalid credentials, independent cookie jars, session resolve, expiry extension, abort, credentials, logout and refused refresh afterward. The backend is an in-memory conformance fixture, not a production authentication service.

## Durable archive hygiene

The package `files` manifest retains runnable consumer source and explicitly excludes consumer `node_modules`, `dist`, `.vite`, `.svelte-kit`, and tarballs. The earlier 61 Vite-cache entries must not occur in the final artifact. `verify-final-artifact.py` checks the actual final tar inventory, all packed file bytes against the package tree, all installed Auth file bytes against that tarball, fixture recipe bytes, both Svelte pins, physical (non-symlink) package directories, and Auth/Core lock integrity. The final actual archive gate passed: 404 files, zero forbidden entries. Package manifest comparison accounts only for pnpm replacing the workspace Core devDependency and omitting prepack/prepublishOnly; every other manifest field and all other file bytes match.

## Final coordinator receipt

- Archive: `/private/tmp/auth-final-candidate/composable-svelte-auth-0.2.1.tgz`.
- SHA256: `92d8ee7f8486f7573bdbfbae9181b20a0aac696e282050793ce2ddf14a33bdd5`; 326537 bytes; 404 packed files.
- Exact inventory, physical-package checks and lock integrity: `FINAL-ARTIFACT-RECEIPT.json`.
- Both Svelte pins: `npm run check`, `build`, `test:browser`, `test:ssr` PASS; both live backend proofs PASS.
- Final source: 942 Chromium + 62 SSR tests, check/typecheck/build PASS.
- Independent Opus: **CLEAR TO LAND**, `FINAL-OPUS-REVIEW.md` (89 focused Chromium +3 SSR +svelte-check independently measured).
- Captured coordinator outputs: `final-qualification-logs/`. J-SESSION-REFRESH-PROOF.md records the refresh slice; A-INVENTORY.md maps all 18 capability rows. Parent integration, release/checker qualification and publication remain parent-owned work.
