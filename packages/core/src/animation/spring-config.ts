/**
 * Spring physics configuration for Motion One animations.
 *
 * Motion One uses a simplified spring API based on visual perception:
 * - `visualDuration`: Expected animation duration in seconds
 * - `bounce`: Amount of bounciness (0 = no bounce, 1 = very bouncy)
 *
 * @packageDocumentation
 */

/**
 * Spring configuration for Motion One.
 *
 * **Note:** visualDuration is in SECONDS, not milliseconds!
 *
 * **Tuning Guidelines:**
 * - **Snappy UI** (buttons, alerts): duration 0.3s, bounce 0.2
 * - **Smooth transitions** (modals): duration 0.35s, bounce 0.25
 * - **Soft elements** (sheets, drawers): duration 0.4s, bounce 0.3
 * - **No overshoot**: bounce 0.0
 * - **Playful bounce**: bounce 0.4-0.6
 *
 * @example
 * ```typescript
 * //Snappy button animation
 * const config: SpringConfig = {
 *   visualDuration: 0.3,
 *   bounce: 0.2
 * };
 *
 * // Smooth modal without bounce
 * const modalConfig: SpringConfig = {
 *   visualDuration: 0.35,
 *   bounce: 0
 * };
 * ```
 */
export interface SpringConfig {
	/**
	 * Visual duration in seconds (not milliseconds!).
	 * Range: 0.1 - 2.0 (typical)
	 */
	visualDuration?: number;

	/**
	 * Bounce factor (0 = no bounce, 1 = very bouncy).
	 * Range: 0 - 1.0
	 */
	bounce?: number;
}

/**
 * Preset spring configurations for common UI components.
 */
export const springPresets = {
	// ============================================
	// PHASE 4 PRESETS (Navigation Components)
	// ============================================

	/** Modal: Snappy and responsive */
	modal: {
		visualDuration: 0.3,
		bounce: 0.25
	} as Required<SpringConfig>,

	/** Sheet: Softer for larger elements */
	sheet: {
		visualDuration: 0.35,
		bounce: 0.3
	} as Required<SpringConfig>,

	/** Drawer: Smooth and polished */
	drawer: {
		visualDuration: 0.35,
		bounce: 0.25
	} as Required<SpringConfig>,

	/** Alert: Very snappy */
	alert: {
		visualDuration: 0.25,
		bounce: 0.2
	} as Required<SpringConfig>,

	// ============================================
	// PHASE 6 PRESETS (Component Library)
	// ============================================

	/** Toast: Bouncy entrance with smooth exit */
	toast: {
		visualDuration: 0.4,
		bounce: 0.3
	} as Required<SpringConfig>,

	/** Dropdown: Fast and snappy */
	dropdown: {
		visualDuration: 0.2,
		bounce: 0.2
	} as Required<SpringConfig>,

	/** Popover: Similar to dropdown but slightly softer */
	popover: {
		visualDuration: 0.25,
		bounce: 0.25
	} as Required<SpringConfig>,

	/** Tooltip: Very fast, minimal bounce */
	tooltip: {
		visualDuration: 0.15,
		bounce: 0.1
	} as Required<SpringConfig>,

	/** Button: Quick press effect with playful bounce */
	button: {
		visualDuration: 0.2,
		bounce: 0.4
	} as Required<SpringConfig>,

	/** List item: Smooth add/remove animations */
	listItem: {
		visualDuration: 0.3,
		bounce: 0.25
	} as Required<SpringConfig>,

	/** Collapse: Slightly longer for height animations */
	collapse: {
		visualDuration: 0.35,
		bounce: 0.25
	} as Required<SpringConfig>
} as const;

// Alias for backward compatibility
export const SPRING_PRESETS = springPresets;

/**
 * Merge spring configurations.
 * Always returns a complete config with all required properties.
 */
export function mergeSpringConfig(
	base: Required<SpringConfig>,
	overrides?: Partial<SpringConfig>
): Required<SpringConfig> {
	if (!overrides) {
		return base;
	}

	return {
		visualDuration: overrides.visualDuration ?? base.visualDuration,
		bounce: overrides.bounce ?? base.bounce
	};
}
