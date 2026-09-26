/**
 * Subject helper tests — pure functions, no store involved.
 */

import { describe, it, expect } from 'vitest';
import {
	anonymousSubject,
	hasAnyRole,
	hasRole,
	subjectDisplayName,
	subjectFromSession,
	subjectRoles
} from '../src/lib/subject/helpers';
import type { SessionSnapshot, Subject } from '../src/lib/subject/types';

const session: SessionSnapshot = {
	subject_id: '3f2a58f0-0000-0000-0000-000000000001',
	display_name: 'Booking Agent',
	roles: ['agent', 'customer']
};

describe('anonymousSubject', () => {
	it('is frozen — the value is shared by every anonymous state, so mutation must throw', () => {
		expect(Object.isFrozen(anonymousSubject)).toBe(true);
		expect(() => {
			(anonymousSubject as { kind: string }).kind = 'authenticated';
		}).toThrow(TypeError);
		expect(anonymousSubject.kind).toBe('anonymous');
	});
});

describe('subjectFromSession', () => {
	it('maps subject_id → id, roles → attributes.roles, display_name → attributes.display_name', () => {
		const subject = subjectFromSession(session);

		expect(subject.kind).toBe('authenticated');
		expect(subject.id).toBe(session.subject_id);
		expect(subject.attributes['roles']).toEqual(['agent', 'customer']);
		expect(subject.attributes['display_name']).toBe('Booking Agent');
	});

	it('omits display_name attribute when absent on the wire', () => {
		const subject = subjectFromSession({
			subject_id: 'abc',
			roles: []
		});

		expect('display_name' in subject.attributes).toBe(false);
		expect(subject.attributes['roles']).toEqual([]);
	});

	it('defaults roles to [] when absent on the wire (fail-safe)', () => {
		// A backend variant may omit `roles` entirely. The wire type says so now
		// — this used to need `as SessionSnapshot` to express a payload the
		// parser deliberately admits.
		const wire: SessionSnapshot = { subject_id: 'abc' };
		const subject = subjectFromSession(wire);

		expect(subject.attributes['roles']).toEqual([]);
	});

	it('copies roles defensively (mutating the snapshot does not affect the subject)', () => {
		const snapshot: SessionSnapshot = { subject_id: 'abc', roles: ['agent'] };
		const subject = subjectFromSession(snapshot);
		snapshot.roles!.push('admin');

		expect(subject.attributes['roles']).toEqual(['agent']);
	});
});

describe('subjectRoles', () => {
	it('returns [] for anonymous subjects', () => {
		expect(subjectRoles(anonymousSubject)).toEqual([]);
	});

	it('returns [] when attributes.roles is missing or malformed (fail-closed)', () => {
		const noRoles: Subject = { kind: 'authenticated', id: 'x', attributes: {} };
		const badRoles: Subject = {
			kind: 'authenticated',
			id: 'x',
			attributes: { roles: 'agent' }
		};

		expect(subjectRoles(noRoles)).toEqual([]);
		expect(subjectRoles(badRoles)).toEqual([]);
	});

	it('filters non-string entries out of the role array', () => {
		const mixed: Subject = {
			kind: 'authenticated',
			id: 'x',
			attributes: { roles: ['agent', 42, null, 'admin'] }
		};

		expect(subjectRoles(mixed)).toEqual(['agent', 'admin']);
	});
});

describe('subjectDisplayName', () => {
	it('returns null for anonymous subjects', () => {
		expect(subjectDisplayName(anonymousSubject)).toBeNull();
	});

	it('returns null when attributes.display_name is missing', () => {
		const noName: Subject = { kind: 'authenticated', id: 'x', attributes: {} };
		expect(subjectDisplayName(noName)).toBeNull();
	});

	it('returns null when attributes.display_name is not a string (fail-safe)', () => {
		const numeric: Subject = { kind: 'authenticated', id: 'x', attributes: { display_name: 42 } };
		const boolName: Subject = { kind: 'authenticated', id: 'x', attributes: { display_name: true } };
		const nullName: Subject = { kind: 'authenticated', id: 'x', attributes: { display_name: null } };
		const objName: Subject = { kind: 'authenticated', id: 'x', attributes: { display_name: { name: 'Ada' } } };

		expect(subjectDisplayName(numeric)).toBeNull();
		expect(subjectDisplayName(boolName)).toBeNull();
		expect(subjectDisplayName(nullName)).toBeNull();
		expect(subjectDisplayName(objName)).toBeNull();
	});

	it('returns null when attributes.display_name is an empty string', () => {
		const empty: Subject = { kind: 'authenticated', id: 'x', attributes: { display_name: '' } };
		expect(subjectDisplayName(empty)).toBeNull();
	});

	it('returns display_name string when valid', () => {
		const direct: Subject = {
			kind: 'authenticated',
			id: 'x',
			attributes: { display_name: 'Ada Lovelace' }
		};
		expect(subjectDisplayName(direct)).toBe('Ada Lovelace');

		const fromSession = subjectFromSession(session);
		expect(subjectDisplayName(fromSession)).toBe('Booking Agent');
	});
});

describe('hasRole / hasAnyRole', () => {
	const subject = subjectFromSession(session);

	it('hasRole checks membership', () => {
		expect(hasRole(subject, 'agent')).toBe(true);
		expect(hasRole(subject, 'admin')).toBe(false);
		expect(hasRole(anonymousSubject, 'agent')).toBe(false);
	});

	it('hasAnyRole requires at least one match', () => {
		expect(hasAnyRole(subject, ['admin', 'customer'])).toBe(true);
		expect(hasAnyRole(subject, ['admin', 'owner'])).toBe(false);
		expect(hasAnyRole(anonymousSubject, ['agent'])).toBe(false);
	});

	it('hasAnyRole with an empty requirement means no restriction', () => {
		expect(hasAnyRole(subject, [])).toBe(true);
		expect(hasAnyRole(anonymousSubject, [])).toBe(true);
	});
});
