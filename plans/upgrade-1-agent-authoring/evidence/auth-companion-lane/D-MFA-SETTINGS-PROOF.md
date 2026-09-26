# Managed MFA enrolment and management candidate proof

Status: locally qualified candidate; follow-up independent Opus source review clear to land, parent integration pending. This is the MFA enrolment/management row of `A-INVENTORY.md`; other auth inventory rows and publication remain open.

## Behavior and ownership

`createAuthFeature()` adds optional MFA enrolment and management slots with explicit open, restart and close actions. They are settings flows that may coexist; a later temporary sign-in flow does not silently discard recovery codes or an in-progress settings operation. An accepted change to a different session subject, logout, owner removal, close, restart or view dismissal retires the relevant settings owners. Same-subject reauthentication retains them. The feature exposes an action-specific, one-reduction `mfaOutcome` for acknowledgement, disable, regeneration and backend reauthentication demand. The parent chooses its route and account reload. Confirmation alone does not acknowledge recovery codes or close enrolment.

Managed `MfaEnrolment` and `MfaManagementPanel` accept genuine owned views; standalone stores and callbacks remain supported. Enrolment starts once per view on the client, preserves manual secret/optional QR rendering, and displays recovery codes until explicit acknowledgement. Management does not guess an unread account's MFA state; it serializes disable and regeneration within one flow, preserves operation-specific reauthentication information and keeps the demand visible when no parent prompt is wired. Backend endpoints remain the authority for sensitive changes.

Tests cover headless outcomes, sibling cancellation isolation, subject switches, real mounted `FeatureViews`/`FeatureOutlet`, retry and code acknowledgement, unknown/observed account state, visible reauthentication, SSR no-work and two isolated roots. Mounted tests click still-attached old buttons and dispatch an old form input before Svelte flushes the replacement; the events reach only their retired view. A persistent component test exercises its start guard across view identities. Headless tests cover repeated acknowledgements, management result replay, and refusal to open or restart settings without an authenticated subject. The shipped consumer adds per-section account reads and action-specific parent routes, plus browser and SSR scenarios for two nested auth instances.

## Exact local candidate and measured checks

- Committed base: `16f983e706731f634b5bea6805b836b3bea3d506`.
- Auth 0.2.1 qualified local archive: `/private/tmp/auth-mfa-qualified/composable-svelte-auth-0.2.1.tgz`, SHA256 `69d62d2030cfb78e444d4a11eb09745690b550533494150cd6a179ddee3265a6`.
- Frozen core archive from the earlier auth profile: `/private/tmp/companion-qualified-core-230233b9/composable-svelte-core-0.13.0.tgz`, SHA256 `230233b99c4f04117f302d3bb6a408ba3d13a347ee9694919c318a4a0a354355`.
- Package `typecheck`: pass; package `check`: 0 errors, 0 warnings; package build: pass.
- Full package browser suite: 49 Chromium files, 797 tests passed. Full SSR suite: 5 files, 41 tests passed, including HTTP request-cookie isolation.
- Physical consumers: `/private/tmp/auth-mfa-min` (Svelte 5.20.0) and `/private/tmp/auth-mfa-current` (Svelte 5.55.3). Their auth lockfile SHA512 entries match the final tarball, installed auth is not a symlink, and the installed `consumer/` tree matches source byte for byte. Each consumer passed `npm run check` (0/0), `npm run build`, `npm run test:browser` and `npm run test:ssr` on the final archive.

The first provisional installed browser run failed the right-panel independence assertion because an earlier scenario left a right login flow open; `openMfaManagement` correctly refused while that temporary flow was live. Starting the MFA scenario on a fresh page corrected test setup. The first independent Opus review found a dead standalone acknowledgement control, repeat acknowledgement and management replay reporting, and incomplete settings ownership and consumer state proofs. Those were corrected, then a local audit found and closed an anonymous-session restart gap. The qualified archive passed both browser pins. These are local candidate bytes, not registry publication.

## Independent source review

The follow-up Opus 5.5 review in `/private/tmp/auth-mfa-followup-parent-review.jsonl` returned **clear to land; nothing blocking**. It read the full uncommitted auth diff and the new tests, fixtures and consumer, and ran the two focused mounted/headless MFA files (20/20 Chromium). It confirmed the first review's blocking findings were closed: absent standalone callback, repeat managed acknowledgement, replayed management results, settings ownership across subject changes, consumer account/retry lifetime, preflush old-view events, and the persistent component's start guard. The reviewer did not run the final installed archive or full suite; those checks are recorded above from this lane.

The reviewer noted three nonblocking limits: settings can be reopened during the short `loggingOut` interval before `loggedOut` retires them; one in-source lifecycle comment omits account switch/parent removal; standalone `onDone` remains callable on each click, as it was before this slice. These are follow-up items, not claims of changed standalone semantics.

Parent integration is pending.
