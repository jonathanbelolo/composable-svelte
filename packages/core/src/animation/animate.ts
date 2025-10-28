/**
 * Animation utilities for Motion One.
 *
 * State-driven animation functions for all components.
 * All functions return Promise<void> and always resolve (even on error).
 *
 * @packageDocumentation
 */

import { animate } from 'motion';
import type { SpringConfig } from './spring-config';
import { springPresets, mergeSpringConfig } from './spring-config';

/**
 * Get resolved spring config (helper to satisfy TypeScript).
 */
function getSpringConfig(
	preset: Required<SpringConfig>,
	override?: Partial<SpringConfig>
): Required<SpringConfig> {
	const result = mergeSpringConfig(preset, override);
	// Explicit assertion to help TypeScript understand this is never undefined
	return result as Required<SpringConfig>;
}

// ============================================================================
// Modal Animations
// ============================================================================

/**
 * Animate modal in with scale + fade.
 */
export async function animateModalIn(
	element: HTMLElement,
	springConfig?: Partial<SpringConfig>
): Promise<void> {
	try {
		const config = getSpringConfig(springPresets.modal, springConfig);

		await animate(
			element,
			{
				opacity: [0, 1],
				scale: [0.95, 1]
			},
			{
				type: 'spring',
				visualDuration: config.visualDuration,
				bounce: config.bounce
			}
		).finished;

		// Wait for one more frame to ensure styles are applied
		await new Promise(resolve => requestAnimationFrame(resolve));
	} catch (error) {
		console.error('[animateModalIn] Animation failed:', error);
	}
}

/**
 * Animate modal out with scale + fade.
 */
export async function animateModalOut(
	element: HTMLElement,
	springConfig?: Partial<SpringConfig>
): Promise<void> {
	try {
		const config = getSpringConfig(springPresets.modal, springConfig);

		await animate(
			element,
			{
				opacity: [1, 0],
				scale: [1, 0.95]
			},
			{
				type: 'spring',
				visualDuration: config.visualDuration,
				bounce: config.bounce
			}
		).finished;

		// Wait for one more frame to ensure styles are applied
		await new Promise(resolve => requestAnimationFrame(resolve));
	} catch (error) {
		console.error('[animateModalOut] Animation failed:', error);
	}
}

/**
 * Animate backdrop in with fade.
 */
export async function animateBackdropIn(element: HTMLElement): Promise<void> {
	try {
		const config = getSpringConfig(springPresets.modal);

		await animate(
			element,
			{ opacity: [0, 1] },
			{
				type: 'spring',
				visualDuration: config.visualDuration,
				bounce: config.bounce
			}
		).finished;

		// Wait for one more frame to ensure styles are applied
		await new Promise(resolve => requestAnimationFrame(resolve));
	} catch (error) {
		console.error('[animateBackdropIn] Animation failed:', error);
	}
}

/**
 * Animate backdrop out with fade.
 */
export async function animateBackdropOut(element: HTMLElement): Promise<void> {
	try {
		const config = getSpringConfig(springPresets.modal);

		await animate(
			element,
			{ opacity: [1, 0] },
			{
				type: 'spring',
				visualDuration: config.visualDuration,
				bounce: config.bounce
			}
		).finished;

		// Wait for one more frame to ensure styles are applied
		await new Promise(resolve => requestAnimationFrame(resolve));
	} catch (error) {
		console.error('[animateBackdropOut] Animation failed:', error);
	}
}

// ============================================================================
// Sheet Animations
// ============================================================================

/**
 * Animate sheet in from edge.
 */
export async function animateSheetIn(
	element: HTMLElement,
	side: 'bottom' | 'left' | 'right' = 'bottom',
	springConfig?: Partial<SpringConfig>
): Promise<void> {
	try {
		const config = getSpringConfig(springPresets.sheet, springConfig);

		const transform =
			side === 'bottom'
				? { y: ['100%', '0%'] }
				: side === 'left'
					? { x: ['-100%', '0%'] }
					: { x: ['100%', '0%'] };

		await animate(
			element,
			{
				opacity: [0, 1],
				...transform
			},
			{
				type: 'spring',
				visualDuration: config.visualDuration,
				bounce: config.bounce
			}
		).finished;
	} catch (error) {
		console.error('[animateSheetIn] Animation failed:', error);
	}
}

/**
 * Animate sheet out to edge.
 */
export async function animateSheetOut(
	element: HTMLElement,
	side: 'bottom' | 'left' | 'right' = 'bottom',
	springConfig?: Partial<SpringConfig>
): Promise<void> {
	try {
		const config = getSpringConfig(springPresets.sheet, springConfig);

		const transform =
			side === 'bottom'
				? { y: ['0%', '100%'] }
				: side === 'left'
					? { x: ['0%', '-100%'] }
					: { x: ['0%', '100%'] };

		await animate(
			element,
			{
				opacity: [1, 0],
				...transform
			},
			{
				type: 'spring',
				visualDuration: config.visualDuration,
				bounce: config.bounce
			}
		).finished;
	} catch (error) {
		console.error('[animateSheetOut] Animation failed:', error);
	}
}

// ============================================================================
// Drawer Animations
// ============================================================================

/**
 * Animate drawer in from side.
 */
export async function animateDrawerIn(
	element: HTMLElement,
	side: 'left' | 'right' = 'left',
	springConfig?: Partial<SpringConfig>
): Promise<void> {
	try {
		const config = getSpringConfig(springPresets.drawer, springConfig);

		await animate(
			element,
			{
				opacity: [0, 1],
				x: [side === 'left' ? '-100%' : '100%', '0%']
			},
			{
				type: 'spring',
				visualDuration: config.visualDuration,
				bounce: config.bounce
			}
		).finished;
	} catch (error) {
		console.error('[animateDrawerIn] Animation failed:', error);
	}
}

/**
 * Animate drawer out to side.
 */
export async function animateDrawerOut(
	element: HTMLElement,
	side: 'left' | 'right' = 'left',
	springConfig?: Partial<SpringConfig>
): Promise<void> {
	try {
		const config = getSpringConfig(springPresets.drawer, springConfig);

		await animate(
			element,
			{
				opacity: [1, 0],
				x: ['0%', side === 'left' ? '-100%' : '100%']
			},
			{
				type: 'spring',
				visualDuration: config.visualDuration,
				bounce: config.bounce
			}
		).finished;
	} catch (error) {
		console.error('[animateDrawerOut] Animation failed:', error);
	}
}

// ============================================================================
// Alert Animations
// ============================================================================

/**
 * Animate alert in with subtle scale + fade.
 */
export async function animateAlertIn(
	element: HTMLElement,
	springConfig?: Partial<SpringConfig>
): Promise<void> {
	try {
		const config = getSpringConfig(springPresets.alert, springConfig);

		await animate(
			element,
			{
				opacity: [0, 1],
				scale: [0.98, 1]
			},
			{
				type: 'spring',
				visualDuration: config.visualDuration,
				bounce: config.bounce
			}
		).finished;
	} catch (error) {
		console.error('[animateAlertIn] Animation failed:', error);
	}
}

/**
 * Animate alert out with subtle scale + fade.
 */
export async function animateAlertOut(
	element: HTMLElement,
	springConfig?: Partial<SpringConfig>
): Promise<void> {
	try {
		const config = getSpringConfig(springPresets.alert, springConfig);

		await animate(
			element,
			{
				opacity: [1, 0],
				scale: [1, 0.98]
			},
			{
				type: 'spring',
				visualDuration: config.visualDuration,
				bounce: config.bounce
			}
		).finished;
	} catch (error) {
		console.error('[animateAlertOut] Animation failed:', error);
	}
}

// ============================================================================
// Tooltip Animations
// ============================================================================

/**
 * Animate tooltip in with subtle scale + fade (very fast).
 */
export async function animateTooltipIn(
	element: HTMLElement,
	springConfig?: Partial<SpringConfig>
): Promise<void> {
	try {
		const config = getSpringConfig(springPresets.tooltip, springConfig);

		await animate(
			element,
			{
				opacity: [0, 1],
				scale: [0.95, 1]
			},
			{
				type: 'spring',
				visualDuration: config.visualDuration,
				bounce: config.bounce
			}
		).finished;
	} catch (error) {
		console.error('[animateTooltipIn] Animation failed:', error);
	}
}

/**
 * Animate tooltip out with fade (no scale for faster exit).
 */
export async function animateTooltipOut(element: HTMLElement): Promise<void> {
	try {
		const config = getSpringConfig(springPresets.tooltip);

		await animate(
			element,
			{
				opacity: [1, 0]
			},
			{
				type: 'spring',
				visualDuration: config.visualDuration * 0.7, // Faster exit
				bounce: 0
			}
		).finished;
	} catch (error) {
		console.error('[animateTooltipOut] Animation failed:', error);
	}
}
