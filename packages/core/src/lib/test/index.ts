/**
 * Testing utilities for Composable Svelte.
 *
 * @packageDocumentation
 */

export {
	TestStore,
	createTestStore
} from './test-store.js';

export type {
	TestStoreConfig,
	StateAssertion,
	PartialAction
} from './test-store.js';

// Deterministic waits for animation tests: scrub a Web Animation, poll a
// ticking value, settle, and refuse fake timers and reduced motion.
export {
	assertMotionAllowed,
	midFlight,
	nextFrame,
	scrubAnimations,
	settleAnimations,
	settleValue,
	waitForAnimations,
	waitForStyle,
	waitUntil
} from './animation.js';

export type { AnimationsOptions, MidFlightOptions, SettleValueOptions, WaitOptions } from './animation.js';
