/**
 * The collaborator's name was in the DOM and never on the screen.
 *
 * `CursorMarker` renders a coloured caret plus a flag carrying the user's name.
 * The flag was invisible, for four independent reasons stacked in twenty lines
 * of CSS — and `CursorOverlay`, the only thing that renders a marker, had never
 * been mounted anywhere in this repo's history, which is how they accumulated:
 *
 * 1. `.cursor-label` was `opacity: 0`, lifted only by `--label-opacity`, driven
 *    only by a 3s `cursor-label-show` keyframe. Neither `.cursor-marker` rule
 *    set `animation-fill-mode`, so it defaults to `none`: once the animation
 *    finished it contributed nothing, `var(--label-opacity, 0)` fell back to
 *    `0`, and the flag went dark permanently.
 * 2. `--label-opacity` is registered nowhere — no `@property`, no
 *    `CSS.registerProperty` — so it could not interpolate anyway. That decides
 *    only whether the flag showed for the first three seconds or never.
 * 3. `.cursor-marker:hover .cursor-label` could never match: `pointer-events:
 *    none` sits on the marker *and* on the overlay above it. The same `none`
 *    killed the `title={name}` tooltip — a third dead behaviour in the same
 *    rule. Hover is unavailable **by design** here: the overlay floats over a
 *    live text input, and intercepting pointer events would stop typing. So the
 *    label is simply always visible, and `title` is gone.
 * 4. Two `.cursor-marker` rules of equal specificity, the later one wholly
 *    overriding the earlier's `animation` shorthand.
 *
 * And a fifth found while testing: `.cursor-overlay` clips with `overflow:
 * hidden` while the flag deliberately sits *above* the caret (`top: -24px`; the
 * squared-off bottom-left corner is the tail pointing down at it). Fixing every
 * opacity in the file would still have left the flag scissored off by its own
 * parent. The overlay now reserves a gutter for it.
 *
 * The first test is the discriminating one, and the one that would have caught
 * the original: finish every animation on the marker — the state three seconds
 * in — and the label must still be readable. On the old file it reads `0`.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import CursorMarker from '../src/lib/streaming-chat/collaborative-primitives/CursorMarker.svelte';
import CursorOverlay from '../src/lib/streaming-chat/collaborative-primitives/CursorOverlay.svelte';

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

/**
 * Run every finite animation and transition in `root` to its end.
 *
 * On the shipped component this returns on the first pass, because the only
 * animation left is the infinite caret blink and the helper skips those. That is
 * the point: it has work to do exactly when something has regressed, and the
 * regression it was written against needed two passes, not one — finishing the
 * 3s keyframe changed `--label-opacity`, which *spawned* a 0.2s transition that
 * did not exist a moment earlier. The first draft read the opacity between those
 * two and saw `1`, passing on the broken component.
 */
async function settleAnimations(root: Element) {
	for (let pass = 0; pass < 5; pass += 1) {
		const finite = root
			.getAnimations({ subtree: true })
			.filter((a) => (a.effect?.getComputedTiming().iterations ?? 1) !== Infinity);
		if (finite.length === 0) return;
		for (const animation of finite) animation.finish();
		await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
	}
	throw new Error('animations never settled');
}

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

const MARKER_PROPS = { name: 'Ada Lovelace', color: '#ff0066', left: 40, top: 8 };

describe('CursorMarker', () => {
	it('still names the collaborator once every animation has run out', async () => {
		const target = render(CursorMarker, MARKER_PROPS);
		const marker = target.querySelector('.cursor-marker') as HTMLElement;
		const label = target.querySelector('.cursor-label') as HTMLElement;

		// The page three seconds in, without waiting three seconds.
		await settleAnimations(marker);

		expect(label.textContent?.trim()).toBe('Ada Lovelace');
		expect(getComputedStyle(label).opacity, 'the name faded out and never came back').toBe('1');
	});

	it('appears immediately rather than fading in', () => {
		// A cursor marker is a live readout of where someone is typing. A 0.2s
		// entrance is latency, not polish.
		const target = render(CursorMarker, MARKER_PROPS);
		const marker = target.querySelector('.cursor-marker') as HTMLElement;

		expect(getComputedStyle(marker).opacity).toBe('1');
		expect(marker.getAnimations(), 'the marker still animates itself').toHaveLength(0);
		// `title` was the third dead behaviour here: `pointer-events: none` means
		// no native tooltip can ever open, so re-adding one would be a promise the
		// component cannot keep.
		expect(marker.hasAttribute('title')).toBe(false);
	});

	it('keeps the caret blinking', () => {
		// The one animation here that is allowed to stay: it repeats forever with
		// no state input. Deleting it would be over-correction, so pin it.
		const target = render(CursorMarker, MARKER_PROPS);
		const line = target.querySelector('.cursor-line') as HTMLElement;
		const style = getComputedStyle(line);

		// Svelte prefixes the keyframe name with the component's scope hash.
		expect(style.animationName).toContain('cursor-blink');
		expect(style.animationIterationCount).toBe('infinite');
	});
});

describe('CursorOverlay', () => {
	function withInput() {
		// Deliberately an `<input>`: the overlay measures a single line, and says
		// so. A wrapping textarea would put every caret on the first line.
		const input = document.createElement('input');
		input.type = 'text';
		input.value = 'hello world';
		input.style.cssText =
			'position: fixed; left: 100px; top: 200px; width: 300px; height: 60px; padding: 8px; font-size: 14px; box-sizing: border-box;';
		document.body.appendChild(input);
		cleanup.push(() => input.remove());
		return input;
	}

	const CURSORS = [
		{ userId: 'u2', name: 'Ada Lovelace', color: '#ff0066', position: 5, selectionLength: 0 }
	];

	it('places the caret at the text, not at the border', () => {
		// Two things at once: the 24px gutter added for the flag must shift no
		// caret — it is a readout of a text position, and moving it makes it lie —
		// and the offset must count the border. The overlay is positioned from
		// `getBoundingClientRect()`, a border box, while the caret offset is
		// measured from where the text starts; leaving the border out puts every
		// marker one border-width off on both axes, which a border-less fixture
		// cannot see.
		const input = withInput();
		input.style.border = '5px solid black';

		const target = render(CursorOverlay, {
			inputElement: input,
			cursors: [{ ...CURSORS[0]!, position: 0 }],
			text: input.value
		});
		flushSync();

		const caret = (target.querySelector('.cursor-line') as HTMLElement).getBoundingClientRect();
		const field = input.getBoundingClientRect();
		const style = getComputedStyle(input);
		const insetLeft = parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
		const insetTop = parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop);

		expect(caret.left).toBeCloseTo(field.left + insetLeft, 0);
		expect(caret.top).toBeCloseTo(field.top + insetTop, 0);
	});

	it('renders the name flag inside its own clipping box', () => {
		const input = withInput();
		const target = render(CursorOverlay, {
			inputElement: input,
			cursors: CURSORS,
			text: input.value
		});
		flushSync();

		const overlay = target.querySelector('.cursor-overlay') as HTMLElement;
		const label = target.querySelector('.cursor-label') as HTMLElement;
		expect(label, 'no marker rendered at all').not.toBeNull();

		const box = overlay.getBoundingClientRect();
		const flag = label.getBoundingClientRect();

		// Two halves, and the first is the one a previous draft left out: the
		// gutter exists *because* the overlay clips, so a test that only measures
		// geometry passes with `overflow: hidden` deleted — and then the clip the
		// mechanism works around is unpinned.
		expect(getComputedStyle(overlay).overflow, 'the overlay stopped clipping').toBe('hidden');

		expect(flag.top, `flag at ${flag.top}, overlay starts at ${box.top}`).toBeGreaterThanOrEqual(
			box.top
		);
		expect(flag.bottom).toBeLessThanOrEqual(box.bottom);
	});

	it('follows the field when it scrolls sideways', () => {
		// Offsets are measured from the start of the *text*; the field shows a
		// window onto it. Type past the right edge and the two diverge, so every
		// flag ends up pointing at the wrong character.
		const input = withInput();
		input.value = 'the quick brown fox jumps over the lazy dog and keeps on running';
		input.style.width = '80px';

		const target = render(CursorOverlay, {
			inputElement: input,
			cursors: [{ ...CURSORS[0]!, position: 30 }],
			text: input.value
		});
		flushSync();

		const before = (target.querySelector('.cursor-line') as HTMLElement).getBoundingClientRect()
			.left;

		input.scrollLeft = 40;
		input.dispatchEvent(new Event('scroll'));
		flushSync();

		const after = (target.querySelector('.cursor-line') as HTMLElement).getBoundingClientRect()
			.left;

		expect(input.scrollLeft, 'the field did not actually scroll').toBeGreaterThan(0);
		expect(before - after).toBeCloseTo(input.scrollLeft, 0);
	});

	it('lets pointer events reach the input through the marker itself', () => {
		// The whole reason hover is unavailable, and so the reason the flag has to
		// be always visible. If this ever inverts, typing breaks.
		//
		// The sample points matter more than the assertion does. An earlier draft
		// probed the centre of the field — where no marker has ever been — so it
		// proved only that the overlay is transparent, and `pointer-events: auto`
		// on `.cursor-marker` passed every test in this file. Probe the caret and
		// the flag, the two places a marker actually occupies.
		const input = withInput();
		const target = render(CursorOverlay, {
			inputElement: input,
			cursors: CURSORS,
			text: input.value
		});
		flushSync();

		const centre = (el: Element) => {
			const r = el.getBoundingClientRect();
			return [r.left + r.width / 2, r.top + r.height / 2] as const;
		};

		const caret = target.querySelector('.cursor-line')!;
		const flag = target.querySelector('.cursor-label')!;

		expect(document.elementFromPoint(...centre(caret)), 'the caret swallows clicks').toBe(input);
		// The flag hangs in the gutter above the field, so the element beneath it
		// is the page, not the input — what matters is that it is not the flag.
		expect(document.elementFromPoint(...centre(flag))).not.toBe(flag);
	});
});
