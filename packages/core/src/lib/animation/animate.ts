/**
 * Animation utilities for Motion One.
 *
 * State-driven animation functions for all components.
 * All functions return Promise<void> and always resolve (even on error).
 *
 * @packageDocumentation
 */

import { animate as motionAnimate } from 'motion';
import type { SpringConfig } from './spring-config';
import { springPresets, mergeSpringConfig } from './spring-config';

// Re-export animate for use in components
export { motionAnimate as animate };

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
 * Preserves CSS translate(-50%, -50%) for centering by composing transforms.
 */
export async function animateModalIn(
	element: HTMLElement,
	springConfig?: Partial<SpringConfig>
): Promise<void> {
	try {
		const config = getSpringConfig(springPresets.modal, springConfig);

		await motionAnimate(
			element,
			{
				opacity: [0, 1],
				scale: [0.95, 1],
				// Compose with the centering translate
				transform: [
					'translate(-50%, -50%) scale(0.95)',
					'translate(-50%, -50%) scale(1)'
				]
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
 * Preserves CSS translate(-50%, -50%) for centering by composing transforms.
 */
export async function animateModalOut(
	element: HTMLElement,
	springConfig?: Partial<SpringConfig>
): Promise<void> {
	try {
		const config = getSpringConfig(springPresets.modal, springConfig);

		await motionAnimate(
			element,
			{
				opacity: [1, 0],
				scale: [1, 0.95],
				// Compose with the centering translate
				transform: [
					'translate(-50%, -50%) scale(1)',
					'translate(-50%, -50%) scale(0.95)'
				]
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

		await motionAnimate(
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

		await motionAnimate(
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

		await motionAnimate(
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

		await motionAnimate(
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

		await motionAnimate(
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

		await motionAnimate(
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
 * Preserves CSS translate(-50%, -50%) for centering by composing transforms.
 */
export async function animateAlertIn(
	element: HTMLElement,
	springConfig?: Partial<SpringConfig>
): Promise<void> {
	try {
		const config = getSpringConfig(springPresets.alert, springConfig);

		await motionAnimate(
			element,
			{
				opacity: [0, 1],
				// Compose with the centering translate
				transform: [
					'translate(-50%, -50%) scale(0.98)',
					'translate(-50%, -50%) scale(1)'
				]
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
		console.error('[animateAlertIn] Animation failed:', error);
	}
}

/**
 * Animate alert out with subtle scale + fade.
 * Preserves CSS translate(-50%, -50%) for centering by composing transforms.
 */
export async function animateAlertOut(
	element: HTMLElement,
	springConfig?: Partial<SpringConfig>
): Promise<void> {
	try {
		const config = getSpringConfig(springPresets.alert, springConfig);

		await motionAnimate(
			element,
			{
				opacity: [1, 0],
				// Compose with the centering translate
				transform: [
					'translate(-50%, -50%) scale(1)',
					'translate(-50%, -50%) scale(0.98)'
				]
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

		await motionAnimate(
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

		await motionAnimate(
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

// ============================================================================
// Toast Animations
// ============================================================================

/**
 * Animate toast in with scale + fade + slide.
 */
export async function animateToastIn(
	element: HTMLElement,
	springConfig?: Partial<SpringConfig>
): Promise<void> {
	try {
		const config = getSpringConfig(springPresets.toast, springConfig);

		await motionAnimate(
			element,
			{
				opacity: [0, 1],
				scale: [0.95, 1],
				y: [8, 0]
			},
			{
				type: 'spring',
				visualDuration: config.visualDuration,
				bounce: config.bounce
			}
		).finished;
	} catch (error) {
		console.error('[animateToastIn] Animation failed:', error);
	}
}

/**
 * Animate toast out with scale + fade.
 */
export async function animateToastOut(
	element: HTMLElement,
	springConfig?: Partial<SpringConfig>
): Promise<void> {
	try {
		const config = getSpringConfig(springPresets.toast, springConfig);

		await motionAnimate(
			element,
			{
				opacity: [1, 0],
				scale: [1, 0.95]
			},
			{
				type: 'spring',
				visualDuration: config.visualDuration * 0.7, // Faster exit
				bounce: 0
			}
		).finished;
	} catch (error) {
		console.error('[animateToastOut] Animation failed:', error);
	}
}

// ============================================================================
// Dropdown Animations (Combobox, Select, etc.)
// ============================================================================

/**
 * Animate dropdown/popover in with scale + fade + subtle slide.
 *
 * @param element - The dropdown element to animate
 * @returns Promise that resolves when animation completes (or fails gracefully)
 */
export async function animateDropdownIn(element: HTMLElement): Promise<void> {
	try {
		const config = getSpringConfig(springPresets.tooltip); // Fast like tooltip

		await motionAnimate(
			element,
			{
				opacity: [0, 1],
				scale: [0.95, 1],
				y: [-4, 0]
			},
			{
				type: 'spring',
				visualDuration: config.visualDuration,
				bounce: config.bounce
			}
		).finished;
	} catch (error) {
		console.error('[animateDropdownIn] Animation failed:', error);
		// Ensure element is visible even if animation fails
		if (element) {
			element.style.opacity = '1';
			element.style.transform = 'scale(1) translateY(0)';
		}
	}
}

/**
 * Animate dropdown/popover out with fade (fast exit).
 *
 * @param element - The dropdown element to animate
 * @returns Promise that resolves when animation completes (or fails gracefully)
 */
export async function animateDropdownOut(element: HTMLElement): Promise<void> {
	try {
		const config = getSpringConfig(springPresets.tooltip);

		await motionAnimate(
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
		console.error('[animateDropdownOut] Animation failed:', error);
		// Ensure element is hidden even if animation fails
		if (element) {
			element.style.opacity = '0';
		}
	}
}

// ============================================================================
// Sidebar Animations
// ============================================================================

/**
 * Animate sidebar expand (GPU-accelerated with transform + margin).
 *
 * Uses hybrid approach:
 * - Fixed width with overflow: hidden
 * - Margin for layout changes (cheap reflows)
 * - Transform for GPU-accelerated visual smoothness
 */
export async function animateSidebarExpand(
	element: HTMLElement,
	targetWidth: string,
	springConfig?: Partial<SpringConfig>,
	side: 'left' | 'right' = 'left'
): Promise<void> {
	try {
		const config = getSpringConfig(springPresets.drawer, springConfig);

		// Set fixed width and overflow
		element.style.width = targetWidth;
		element.style.overflow = 'hidden';

		// Determine margin property and transform direction
		const marginProp = side === 'left' ? 'marginLeft' : 'marginRight';
		const translateStart = side === 'left' ? '-100%' : '100%';

		// Set initial hidden state
		element.style[marginProp] = `-${targetWidth}`;
		element.style.transform = `translateX(${translateStart})`;

		// Animate margin (layout) and transform (visual) together
		await motionAnimate(
			element,
			{
				[marginProp]: [`-${targetWidth}`, '0px'],
				x: [translateStart, '0%']
			},
			{
				type: 'spring',
				visualDuration: config.visualDuration,
				bounce: config.bounce
			}
		).finished;

		// Clean up overflow
		element.style.overflow = 'visible';
	} catch (error) {
		console.error('[animateSidebarExpand] Animation failed:', error);
		// Ensure element is visible even if animation fails
		if (element) {
			element.style.width = targetWidth;
			const marginProp = side === 'left' ? 'marginLeft' : 'marginRight';
			element.style[marginProp] = '0px';
			element.style.transform = 'translateX(0)';
			element.style.overflow = 'visible';
		}
	}
}

/**
 * Animate sidebar collapse (GPU-accelerated with transform + margin).
 */
export async function animateSidebarCollapse(
	element: HTMLElement,
	currentWidth: string,
	springConfig?: Partial<SpringConfig>,
	side: 'left' | 'right' = 'left'
): Promise<void> {
	try {
		const config = getSpringConfig(springPresets.drawer, springConfig);

		// Ensure overflow is hidden during animation
		element.style.overflow = 'hidden';

		// Determine margin property and transform direction
		const marginProp = side === 'left' ? 'marginLeft' : 'marginRight';
		const translateEnd = side === 'left' ? '-100%' : '100%';

		// Animate margin (layout) and transform (visual) together
		await motionAnimate(
			element,
			{
				[marginProp]: ['0px', `-${currentWidth}`],
				x: ['0%', translateEnd]
			},
			{
				type: 'spring',
				visualDuration: config.visualDuration,
				bounce: config.bounce
			}
		).finished;
	} catch (error) {
		console.error('[animateSidebarCollapse] Animation failed:', error);
		// Ensure element is hidden even if animation fails
		if (element) {
			const marginProp = side === 'left' ? 'marginLeft' : 'marginRight';
			element.style[marginProp] = `-${currentWidth}`;
			element.style.transform = `translateX(${side === 'left' ? '-100%' : '100%'})`;
		}
	}
}

// ============================================================================
// Popover Animations
// ============================================================================

/**
 * Animate popover in with subtle scale + fade.
 * Preserves positioning transforms (translateX/translateY) by composing them.
 */
export async function animatePopoverIn(
	element: HTMLElement,
	positionTransform: string = '',
	springConfig?: Partial<SpringConfig>
): Promise<void> {
	try {
		const config = getSpringConfig(springPresets.popover, springConfig);

		// Compose positioning transform with scale
		const transformFrom = positionTransform ? `${positionTransform} scale(0.96)` : 'scale(0.96)';
		const transformTo = positionTransform ? `${positionTransform} scale(1)` : 'scale(1)';

		await motionAnimate(
			element,
			{
				opacity: [0, 1],
				transform: [transformFrom, transformTo]
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
		console.error('[animatePopoverIn] Animation failed:', error);
	}
}

/**
 * Animate popover out with subtle scale + fade.
 * Preserves positioning transforms (translateX/translateY) by composing them.
 */
export async function animatePopoverOut(
	element: HTMLElement,
	positionTransform: string = '',
	springConfig?: Partial<SpringConfig>
): Promise<void> {
	try {
		const config = getSpringConfig(springPresets.popover, springConfig);

		// Compose positioning transform with scale
		const transformFrom = positionTransform ? `${positionTransform} scale(1)` : 'scale(1)';
		const transformTo = positionTransform ? `${positionTransform} scale(0.96)` : 'scale(0.96)';

		await motionAnimate(
			element,
			{
				opacity: [1, 0],
				transform: [transformFrom, transformTo]
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
		console.error('[animatePopoverOut] Animation failed:', error);
	}
}

// ============================================================================
// NavigationStack Animations (iOS-style slide transitions)
// ============================================================================

/**
 * Animate new screen sliding in from right (push animation).
 *
 * Used when pushing a new screen onto the navigation stack.
 * New screen slides in from 100% right to 0%.
 */
export async function animateStackPushIn(
	element: HTMLElement,
	springConfig?: Partial<SpringConfig>
): Promise<void> {
	try {
		const config = getSpringConfig(springPresets.drawer, springConfig);

		await motionAnimate(
			element,
			{
				opacity: [0, 1],
				x: ['100%', '0%']
			},
			{
				type: 'spring',
				visualDuration: config.visualDuration,
				bounce: config.bounce
			}
		).finished;
	} catch (error) {
		console.error('[animateStackPushIn] Animation failed:', error);
		// Ensure element is visible even if animation fails
		if (element) {
			element.style.opacity = '1';
			element.style.transform = 'translateX(0)';
		}
	}
}

/**
 * Animate previous screen sliding out to left (push animation background).
 *
 * Used when pushing a new screen - the previous screen slides slightly to the left
 * to create a depth effect, similar to iOS navigation.
 */
export async function animateStackPushOut(
	element: HTMLElement,
	springConfig?: Partial<SpringConfig>
): Promise<void> {
	try {
		const config = getSpringConfig(springPresets.drawer, springConfig);

		await motionAnimate(
			element,
			{
				opacity: [1, 0.7],
				x: ['0%', '-30%']
			},
			{
				type: 'spring',
				visualDuration: config.visualDuration,
				bounce: config.bounce
			}
		).finished;
	} catch (error) {
		console.error('[animateStackPushOut] Animation failed:', error);
		// Ensure element state even if animation fails
		if (element) {
			element.style.opacity = '0.7';
			element.style.transform = 'translateX(-30%)';
		}
	}
}

/**
 * Animate current screen sliding out to right (pop animation).
 *
 * Used when popping the current screen from the navigation stack.
 * Current screen slides from 0% to 100% right.
 */
export async function animateStackPopOut(
	element: HTMLElement,
	springConfig?: Partial<SpringConfig>
): Promise<void> {
	try {
		const config = getSpringConfig(springPresets.drawer, springConfig);

		await motionAnimate(
			element,
			{
				opacity: [1, 0],
				x: ['0%', '100%']
			},
			{
				type: 'spring',
				visualDuration: config.visualDuration,
				bounce: config.bounce
			}
		).finished;
	} catch (error) {
		console.error('[animateStackPopOut] Animation failed:', error);
		// Ensure element is hidden even if animation fails
		if (element) {
			element.style.opacity = '0';
			element.style.transform = 'translateX(100%)';
		}
	}
}

/**
 * Animate previous screen sliding in from left (pop animation background).
 *
 * Used when popping - the previous screen slides in from the left
 * (reverses the push-out animation).
 */
export async function animateStackPopIn(
	element: HTMLElement,
	springConfig?: Partial<SpringConfig>
): Promise<void> {
	try {
		const config = getSpringConfig(springPresets.drawer, springConfig);

		await motionAnimate(
			element,
			{
				opacity: [0.7, 1],
				x: ['-30%', '0%']
			},
			{
				type: 'spring',
				visualDuration: config.visualDuration,
				bounce: config.bounce
			}
		).finished;
	} catch (error) {
		console.error('[animateStackPopIn] Animation failed:', error);
		// Ensure element is visible even if animation fails
		if (element) {
			element.style.opacity = '1';
			element.style.transform = 'translateX(0)';
		}
	}
}

// ============================================================================
// Accordion/Collapsible Animations
// ============================================================================

/**
 * Animate accordion/collapsible content expand with height + fade.
 *
 * @param element - The content element to animate
 * @returns Promise that resolves when animation completes (or fails gracefully)
 */
export async function animateAccordionExpand(element: HTMLElement): Promise<void> {
	try {
		// Set initial state
		element.style.height = '0px';
		element.style.overflow = 'hidden';
		element.style.opacity = '0';

		// Get the full height
		const fullHeight = element.scrollHeight;

		// Animate to full height with fade in
		await motionAnimate(
			element,
			{
				height: [`0px`, `${fullHeight}px`],
				opacity: [0, 1]
			} as any,
			{
				duration: 0.3,
				easing: [0.4, 0, 0.2, 1] // ease-in-out
			} as any
		).finished;

		// Clean up styles
		element.style.height = 'auto';
		element.style.overflow = 'visible';
	} catch (error) {
		console.error('[animateAccordionExpand] Animation failed:', error);
		// Ensure element is visible even if animation fails
		if (element) {
			element.style.height = 'auto';
			element.style.overflow = 'visible';
			element.style.opacity = '1';
		}
	}
}

/**
 * Animate accordion/collapsible content collapse with height + fade.
 *
 * @param element - The content element to animate
 * @returns Promise that resolves when animation completes (or fails gracefully)
 */
export async function animateAccordionCollapse(element: HTMLElement): Promise<void> {
	try {
		// Get current height
		const startHeight = element.scrollHeight;
		element.style.height = `${startHeight}px`;
		element.style.overflow = 'hidden';

		// Animate to zero height with fade out
		await motionAnimate(
			element,
			{
				height: [`${startHeight}px`, `0px`],
				opacity: [1, 0]
			} as any,
			{
				duration: 0.2,
				easing: [0.4, 0, 1, 1] // ease-out
			} as any
		).finished;
	} catch (error) {
		console.error('[animateAccordionCollapse] Animation failed:', error);
		// Ensure element is hidden even if animation fails
		if (element) {
			element.style.height = '0px';
			element.style.opacity = '0';
		}
	}
}
