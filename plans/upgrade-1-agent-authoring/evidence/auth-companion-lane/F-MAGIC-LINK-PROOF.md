# Managed magic-link request and sign-in candidate proof

Status: locally qualified candidate; independent Opus 5.5 source review **clear to land**. This is the magic-link row of `A-INVENTORY.md`. Other auth inventory rows, parent integration, and publication remain open.

## Behavior and ownership

`createAuthFeature()` adds optional owned `magicLinkRequest` and `magicLinkSignIn` slots. Request keeps its editable form and sent confirmation, reports a one-reduction `magicLinkOutcome: { kind: 'requestSent', email }`, and can route back to password sign-in. The backend's request contract must resolve alike for known and unknown addresses; the UI does not claim that an account exists. Sign-in is a separate page load. Merely rendering or fetching the landing page never spends its token; only a user press dispatches the exchange.

An accepted sign-in hands its session to the persistent session slot, retires the temporary owner, and reports `signedIn`. An accepted `mfa_required` result retires sign-in, presents the managed MFA challenge, and reports `mfaRequired`. Missing and expired tokens offer a new-link route; other errors can retry the token. Navigation from the sign-in view is refused while an exchange is in flight. A different token arriving on the same live view cancels the old fixed-ID effect, resets to idle, and increments an attempt number. Effect-driven feedback carries that number, so late old success, expiry and MFA results cannot settle the new attempt. Retired owners and logout drop late feedback.

Managed components require genuine `PresentationView` ports, render nothing for retired views, and key their DOM by owner. The request view's back button sends through its rendered owner, including before Svelte flushes a replacement. Standalone component props and callbacks remain available; reducer feedback guards, required state markers and token replacement behavior are classified as pre-release changes in the changelog. Backend endpoints remain the authority for token consumption and session policy.

Tests cover result pulses and replays, same-owner token replacement followed by a new click, late old success/`mfa_required`/`token_expired`, in-flight route refusal, preflush old-view click, sibling roots, missing token, SSR no-work and isolated roots. The installed browser recipe observes zero `signInWithMagicLink` calls before the click in the same page lifecycle, exactly one afterward, one accepted outcome, and an unchanged right sibling. It also checks one request call and one `requestSent` outcome.

## Exact local candidate and measured checks

- Committed base: `97c63d84` (managed OAuth).
- Auth 0.2.1 qualified local archive: `/private/tmp/auth-magic-link-qualified/composable-svelte-auth-0.2.1.tgz`, SHA256 `6aafd3c14f9a54a0255df4ddc8c66bef51057d8340a4d902426e4d0c4d94488b`.
- Package `typecheck`: pass; package `check`: 0 errors, 0 warnings; package build: pass.
- Full package Chromium suite after runtime corrections: 51 files, 842 tests passed. Full SSR suite: 7 files, 48 tests passed. The final post-review edits were documentation only; `pnpm pack` rebuilt the final archive.
- Physical consumers: `/private/tmp/auth-oauth-min` (Svelte 5.20.0) and `/private/tmp/auth-oauth-current` (Svelte 5.55.3). Both installed the exact final archive offline. Their auth lockfile SHA512 entries match that archive, installed auth is not a symlink, and their consumer source trees match source byte for byte. Both passed `npm run check` (0 errors, 0 warnings), `npm run build`, `npm run test:browser`, and `npm run test:ssr` on the final archive. Each has one deduplicated core and Svelte identity.

These are local candidate bytes, not registry publication.

## Independent source review

Initial Opus review in `/private/tmp/auth-magic-link-independent-review.jsonl` found two blockers: changing a token during an in-flight exchange could accept the old account's session or MFA result, and the README/CHANGELOG described wrong public outcome fields and dependency requirements. Gemini corrected those, in-flight navigation, owner-keyed request DOM, and the installed browser proof. The follow-up review in `/private/tmp/auth-magic-link-followup-review.jsonl` returned **clear to land** after inspecting the full diff and tests. It verified cancellation, attempt-stamped effect feedback, the parent handoff, and the corrected consumer assertions. The reviewer did not rerun the suites or archive; this lane ran those gates separately as recorded above.

The reviewer noted that feedback actions retain an optional attempt number for standalone callers. A manually dispatched success without an attempt during a submission is guarded by status only. Effect-driven feedback always carries an attempt, and a caller able to hand-write a view result can already dispatch a session-establishment action at the feature root; the reviewer found no additional capability and did not block on it. The changelog now states this limit explicitly. A few other nonblocking points were addressed in documentation after review: the actual default button text, same-token `tokenProvided` behavior, and the fact that the feature presents the MFA challenge while the consumer parent records its outcome. Disabling the request form's back button while an email request is pending remains a possible UX choice; it cannot establish a session.

Parent integration is pending.
