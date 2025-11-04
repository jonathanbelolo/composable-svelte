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
export { motionAnimate as animate };
/**
 * Animate modal in with scale + fade.
 * Preserves CSS translate(-50%, -50%) for centering by composing transforms.
 */
export declare function animateModalIn(element: HTMLElement, springConfig?: Partial<SpringConfig>): Promise<void>;
/**
 * Animate modal out with scale + fade.
 * Preserves CSS translate(-50%, -50%) for centering by composing transforms.
 */
export declare function animateModalOut(element: HTMLElement, springConfig?: Partial<SpringConfig>): Promise<void>;
/**
 * Animate backdrop in with fade.
 */
export declare function animateBackdropIn(element: HTMLElement): Promise<void>;
/**
 * Animate backdrop out with fade.
 */
export declare function animateBackdropOut(element: HTMLElement): Promise<void>;
/**
 * Animate sheet in from edge.
 */
export declare function animateSheetIn(element: HTMLElement, side?: 'bottom' | 'left' | 'right', springConfig?: Partial<SpringConfig>): Promise<void>;
/**
 * Animate sheet out to edge.
 */
export declare function animateSheetOut(element: HTMLElement, side?: 'bottom' | 'left' | 'right', springConfig?: Partial<SpringConfig>): Promise<void>;
/**
 * Animate drawer in from side.
 */
export declare function animateDrawerIn(element: HTMLElement, side?: 'left' | 'right', springConfig?: Partial<SpringConfig>): Promise<void>;
/**
 * Animate drawer out to side.
 */
export declare function animateDrawerOut(element: HTMLElement, side?: 'left' | 'right', springConfig?: Partial<SpringConfig>): Promise<void>;
/**
 * Animate alert in with subtle scale + fade.
 * Preserves CSS translate(-50%, -50%) for centering by composing transforms.
 */
export declare function animateAlertIn(element: HTMLElement, springConfig?: Partial<SpringConfig>): Promise<void>;
/**
 * Animate alert out with subtle scale + fade.
 * Preserves CSS translate(-50%, -50%) for centering by composing transforms.
 */
export declare function animateAlertOut(element: HTMLElement, springConfig?: Partial<SpringConfig>): Promise<void>;
/**
 * Animate tooltip in with subtle scale + fade (very fast).
 */
export declare function animateTooltipIn(element: HTMLElement, springConfig?: Partial<SpringConfig>): Promise<void>;
/**
 * Animate tooltip out with fade (no scale for faster exit).
 */
export declare function animateTooltipOut(element: HTMLElement): Promise<void>;
/**
 * Animate toast in with scale + fade + slide.
 */
export declare function animateToastIn(element: HTMLElement, springConfig?: Partial<SpringConfig>): Promise<void>;
/**
 * Animate toast out with scale + fade.
 */
export declare function animateToastOut(element: HTMLElement, springConfig?: Partial<SpringConfig>): Promise<void>;
/**
 * Animate dropdown/popover in with scale + fade + subtle slide.
 *
 * @param element - The dropdown element to animate
 * @returns Promise that resolves when animation completes (or fails gracefully)
 */
export declare function animateDropdownIn(element: HTMLElement): Promise<void>;
/**
 * Animate dropdown/popover out with fade (fast exit).
 *
 * @param element - The dropdown element to animate
 * @returns Promise that resolves when animation completes (or fails gracefully)
 */
export declare function animateDropdownOut(element: HTMLElement): Promise<void>;
/**
 * Animate sidebar expand (GPU-accelerated with transform + margin).
 *
 * Uses hybrid approach:
 * - Fixed width with overflow: hidden
 * - Margin for layout changes (cheap reflows)
 * - Transform for GPU-accelerated visual smoothness
 */
export declare function animateSidebarExpand(element: HTMLElement, targetWidth: string, springConfig?: Partial<SpringConfig>, side?: 'left' | 'right'): Promise<void>;
/**
 * Animate sidebar collapse (GPU-accelerated with transform + margin).
 */
export declare function animateSidebarCollapse(element: HTMLElement, currentWidth: string, springConfig?: Partial<SpringConfig>, side?: 'left' | 'right'): Promise<void>;
/**
 * Animate popover in with subtle scale + fade.
 * Preserves positioning transforms (translateX/translateY) by composing them.
 */
export declare function animatePopoverIn(element: HTMLElement, positionTransform?: string, springConfig?: Partial<SpringConfig>): Promise<void>;
/**
 * Animate popover out with subtle scale + fade.
 * Preserves positioning transforms (translateX/translateY) by composing them.
 */
export declare function animatePopoverOut(element: HTMLElement, positionTransform?: string, springConfig?: Partial<SpringConfig>): Promise<void>;
/**
 * Animate new screen sliding in from right (push animation).
 *
 * Used when pushing a new screen onto the navigation stack.
 * New screen slides in from 100% right to 0%.
 */
export declare function animateStackPushIn(element: HTMLElement, springConfig?: Partial<SpringConfig>): Promise<void>;
/**
 * Animate previous screen sliding out to left (push animation background).
 *
 * Used when pushing a new screen - the previous screen slides slightly to the left
 * to create a depth effect, similar to iOS navigation.
 */
export declare function animateStackPushOut(element: HTMLElement, springConfig?: Partial<SpringConfig>): Promise<void>;
/**
 * Animate current screen sliding out to right (pop animation).
 *
 * Used when popping the current screen from the navigation stack.
 * Current screen slides from 0% to 100% right.
 */
export declare function animateStackPopOut(element: HTMLElement, springConfig?: Partial<SpringConfig>): Promise<void>;
/**
 * Animate previous screen sliding in from left (pop animation background).
 *
 * Used when popping - the previous screen slides in from the left
 * (reverses the push-out animation).
 */
export declare function animateStackPopIn(element: HTMLElement, springConfig?: Partial<SpringConfig>): Promise<void>;
/**
 * Animate accordion/collapsible content expand with height + fade.
 *
 * @param element - The content element to animate
 * @returns Promise that resolves when animation completes (or fails gracefully)
 */
export declare function animateAccordionExpand(element: HTMLElement): Promise<void>;
/**
 * Animate accordion/collapsible content collapse with height + fade.
 *
 * @param element - The content element to animate
 * @returns Promise that resolves when animation completes (or fails gracefully)
 */
export declare function animateAccordionCollapse(element: HTMLElement): Promise<void>;
//# sourceMappingURL=animate.d.ts.map