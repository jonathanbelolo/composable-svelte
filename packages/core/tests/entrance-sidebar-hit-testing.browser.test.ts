import {afterEach, expect, it, vi} from 'vitest';
import {mount, unmount, flushSync} from 'svelte';
import {userEvent} from 'vitest/browser';
import Fixture from './fixtures/EntranceHitTestingLayers.svelte';

const releases: Array<() => Promise<void>> = [];
afterEach(async () => { for (const release of releases.splice(0).reverse()) await release(); });

function setup(kind: 'modal' | 'sheet' | 'drawer' | 'alert' | 'popover' = 'modal') {
	const target = document.createElement('div');
	document.body.append(target);
	const requests = vi.fn();
	const app = mount(Fixture, {target, props: {kind, requests}});
	flushSync();
	releases.push(async () => { await unmount(app); target.remove(); });
	return {app, requests};
}

async function escape() {
	const event = new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true});
	document.dispatchEvent(event);
	flushSync();
	return event;
}

it('a presenting Sidebar receives Escape before inline navigation', async () => {
	const {app, requests} = setup();
	app.phaseSidebar('presenting');
	flushSync();
	const enteringEscape = await escape();
	expect(enteringEscape.defaultPrevented).toBe(true);
	expect(app.getNavigationBacks()).toBe(0);
	expect(requests.mock.calls).toEqual([['sidebar']]);
});

it('a dismissing Sidebar is preexisting ineligible and does not consume Escape', async () => {
	const {app, requests} = setup();
	app.hideNavigation();
	app.phaseSidebar('dismissing');
	flushSync();
	const exitingEscape = await escape();
	expect(exitingEscape.defaultPrevented).toBe(false);
	expect(app.getNavigationBacks()).toBe(0);
	expect(requests).not.toHaveBeenCalled();
});

it('an overlay above a presenting Sidebar retains Escape authority', async () => {
	const {app, requests} = setup('modal');
	app.phaseSidebar('presenting');
	app.phaseOverlay('presenting');
	flushSync();
	await escape();
	await vi.waitFor(() => expect(requests.mock.calls).toEqual([['overlay']]));
});

it.each(['modal', 'sheet', 'drawer', 'alert', 'popover'] as const)(
	'%s uses real hit-testing during entrance and retires pointer authority while dismissing',
	async (kind) => {
		const {app, requests} = setup(kind);
		app.phaseOverlay('presenting');
		flushSync();
		const x = window.innerWidth / 2;
		const y = window.innerHeight / 2;
		const enteringHit = document.elementFromPoint(x, y) as HTMLElement | null;
		expect(enteringHit?.closest('[data-hit-child]')).not.toBeNull();
		await userEvent.click(enteringHit!);
		expect(app.getClicks()).toEqual({child: 1, underlay: 0});
		expect(requests).not.toHaveBeenCalled();

		app.phaseOverlay('dismissing');
		flushSync();
		const exitingHit = document.elementFromPoint(x, y) as HTMLElement | null;
		expect(exitingHit?.closest('[data-underlay]')).not.toBeNull();
		await userEvent.click(exitingHit!);
		expect(app.getClicks()).toEqual({child: 1, underlay: 1});
		expect(requests).not.toHaveBeenCalled();
	}
);
