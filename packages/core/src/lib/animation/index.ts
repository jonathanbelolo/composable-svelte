/**
 * Animation utilities for Motion One.
 *
 * State-driven animation functions for all components.
 *
 * @packageDocumentation
 */

export { prefersReducedMotion, watchReducedMotion } from './reduced-motion.js';
export { createScrollFollower } from './scroll.js';
export type { ScrollFollower, ScrollFollowerConfig } from './scroll.js';

export {
	animate,
	animateListItemIn,
	animateModalIn,
	animateModalOut,
	animateBackdropIn,
	animateBackdropOut,
	animateSheetIn,
	animateSheetOut,
	animateDrawerIn,
	animateDrawerOut,
	animateAlertIn,
	animateAlertOut,
	animateTooltipIn,
	animateTooltipOut,
	animateToastIn,
	animateToastOut,
	animateCarouselTrack,
	animateChevron,
	animateDropdownIn,
	animateDropdownOut,
	animateSidebarExpand,
	animateSidebarCollapse,
	animatePopoverIn,
	animatePopoverOut,
	animateStackPushIn,
	animateStackPushOut,
	animateStackPopIn,
	animateStackPopOut,
	animateAccordionExpand,
	animateAccordionCollapse
} from './animate.js';

export type { SpringConfig } from './spring-config.js';
export { springPresets, mergeSpringConfig } from './spring-config.js';
