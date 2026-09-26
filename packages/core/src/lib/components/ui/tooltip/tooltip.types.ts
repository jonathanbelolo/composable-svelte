/**
 * Tooltip State Types
 *
 * State-driven tooltip with animation lifecycle coordination.
 *
 * @packageDocumentation
 */

import type { PresentationState, PresentationEvent } from '../../../navigation/types.js';

/**
 * Tooltip content type
 */
export type TooltipContent = string;

/**
 * Tooltip state
 */
export interface TooltipState {
	/**
	 * Tooltip content (null when hidden)
	 */
	content: TooltipContent | null;

	/**
	 * Presentation state for animation lifecycle
	 */
	presentation: PresentationState<TooltipContent>;

	/**
	 * Hover timer is active (waiting for delay before showing)
	 */
	isWaitingToShow: boolean;
	/** Latest hover/focus intent, separate from visual phase. */
	isHovered?: boolean;
	/** Correlation for supported delay and rendering completion callbacks. */
	hoverVersion?: number | undefined;
	presentationVersion?: number | undefined;
}

/**
 * Tooltip actions
 */
export type TooltipAction =
	| { type: 'hoverStarted'; content: TooltipContent }
	| { type: 'hoverEnded' }
	| { type: 'delayCompleted'; hoverVersion?: number | undefined }
	| { type: 'presentation'; event: PresentationEvent; presentationVersion?: number | undefined };

/**
 * Tooltip dependencies
 */
export interface TooltipDependencies {
	/**
	 * Hover delay in milliseconds (default: 300)
	 */
	hoverDelay?: number | undefined;
}

/**
 * Initial tooltip state
 */
export const initialTooltipState: TooltipState = {
	content: null,
	presentation: { status: 'idle' },
	isWaitingToShow: false,
	isHovered: false
};
