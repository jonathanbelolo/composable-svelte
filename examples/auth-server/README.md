# Auth reference backend

A Node/Fastify server that implements the wire contract
[`@composable-svelte/auth`](../../packages/auth)'s HTTP adapter speaks, plus a
reference client that drives every flow against it.

It exists for two reasons.

**To be a conformance fixture.** Before this, all 92 HTTP tests in
`packages/auth` replaced `globalThis.fetch` with a stub. That means both halves
of the contract were the same fixtures — where a wire shape was wrong, the test
agreed with the bug — and three things had never happened at all:

- **the session cookie had never existed.** The whole security design rests on
  an HttpOnly, `SameSite=Lax`, server-owned cookie, and nothing had ever set,
  carried or cleared one;
- **the OAuth redirect had never happened.** No `location.assign`, no 302, no
  `sessionStorage` record surviving a navigation;
- **the branches the client deliberately does not decide had no counterparty.**
  `reauthentication_required` was designed and shipped without anything ever
  emitting it, and nothing had ever refused to unlink a provider.

**To be documentation.** `packages/auth/README.md` documents three endpoints of
the twenty-two. This is the other nineteen, written as something that runs.

## What it is not

Not an auth system. State is in memory, nothing is persisted, there is no
deployment story, and passwords are hashed with a deliberately weakened scrypt
cost so a sixty-test suite does not spend six seconds proving nothing about
hashing.

It also does not prove the adapter matches **Composable Rust**, the backend this
adapter actually targets, which is not in this workspace. It proves the two
halves of *this* repository agree, and it exercises everything environmental.

## Running it

```bash
pnpm dev          # fixture on :4100 and the reference client on :4101
pnpm test         # the Node conformance suite — all 22 endpoints, 65 tests
pnpm test:e2e     # Playwright: the cookie and the redirect, in a real browser
```

The client is served by Vite, which proxies `/auth`, `/provider` and
`/__test__` to the fixture. Everything is same-origin from the browser's view,
so `createHttpAuthDeps()` runs with its **default** `baseUrl: ''` — which is the
only configuration where a `SameSite=Lax` cookie is actually carried.

Two things about that proxy are load-bearing rather than incidental:

- **`changeOrigin: false`.** The fixture builds its OAuth `authorize_url` from
  `request.headers.host`, because a hardcoded origin breaks the moment it
  listens on an ephemeral port. Vite 6 rewrites `Host` to the proxy target
  unless told otherwise, which sent the browser back to the *fixture's* origin
  instead of the app's — a real 404, found by clicking the button.
- **`/callback` is not under `/auth`.** The proxy would swallow it.

## The seeded accounts

| account | password | address | providers | unlinking the last provider |
| --- | --- | --- | --- | --- |
| `ada@example.com` | yes | verified | github, google | allowed — a password remains |
| `grace@example.com` | **no** | **verified** | google | **allowed** |
| `hopper@example.com` | **no** | **unverified** | google | **refused** |
| `turing@example.com` | yes | verified | — | n/a (has an authenticator) |

Password for all four: `correct-horse-battery-staple`.

`grace` and `hopper` are the point. They differ in one field and get opposite
answers, which is exactly why the client offers the button and lets the backend
decide.

## The unlink rule

> An account may unlink a provider **iff, after the unlink, it retains at least
> one credential the owner controls independently of the provider being
> removed.**
>
> Counts as a credential: a password; another linked provider; **a verified
> email address** — that is what makes a magic link deliverable to the owner.
>
> Does **not** count: an unverified address. A magic link to an address nobody
> has proved control of is not a way in for the owner; it is a way in for
> whoever holds that mailbox, which is what verification establishes.

The last clause is the whole design. The obvious client-side rule —
`hasPassword || providers.length > 1` — refuses `grace`, and is wrong: a magic
link reaches her. The client cannot know whether a given backend offers them, so
it does not try.

`hopper`'s case is not contrived. It is what happens when you sign up through
Google, whose profile supplied an address this server never verified: no
password, one provider, and disconnecting it locks you out. **This server does
not trust a provider's `email_verified` claim** — it records it and ignores it,
which is what makes that case reachable.

The refusal is sent as **422, not 409**. There is no `last_credential` arm in
the client's union, and a bare 409 maps to `email_taken` — which would be
nonsense here. 422 already maps to `unknown`, so even if the body were lost the
verdict degrades to `unknown` rather than to a wrong code.

## Re-authentication

A session carries `authenticatedAt`. `password-login` and `mfa/verify` set it to
now; **`magic-link/signin` and `oauth/complete` set it to `0`** — a magic link
proves control of a mailbox and an OAuth redirect proves an account at Google,
and neither proves a credential *here*. GitHub's sudo mode behaves the same way.

Four operations require a fresh session: changing a password, disabling MFA,
reissuing recovery codes, unlinking a provider. The consequence is that a test
reaches `reauthentication_required` with **no configuration at all**: sign in by
link, then try to change your password.

`methods` is **computed from the account** — `password` if it has one, plus
`totp`/`recovery_code` if MFA is on. If that list would be empty, the operation
is **allowed** rather than refused: demanding proof an account cannot give
strands the user on a prompt with nothing to answer.

The window is a boot-time option (`freshnessMs`). Nothing in a request can
change it — that is the line between configuration and a backdoor.

## The stub identity provider

`GET /provider/authorize` stands in for Google or GitHub. It validates
`redirect_uri` against the registered callback (a dev fixture that is an open
redirect is still an open redirect), and `&deny=1` is its stand-in for pressing
Cancel — the only way `oauth_denied` is ever produced through a real redirect.

What binds `state`:

1. `state` → the begin record, server-side. This is the CSRF check the client
   structurally cannot perform: whoever controls the callback URL controls the
   client's copy.
2. `code` → `state`, at the provider, so a code from one sign-in cannot be
   redeemed against another's nonce.
3. `state` → the browser: **this fixture binds nothing.** A production server
   would tie it to a pre-session cookie. Here the browser-side half is the
   client's own `sessionStorage` record, and this server's job is only to prove
   the server-side half exists.

## The endpoints

Request and response bodies are snake_case. Every failure carries
`{"error": {"code", "message", …}}`, and **the body's `code` beats the HTTP
status**.

| Endpoint | Success | Notes |
| --- | --- | --- |
| `POST /auth/login` | 200 + session | Seeded dev sign-in by `user_id`. **Must be 200 with a body** — the client decodes it unconditionally |
| `POST /auth/logout` | 204 | No body, no `content-type` |
| `GET /auth/session` | 200 + session, or 401/204 | 401 and 204 both mean anonymous; 403 is an error |
| `POST /auth/password-login` | 200 + session | `mfa_required`, `email_unverified`, `account_locked` |
| `POST /auth/signup` | **202** = confirm your address | Read from the status, never the body |
| `POST /auth/verify-email` | **204** = verified, not signed in | |
| `POST /auth/resend-verification` | 204 | Succeeds for unknown addresses — no oracle |
| `POST /auth/request-password-reset` | 204 | Same |
| `POST /auth/reset-password` | **204** = changed, now sign in | |
| `POST /auth/magic-link` | 204 | Rate-limited per address; sends `Retry-After` |
| `POST /auth/magic-link/signin` | 200 + session | Session is born **stale** |
| `POST /auth/mfa/verify` | 200 + session | Always a session; no 204 branch |
| `POST /auth/mfa/enrol` | 200 + `{enrolment_id, secret, otpauth_uri}` | No request body |
| `POST /auth/mfa/enrol/confirm` | 200 + `{recovery_codes}` | Never an empty array |
| `POST /auth/mfa/disable` | 204 | No body. Needs a fresh session |
| `POST /auth/mfa/recovery-codes` | 200 + `{recovery_codes}` | No body. Needs a fresh session |
| `GET /auth/account` | 200 + account | All four of `email`, `email_verified`, `has_password`, `mfa_enabled` are required |
| `POST /auth/account/password` | 200 + session, or 204 | Rotating is the default; both are legal |
| `POST /auth/oauth/begin` | 200 + `{authorize_url, state}` | `authorize_url` must be absolute http(s) |
| `POST /auth/oauth/complete` | 200 + session | Session is born **stale** |
| `POST /auth/oauth/link` | **204, and no `Set-Cookie`** | Linking is not a sign-in |
| `POST /auth/oauth/unlink` | 204, or 422 | Needs a fresh session. See the unlink rule |

Test-only, and registered **only** under `AUTH_FIXTURE_TESTING=1`:
`POST /__test__/reset`, `GET /__test__/outbox`. When the flag is off the routes
do not exist, so they 404 through the normal handler — there is no runtime check
on a header that could be tricked. `main.ts` refuses to boot with the flag set
and `NODE_ENV=production`.

## Traps this had to avoid

Four of these fail silently, which is why they are written down.

1. **Six arms are unreachable from any status** — `mfa_required`,
   `email_unverified`, `oauth_denied`, `oauth_state_mismatch`,
   `reauthentication_required`, `network`. A bare 403 reads as `unknown`.
2. **`mfa_required` without `challenge_id` degrades to `unknown`.** The
   second-factor step becomes unreachable and it looks like a UI bug three
   layers away.
3. **`methods` must be a JSON array** or the client throws a `TypeError` instead
   of producing an error at all.
4. **Fastify's default error and 404 bodies use `error` as a string**, which the
   client's reader discards entirely. `setErrorHandler` **and**
   `setNotFoundHandler` are mandatory, not polish.
5. **`Secure` is off by default.** Browsers exempt `localhost`, so a browser test
   cannot catch this — but on any other plain-http host the cookie is silently
   dropped. `secureCookie: true` turns it on.
6. **No `setInterval` anywhere.** Everything expires lazily on read, or
   `app.close()` leaves the event loop alive and the test run hangs.

## Testing shape

`createServer()` returns a factory result and **never listens**, so the Node
suite builds a whole server per file on `port: 0` and closes it afterwards.
There is nothing to reset between tests: the state *is* the instance.

`tests/cookie-jar.ts` carries the cookie between calls because Node's `fetch`
has no cookie store. It proves nothing about cookie semantics — it does not
enforce `HttpOnly` or `SameSite`. That is Playwright's job, and it is why both
layers exist.

`network` is reached by calling `app.close()` and then making one request. It is
classified client-side from a `TypeError`, so no stub that resolves can ever
produce it.
