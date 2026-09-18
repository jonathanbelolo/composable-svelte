# Default HTTP adapter contract

`createHttpAuthDeps(baseUrl = '')` from `@composable-svelte/auth/http` implements
this contract. `createHttpSessionDeps` implements its first three routes.
All requests use `credentials: 'include'`. Bodies shown below are JSON objects
with `Content-Type: application/json`; a dash means no body. Void operations
accept any successful 2xx response and ignore its body; 204 is recommended.
Session-returning operations require a JSON Session unless a special status is
explicitly listed. A malformed success is an error, never an authenticated user.

This is the frontend adapter's contract, not a claim that every generated backend
already implements it. Implement these routes or inject your own
`AuthDependencies`. The exported declarations describe the camelCase dependency
interface; the wire protocol below uses snake_case.

| Method | Route | JSON request fields | Success |
|---|---|---|---|
| POST | `/auth/login` | user_id: string | Session; development seeded login only |
| POST | `/auth/logout` | — | 204; invalidate session and clear cookie |
| GET | `/auth/session` | — | Session; 401 or 204 means anonymous |
| POST | `/auth/password-login` | email, password: string; remember_me?: boolean | Session |
| POST | `/auth/signup` | email, password: string | 202 verification required; otherwise Session |
| POST | `/auth/verify-email` | token: string | 204 verified without login; otherwise Session |
| POST | `/auth/resend-verification` | email: string | 204 |
| POST | `/auth/request-password-reset` | email: string | 204 |
| POST | `/auth/reset-password` | token, password: string | 204 changed without login; otherwise Session |
| POST | `/auth/magic-link` | email: string | 204 |
| POST | `/auth/magic-link/signin` | token: string | Session |
| POST | `/auth/mfa/verify` | challenge_id, code: string; method: "totp" or "recovery_code" | Session |
| POST | `/auth/mfa/enrol` | — | 200 `{enrolment_id, secret, otpauth_uri}` (strings) |
| POST | `/auth/mfa/enrol/confirm` | enrolment_id, code: string | 200 `{recovery_codes: string[]}` (nonempty) |
| POST | `/auth/mfa/disable` | — | 204 |
| POST | `/auth/mfa/recovery-codes` | — | 200 `{recovery_codes: string[]}` (nonempty) |
| GET | `/auth/account` | — | 200 Account (below) |
| POST | `/auth/account/password` | password: string | 204 session unchanged; otherwise Session |
| POST | `/auth/account/email` | email: string | 204 |
| POST | `/auth/account/email/resend` | — | 204 |
| POST | `/auth/account/email/confirm` | token: string | 200 `{email: string}` |
| DELETE | `/auth/account` | — | 204; invalidate account sessions |
| POST | `/auth/session/refresh` | — | 200 `{expires_at?: string or null}`; 204 means no advertised expiry |
| POST | `/auth/oauth/begin` | provider: string | 200 `{authorize_url: string, state: string}` |
| POST | `/auth/oauth/complete` | provider, code, state: string | Session |
| POST | `/auth/oauth/link` | provider, code, state: string | 204; link to current account, do not sign in as another account |
| POST | `/auth/oauth/unlink` | provider: string | 204; backend must reject removal of the last sign-in method |

## Success payloads

Session is `{subject_id: string, roles?: string[], display_name?: string, expires_at?: string}`.
Missing roles defaults to an empty list; provide string role names. `expires_at`
is an optional ISO 8601 timestamp and cannot be null in a Session. `display_name`, when present, becomes a subject attribute. Other arbitrary
wire fields are not automatically mapped to subject attributes. Backend
authorization remains authoritative.

Account is `{email: string, email_verified: boolean, has_password: boolean,
mfa_enabled: boolean, providers?: string[], pending_email?: string | null}`.
Missing providers means none; missing/null pending_email means no change pending.
OAuth authorize_url must be an absolute HTTP(S) URL and state a nonempty string.
The backend must bind that state to the browser's authorization attempt and
validate it during completion/linking. MFA enrolment returns all three fields;
recovery codes must be a nonempty string array.

## Failure payloads

Return a non-2xx status with an optional JSON object:

```json
{"error":{"code":"mfa_required","message":"Enter your code","challenge_id":"opaque-id","methods":["totp","recovery_code"]}}
```

Recognized `error.code` values override the status fallback:
`invalid_credentials`, `mfa_required`, `email_unverified`, `email_taken`,
`account_locked`, `rate_limited`, `token_expired`, `oauth_denied`,
`oauth_state_mismatch`, `reauthentication_required`, `network`, `unknown`.
For MFA provide `challenge_id` and optional `methods` (defaults to totp).
Additional fields are `email` for unverified email, `locked_until` for lockout,
`provider` for OAuth refusal and `retry_after_seconds` for rate limits.
A valid `Retry-After` response header takes precedence over the latter.
Reauthentication errors can include `methods` (`password`, `totp`,
`recovery_code`); the application must complete its backend's fresh-auth flow.

Without a recognized code the mapping is 401 → invalid_credentials,
409 → email_taken, 410 → token_expired, 423 → account_locked,
429 → rate_limited, otherwise unknown. GET /auth/session handles 401/204
as anonymous before error decoding. Network failures become network errors;
AbortError cancellation remains cancellation. Non-JSON error bodies use the
status fallback. Do not return an HTML application shell with a 200 status.

## Backend responsibilities

Use server-issued HttpOnly cookies, HTTPS in production, and appropriate CSRF
and origin checks. The default SameSite=Lax integration requires a same-site
backend; cross-origin same-site deployments additionally need credentialed CORS.
The browser adapter neither stores bearer tokens nor reads the session cookie.
Never expose seeded `/auth/login` in production. Validate permissions on every
backend operation; hiding a component is not authorization. Reset/magic-link
requests should give the same outward response for existing and absent accounts.
Tokens and OAuth state must be short-lived and single-use. Supply delivery,
provider credentials, session rotation, reauthentication and rate limiting on the
server. Those services are not bundled in this frontend package.

See the [auth README](../README.md) for stores and UI components.
