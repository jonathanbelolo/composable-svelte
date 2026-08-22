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
 * Not a fixed sleep, and not a single pass: finishing the 3s keyframe changes
 * `--label-opacity`, which *spawns* a 0.2s transition that did not exist a
 * moment earlier. The first draft of this test read the opacity between those
 * two and saw `1` — it passed on the broken component. Loop until only the
 * infinite caret blink is left.
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

		// `overflow: hidden` on the overlay scissors anything above its top edge,
		// and the flag deliberately sits above the caret it labels.
		expect(flag.top, `flag at ${flag.top}, overlay starts at ${box.top}`).toBeGreaterThanOrEqual(
			box.top
		);
		expect(flag.bottom).toBeLessThanOrEqual(box.bottom);
	});

	it('leaves the caret where the input actually puts it', () => {
		// The gutter added for the flag must not shift the caret: it is a readout
		// of a text position, and moving it by 24px makes it lie.
		const input = withInput();
		const target = render(CursorOverlay, {
			inputElement: input,
			cursors: CURSORS,
			text: input.value
		});
		flushSync();

		const line = target.querySelector('.cursor-line') as HTMLElement;
		const caret = line.getBoundingClientRect();
		const field = input.getBoundingClientRect();
		const padding = parseFloat(getComputedStyle(input).paddingTop);

		expect(caret.top).toBeCloseTo(field.top + padding, 0);
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

	it('lets pointer events reach the input beneath it', () => {
		// The whole reason hover is unavailable, and so the reason the flag has to
		// be always visible. If this ever inverts, typing breaks.
		const input = withInput();
		render(CursorOverlay, { inputElement: input, cursors: CURSORS, text: input.value });
		flushSync();

		const field = input.getBoundingClientRect();
		const hit = document.elementFromPoint(field.left + field.width / 2, field.top + field.height / 2);

		expect(hit).toBe(input);
	});
});
