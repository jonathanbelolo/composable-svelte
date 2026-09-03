/**
 * Subject types — the client-side mirror of the backend invocation subject.
 *
 * ## Wire-shape mapping (generated Composable Rust backends)
 *
 * The backend models the caller as `composable_rust_next::Subject`:
 *
 * ```rust
 * Subject::Authenticated { id: SubjectId, attributes: HashMap<String, serde_json::Value> }
 * Subject::Anonymous
 * Subject::System   // server-internal only — never crosses the wire to a browser
 * ```
 *
 * The generated auth middleware builds that subject from the Redis-backed
 * session record: the session's `user_id` UUID becomes the `SubjectId`, and
 * the session's role-set lands in `attributes["roles"]` as a JSON string
 * array (the roles convention every generated authorization gate reads).
 *
 * What the browser actually sees is the roles-carrying session JSON returned
 * by the identity endpoints (`POST /auth/login` today; `GET /auth/session`
 * as the session-resolve pair):
 *
 * ```json
 * { "subject_id": "<uuid>", "display_name": "...", "roles": ["..."] }
 * ```
 *
 * The mapping from that wire JSON to {@link Subject} is:
 *
 * - `subject_id`   → `Subject.id`
 * - `roles`        → `Subject.attributes["roles"]` (string array — same
 *                     convention as the backend gates)
 * - `display_name` → `Subject.attributes["display_name"]` (when present)
 *
 * `System` is intentionally not modelled here: it exists only for
 * server-internal invocations (saga executors, projection rebuilds) and is
 * never serialized to a client.
 */

/**
 * An authenticated caller. `id` is the subject UUID the backend stamps into
 * `author_id` on events this subject causes; `attributes` carries the
 * open-ended claim set, with roles at `attributes["roles"]`.
 */
export interface AuthenticatedSubject {
	kind: 'authenticated';
	id: string;
	attributes: Record<string, unknown>;
}

/** An unauthenticated caller (no valid session). */
export interface AnonymousSubject {
	kind: 'anonymous';
}

/** The client-side subject: authenticated or anonymous. */
export type Subject = AuthenticatedSubject | AnonymousSubject;

/**
 * The roles-carrying session JSON as it appears ON THE WIRE (snake_case,
 * exactly what the generated backend serializes — see the module docs).
 * Returned by `POST /auth/login` and by the session-resolve endpoint.
 */
export interface SessionSnapshot {
	/**
	 * The subject UUID (the session's `user_id`) — the value the backend
	 * stamps into `author_id` on events this subject causes.
	 */
	subject_id: string;
	/**
	 * When the backend says this session lapses, ISO 8601.
	 *
	 * Advisory and optional: a backend that says nothing is not malformed, and a
	 * client that receives nothing falls back to reacting to a 401.
	 *
	 * A **string**, never a `Date`. This crosses SSR hydration through
	 * `JSON.stringify`, which turns a `Date` into a string while the type goes
	 * on claiming `Date` — the rule `AccountLockedError.until` already follows.
	 */
	expires_at?: string | undefined;
	/** Display name of the signed-in account (present on login responses). */
	display_name?: string;
	/**
	 * The session's active role-set — becomes the subject's
	 * `attributes["roles"]`, the convention authorization gates read.
	 *
	 * Optional, because that is what the wire and the code already say.
	 * `parseSessionSnapshot` deliberately admits a payload with no `roles`
	 * (it rejects only a *present* non-array), and `subjectFromSession`
	 * defends with `?? []`. Declaring it required made those two agree with
	 * the runtime and disagree with the type: `fetchSession` could resolve a
	 * value that did not satisfy its own return type, and a consumer writing
	 * their own `SessionDependencies` was forced by the compiler to supply a
	 * field the real implementation does not require.
	 */
	roles?: string[] | undefined;
}
