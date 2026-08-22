/**
 * `size` on the presence components resolved to nothing.
 *
 * Both `PresenceBadge` and `PresenceAvatarStack` map `size` to Tailwind classes
 * — `w-2 h-2`, `w-10 h-10` — in a package that has **no Tailwind**: no
 * dependency, no config, and no content glob that reaches it (core's
 * `contentGlob` resolves to core's own dist). All 25 chat components style
 * themselves with a scoped `<style>` block; these class strings were inert text.
 *
 * The result is worse than a wrong size:
 *
 * - `.presence-dot` declares a 2px opaque white border and no dimensions, so the
 *   box is 0×0 content plus that border. The status colour *is* applied, as an
 *   inline style — but `background-clip` defaults to `border-box`, so the border
 *   paints straight over it. Every status rendered as the same 4px white ring.
 * - `.avatar-image` is `width: 100%; height: 100%` of a parent with no size, so
 *   an avatar with a photo collapsed to 0×0 entirely. Initials-only avatars
 *   sized to their text, which is why the stack looked plausible.
 *
 * It is not masked in this repo's own styleguide either. `w-4`, `w-8`, `w-10`
 * and `w-12` happen to be emitted by styleguide sources and so get generated;
 * `w-2 h-2` and `w-3 h-3` — small and the **default** — are emitted by none.
 *
 * These are the first tests of either component.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PresenceBadge from '../src/lib/streaming-chat/collaborative-primitives/PresenceBadge.svelte';
import PresenceAvatarStack from '../src/lib/streaming-chat/collaborative-primitives/PresenceAvatarStack.svelte';
import PresenceList from '../src/lib/streaming-chat/collaborative-primitives/PresenceList.svelte';

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

function render(Component: unknown, props: Record<string, unknown>) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(Component as never, { target, props });
	flushSync();
	cleanup.push(() => {
		unmount(component);
		target.remove();
	});
	return target;
}

const dot = (t: HTMLElement) => t.querySelector('.presence-dot') as HTMLElement;

describe('PresenceBadge size', () => {
	it('produces a differently sized dot for each size', () => {
		const small = dot(render(PresenceBadge, { presence: 'active', size: 'sm' }));
		const large = dot(render(PresenceBadge, { presence: 'active', size: 'lg' }));

		const sw = small.getBoundingClientRect().width;
		const lw = large.getBoundingClientRect().width;

		// A paired discriminator: both must be real, and they must differ. Asserting
		// only "> 0" would pass on the broken version, whose 2px border alone gives
		// the box a non-zero width.
		expect(sw, `small was ${sw}px`).toBeGreaterThan(4);
		expect(lw, `large was ${lw}px`).toBeGreaterThan(sw);
	});

	it('shows the status colour rather than painting it under the border', () => {
		const el = dot(render(PresenceBadge, { presence: 'active', size: 'md' }));
		const box = el.getBoundingClientRect();

		// The content box must be bigger than the border that surrounds it, or the
		// colour has nowhere to show.
		const border = parseFloat(getComputedStyle(el).borderTopWidth) || 0;
		expect(box.width, 'the border covers the whole element').toBeGreaterThan(border * 2);
	});

	it('defaults to a visible size when none is passed', () => {
		// The default was `md` → `w-3 h-3`, which no Tailwind build in this repo
		// emits, so the default was the broken case.
		const el = dot(render(PresenceBadge, { presence: 'idle' }));
		expect(el.getBoundingClientRect().width).toBeGreaterThan(4);
	});
});

describe('PresenceAvatarStack size', () => {
	const users = [{ id: 'u1', name: 'Ada', color: '#f00', presence: 'active' as const }];

	it('gives the avatar real dimensions', () => {
		const target = render(PresenceAvatarStack, { users, size: 'md' });
		const avatar = target.querySelector('.avatar') as HTMLElement;

		expect(avatar.getBoundingClientRect().width).toBeGreaterThan(8);
	});

	it('scales with size', () => {
		const small = render(PresenceAvatarStack, { users, size: 'sm' });
		const large = render(PresenceAvatarStack, { users, size: 'lg' });

		const sw = (small.querySelector('.avatar') as HTMLElement).getBoundingClientRect().width;
		const lw = (large.querySelector('.avatar') as HTMLElement).getBoundingClientRect().width;

		expect(lw, `sm=${sw} lg=${lw}`).toBeGreaterThan(sw);
	});

	it('does not collapse an avatar that has a photo', () => {
		// `.avatar-image` is 100% of its parent. With no parent size that resolved
		// to 0×0 and the photo vanished entirely.
		const target = render(PresenceAvatarStack, {
			users: [{ ...users[0]!, avatar: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' }],
			size: 'md'
		});
		const img = target.querySelector('.avatar-image') as HTMLElement;

		expect(img, 'no avatar image rendered').not.toBeNull();
		expect(img.getBoundingClientRect().width).toBeGreaterThan(8);
	});
});

describe('PresenceList last seen', () => {
	// `CollaborativeUser.lastSeen` was written on every presence change and every
	// heartbeat, and read by nothing anywhere in the repo. It is consumer-readable
	// on an exported type, so it is a pass-through rather than dead state — this
	// gives it an in-package reader so that claim is honest.
	const base = { id: 'u1', name: 'Ada', color: '#f00' };

	it('shows it for a user who is not here', () => {
		const target = render(PresenceList, {
			users: [{ ...base, presence: 'away' as const, lastSeen: Date.now() - 5 * 60_000 }]
		});
		expect(target.textContent).toContain('Last seen');
	});

	it('stays quiet for an active user', () => {
		// "Last seen 2 minutes ago" beside an active badge is noise.
		const target = render(PresenceList, {
			users: [{ ...base, presence: 'active' as const, lastSeen: Date.now() - 5 * 60_000 }]
		});
		expect(target.textContent).not.toContain('Last seen');
	});

	it('stays quiet when the caller supplies no timestamp', () => {
		// The field is optional so existing callers keep compiling.
		const target = render(PresenceList, {
			users: [{ ...base, presence: 'offline' as const }]
		});
		expect(target.textContent).not.toContain('Last seen');
	});
});
