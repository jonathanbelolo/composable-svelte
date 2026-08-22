/**
 * The three selectors the collaborative UI reads through, which had no tests.
 *
 * `getCursorPositions` in particular had no caller either — the cursor pipeline
 * ran from the socket down to the reducer and stopped there. Wiring it into the
 * styleguide demo made it live for the first time; these pin what it returns.
 *
 * All three used to take `Map<string, any>`, which is how the `getActiveUsers`
 * defect below survived: `avatar` was written as an explicit `undefined` against
 * a declared `avatar?: string`, and under `exactOptionalPropertyTypes` those are
 * different things. `any` on the input made the mismatch unreachable by `tsc`.
 */

import { describe, it, expect } from 'vitest';
import {
	getCursorPositions,
	getActiveUsers,
	getTypingUsers
} from '../src/lib/streaming-chat/collaborative-hooks.js';
import type { CollaborativeUser } from '../src/lib/streaming-chat/collaborative-types.js';

function user(over: Partial<CollaborativeUser> & { id: string }): CollaborativeUser {
	return {
		name: `User ${over.id}`,
		color: '#ff0066',
		presence: 'active',
		typing: null,
		cursor: null,
		lastSeen: 0,
		...over
	};
}

const map = (...users: CollaborativeUser[]) => new Map(users.map((u) => [u.id, u]));

const AT_5 = { position: 5, selectionLength: 0, lastUpdate: 0 };

describe('getCursorPositions', () => {
	it('reports a collaborator who has a cursor', () => {
		const users = map(user({ id: 'me' }), user({ id: 'ada', cursor: AT_5 }));

		expect(getCursorPositions(users, 'me')).toEqual([
			{ userId: 'ada', name: 'User ada', color: '#ff0066', position: 5, selectionLength: 0 }
		]);
	});

	it('leaves me out — I already see my own caret', () => {
		const users = map(user({ id: 'me', cursor: AT_5 }));

		expect(getCursorPositions(users, 'me')).toEqual([]);
	});

	it('skips anyone whose cursor is not in the field', () => {
		// `clearCursor` nulls it on blur; a marker for a blurred user would be a
		// caret that never moves again.
		const users = map(user({ id: 'ada', cursor: null }));

		expect(getCursorPositions(users, 'me')).toEqual([]);
	});
});

describe('getActiveUsers', () => {
	it('omits the avatar key entirely when a user has no avatar', () => {
		// Not `{ avatar: undefined }`. The declared type says absent-or-string, and
		// a consumer testing `'avatar' in user` gets the wrong answer otherwise.
		const [ada] = getActiveUsers(map(user({ id: 'ada' })), 'me');

		expect(ada).toBeDefined();
		expect('avatar' in ada!).toBe(false);
	});

	it('keeps the avatar when there is one', () => {
		const [ada] = getActiveUsers(map(user({ id: 'ada', avatar: 'a.png' })), 'me');

		expect(ada!.avatar).toBe('a.png');
	});

	it('drops users who are offline', () => {
		const users = map(user({ id: 'ada', presence: 'offline' }), user({ id: 'bob' }));

		expect(getActiveUsers(users, 'me').map((u) => u.id)).toEqual(['bob']);
	});
});

describe('getTypingUsers', () => {
	it('reports only those typing at the requested target', () => {
		const users = map(
			user({ id: 'ada', typing: { target: 'message', startedAt: 0, lastUpdate: 0 } }),
			user({ id: 'bob', typing: { target: 'edit', startedAt: 0, lastUpdate: 0 } }),
			user({ id: 'cy' })
		);

		expect(getTypingUsers(users, 'me', 'message').map((u) => u.id)).toEqual(['ada']);
	});
});
