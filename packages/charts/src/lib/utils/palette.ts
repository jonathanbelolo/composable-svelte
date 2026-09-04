/**
 * @file palette.ts
 * The colours and opacities the chart marks draw with, in one place so they can
 * be measured.
 *
 * These were scattered as literals across five builders, and measuring them
 * showed the default state of every scatter chart sitting at **2.41:1** against
 * white — below the 3:1 that WCAG 2.1 SC 1.4.11 (Non-text Contrast) asks of
 * graphical objects needed to understand the content. Dimmed points were at
 * 1.26:1, which is invisible rather than de-emphasised.
 *
 * `tests/contrast.test.ts` recomputes the ratios from these exact constants
 * against both a white and a near-black background, so the numbers below cannot
 * drift from the ones that were measured.
 *
 * **Why the colour did not change.** Darker blues score better on white and
 * worse on dark — `#1d4ed8` reaches 6.70:1 on white and only 2.95:1 on
 * near-black, and every candidate below it fails dark outright. `#3b82f6` is the
 * one that clears 3:1 on both (3.68:1 and 5.38:1), so the fix was the opacities,
 * not the hue.
 */

/** The default mark colour, used when the caller supplies no `color`. */
export const DATA_COLOR = '#3b82f6';

/**
 * Data marks draw at full strength.
 *
 * Was `0.7` for scatter dots and `0.8` for bars, which put both below 3:1 in the
 * ordinary case where nothing is selected at all.
 */
export const DATA_OPACITY = 1;

/**
 * How far an unselected mark is dimmed while something else is selected.
 *
 * Was `0.2`. The measured floor is `0.86` — below that, `#3b82f6` on white drops
 * under 3:1 — so this is dimming taken exactly as far as it can go and no
 * further. It is a small visual difference, and that is the point: the selection
 * is carried by `selectionMark`, which *adds* a filled dot and a dark outline,
 * rather than by suppressing everything else until it disappears.
 *
 * Emphasis by addition survives a user who cannot see a 14% opacity step.
 */
export const DIMMED_OPACITY = 0.86;

/**
 * Decorative fills, held to no contrast minimum, and the reasoning for that.
 *
 * SC 1.4.11 covers graphics "required to understand the content". In both cases
 * below the information is carried at full strength by something else, so these
 * are reinforcement rather than the content:
 *
 * - The area chart's translucent fill sits under a 2px line of the same colour
 *   at full opacity, and the line is what describes the series.
 * - Grid lines assist reading a position that the axis labels state exactly.
 *
 * Recorded here rather than left implicit, because "we did not measure it" and
 * "we measured it and it is out of scope" look identical from the outside.
 */
export const AREA_FILL_OPACITY = 0.3;
export const GRID_COLOR = '#e5e7eb';
export const GRID_OPACITY = 0.5;

/**
 * The ink used to mark state rather than data: the focus ring, and the outline
 * on a selected point.
 *
 * `currentColor`, not `#000`. Black scores 21:1 on white and **1.02:1** on a
 * near-black background — a focus ring that vanishes in dark mode, which is
 * worse than no ring at all because the keyboard cursor is then unlocatable for
 * exactly the users most likely to be relying on it. `currentColor` inherits the
 * app's own text colour, so it is dark on light and light on dark by
 * construction, the same reasoning as the `:focus-visible` outline in
 * `Chart.svelte`.
 *
 * The cost is that this cannot be measured from a constant, because it depends
 * on the consuming app's text colour. That is the correct trade: an app whose
 * text fails contrast against its own background has a larger problem than its
 * charts.
 */
export const MARKER_INK = 'currentColor';
