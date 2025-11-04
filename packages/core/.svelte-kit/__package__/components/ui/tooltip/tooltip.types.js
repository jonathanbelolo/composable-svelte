/**
 * Tooltip State Types
 *
 * State-driven tooltip with animation lifecycle coordination.
 *
 * @packageDocumentation
 */
/**
 * Initial tooltip state
 */
export const initialTooltipState = {
    content: null,
    presentation: { status: 'idle' },
    isWaitingToShow: false
};
