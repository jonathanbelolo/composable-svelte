/**
 * The chart palette, measured rather than asserted.
 *
 * The README used to say colour contrast was "unreviewed", which was true and
 * is a strange thing for a package to publish about itself. Reviewing it found
 * that the **default** state of every scatter chart — nothing selected, nothing
 * focused — sat at 2.41:1 against white, under the 3:1 that WCAG 2.1 SC 1.4.11
 * (Non-text Contrast) asks of graphical objects needed to understand the
 * content. Dimmed points were at 1.26:1, which is not de-emphasis but erasure.
 *
 * This file recomputes the ratios from the exported constants, so the numbers in
 * `palette.ts` cannot drift from the ones that were measured, and a future
 * "let's soften that a little" fails here instead of shipping.
 *
 * Two backgrounds, because a chart is drawn on whatever the app provides and the
 * two pull in opposite directions: darker blues score better on white and worse
 * on near-black. `#3b82f6` is kept precisely because it is the one that clears
 * 3:1 on both.
 *
 * `MARKER_INK` is deliberately absent from the numeric arms — it is
 * `currentColor`, which has no value to measure here. That is the point of it:
 * `#000` scores 21:1 on white and 1.02:1 on near-black, so a fixed ink would
 * make the keyboard focus ring vanish in dark mode for exactly the users most
 * likely to need it.
 */

import { describe, it, expect } from 'vitest';
import {
	DATA_COLOR,
	DATA_OPACITY,
	DIMMED_OPACITY,
	MARKER_INK
} from '../src/lib/utils/palette';

/** WCAG 2.x relative luminance. */
const channel = (v: number) => {
	const s = v / 255;
	return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]: number[]) =>
	0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!);

const contrast = (a: number[], b: number[]) => {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi! + 0.05) / (lo! + 0.05);
};

const parse = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Alpha compositing: what the eye actually receives for a translucent mark. */
const over = (fg: number[], alpha: number, bg: number[]) =>
	fg.map((c, i) => alpha * c + (1 - alpha) * bg[i]!);

const WHITE = [255, 255, 255];
const NEAR_BLACK = parse('#0a0a0a');
const BACKGROUNDS: Array<[string, number[]]> = [
	['white', WHITE],
	['near-black', NEAR_BLACK]
];

/** SC 1.4.11 Non-text Contrast. */
const MINIMUM = 3;

describe('the measuring itself is right', () => {
	it('reproduces the reference ratios WCAG gives', () => {
		// Non-vacuity for every arm below: if `contrast` were wrong, the
		// thresholds would be meaningless in either direction. Black on white is
		// 21:1 and a colour against itself is 1:1, both exactly.
		expect(contrast([0, 0, 0], WHITE)).toBeCloseTo(21, 5);
		expect(contrast(WHITE, WHITE)).toBeCloseTo(1, 5);
	});

	it('composites alpha towards the background', () => {
		const half = over(parse(DATA_COLOR), 0.5, WHITE);
		const full = over(parse(DATA_COLOR), 1, WHITE);
		expect(contrast(half, WHITE)).toBeLessThan(contrast(full, WHITE));
		expect(over(parse(DATA_COLOR), 0, WHITE)).toEqual(WHITE);
	});
});

describe.each(BACKGROUNDS)('data marks on %s', (_name, bg) => {
	it('clear 3:1 at full strength', () => {
		expect(contrast(over(parse(DATA_COLOR), DATA_OPACITY, bg), bg)).toBeGreaterThanOrEqual(
			MINIMUM
		);
	});

	it('still clear 3:1 while dimmed behind a selection', () => {
		// The arm that matters most, and the one that used to fail hardest: a
		// point dimmed out of reach is data the user cannot get to.
		expect(contrast(over(parse(DATA_COLOR), DIMMED_OPACITY, bg), bg)).toBeGreaterThanOrEqual(
			MINIMUM
		);
	});
});

describe('the dimming is as far as it can go', () => {
	it('sits within a hair of the floor on the tighter background', () => {
		// Dimming is useful, so it is taken to the limit rather than abandoned —
		// but not past it. If someone raises DIMMED_OPACITY well above the floor
		// the dimming has quietly stopped happening, and this says so.
		const ratio = contrast(over(parse(DATA_COLOR), DIMMED_OPACITY, WHITE), WHITE);
		expect(ratio).toBeGreaterThanOrEqual(MINIMUM);
		expect(ratio).toBeLessThan(MINIMUM + 0.5);
	});

	it('would fail one step lower, so the floor is real', () => {
		// Proves the constant is at a boundary rather than merely somewhere safe.
		expect(
			contrast(over(parse(DATA_COLOR), DIMMED_OPACITY - 0.1, WHITE), WHITE)
		).toBeLessThan(MINIMUM);
	});
});

describe('state markers adapt to the background', () => {
	it('use currentColor rather than a fixed ink', () => {
		// Asserted as an identity, not a ratio, because the whole point is that
		// there is no fixed value to measure. A regression to '#000' would leave
		// the focus ring at 1.02:1 in dark mode.
		expect(MARKER_INK).toBe('currentColor');
	});

	it('records what a fixed black ink would have cost', () => {
		expect(contrast(parse('#000000'), WHITE)).toBeGreaterThan(20);
		expect(contrast(parse('#000000'), NEAR_BLACK)).toBeLessThan(1.1);
	});
});
