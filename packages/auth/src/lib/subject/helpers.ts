/**
 * Pure helpers over {@link Subject}.
 *
 * All helpers are synchronous and side-effect free — safe to call from
 * reducers, `$derived` expressions, and tests alike.
 */

import type {
	AnonymousSubject,
	AuthenticatedSubject,
	SessionSnapshot,
	Subject
} from './types.js';

/**
 * The canonical anonymous subject value. Frozen: it is SHARED by every
 * store/state that goes anonymous, so accidental mutation anywhere would
 * corrupt all of them — `Object.freeze` turns that bug into a loud throw
 * (strict mode) instead of silent cross-store corruption.
 */
export const anonymousSubject: AnonymousSubject = Object.freeze({ kind: 'anonymous' } as const);

/**
 * Build an {@link AuthenticatedSubject} from the wire-shape session JSON.
 *
 * Mapping (see `types.ts` module docs): `subject_id` → `id`, `roles` →
 * `attributes["roles"]`, `display_name` → `attributes["display_name"]`.
 */
export function subjectFromSession(session: SessionSnapshot): AuthenticatedSubject {
	// Fail-safe on the wire shape: a payload missing `roles` yields an empty
	// role-set (matches `subjectRoles`' fail-closed posture).
	const attributes: Record<string, unknown> = { roles: [...(session.roles ?? [])] };
	if (session.display_name !== undefined) {
		attributes['display_name'] = session.display_name;
	}
	return { kind: 'authenticated', id: session.subject_id, attributes };
}

/**
 * The subject's role-set, read from `attributes["roles"]` (the backend
 * convention). Anonymous subjects — and malformed attribute payloads —
 * yield an empty array (fail-closed).
 */
export function subjectRoles(subject: Subject): string[] {
	if (subject.kind !== 'authenticated') {
		return [];
	}
	const roles = subject.attributes['roles'];
	if (!Array.isArray(roles)) {
		return [];
	}
	return roles.filter((role): role is string => typeof role === 'string');
}

/** True when the subject holds `role`. Anonymous subjects hold no roles. */
export function hasRole(subject: Subject, role: string): boolean {
	return subjectRoles(subject).includes(role);
}

/**
 * True when the subject holds at least one of `roles`.
 *
 * An EMPTY `roles` requirement means "no role restriction" and returns
 * `true` for any subject (including anonymous) — mirrors a role gate with
 * nothing to gate on.
 */
export function hasAnyRole(subject: Subject, roles: readonly string[]): boolean {
	if (roles.length === 0) {
		return true;
	}
	const held = subjectRoles(subject);
	return roles.some((role) => held.includes(role));
}
