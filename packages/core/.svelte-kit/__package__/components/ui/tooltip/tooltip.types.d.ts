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
}
/**
 * Tooltip actions
 */
export type TooltipAction = {
    type: 'hoverStarted';
    content: TooltipContent;
} | {
    type: 'hoverEnded';
} | {
    type: 'delayCompleted';
} | {
    type: 'presentation';
    event: PresentationEvent;
};
/**
 * Tooltip dependencies
 */
export interface TooltipDependencies {
    /**
     * Hover delay in milliseconds (default: 300)
     */
    hoverDelay?: number;
}
/**
 * Initial tooltip state
 */
export declare const initialTooltipState: TooltipState;
//# sourceMappingURL=tooltip.types.d.ts.map