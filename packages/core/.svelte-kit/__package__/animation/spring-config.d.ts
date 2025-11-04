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
export declare const springPresets: {
    /** Modal: Snappy and responsive */
    readonly modal: Required<SpringConfig>;
    /** Sheet: Softer for larger elements */
    readonly sheet: Required<SpringConfig>;
    /** Drawer: Smooth and polished */
    readonly drawer: Required<SpringConfig>;
    /** Alert: Very snappy */
    readonly alert: Required<SpringConfig>;
    /** Toast: Bouncy entrance with smooth exit */
    readonly toast: Required<SpringConfig>;
    /** Dropdown: Fast and snappy */
    readonly dropdown: Required<SpringConfig>;
    /** Popover: Similar to dropdown but slightly softer */
    readonly popover: Required<SpringConfig>;
    /** Tooltip: Very fast, minimal bounce */
    readonly tooltip: Required<SpringConfig>;
    /** Button: Quick press effect with playful bounce */
    readonly button: Required<SpringConfig>;
    /** List item: Smooth add/remove animations */
    readonly listItem: Required<SpringConfig>;
    /** Collapse: Slightly longer for height animations */
    readonly collapse: Required<SpringConfig>;
};
export declare const SPRING_PRESETS: {
    /** Modal: Snappy and responsive */
    readonly modal: Required<SpringConfig>;
    /** Sheet: Softer for larger elements */
    readonly sheet: Required<SpringConfig>;
    /** Drawer: Smooth and polished */
    readonly drawer: Required<SpringConfig>;
    /** Alert: Very snappy */
    readonly alert: Required<SpringConfig>;
    /** Toast: Bouncy entrance with smooth exit */
    readonly toast: Required<SpringConfig>;
    /** Dropdown: Fast and snappy */
    readonly dropdown: Required<SpringConfig>;
    /** Popover: Similar to dropdown but slightly softer */
    readonly popover: Required<SpringConfig>;
    /** Tooltip: Very fast, minimal bounce */
    readonly tooltip: Required<SpringConfig>;
    /** Button: Quick press effect with playful bounce */
    readonly button: Required<SpringConfig>;
    /** List item: Smooth add/remove animations */
    readonly listItem: Required<SpringConfig>;
    /** Collapse: Slightly longer for height animations */
    readonly collapse: Required<SpringConfig>;
};
/**
 * Merge spring configurations.
 * Always returns a complete config with all required properties.
 */
export declare function mergeSpringConfig(base: Required<SpringConfig>, overrides?: Partial<SpringConfig>): Required<SpringConfig>;
//# sourceMappingURL=spring-config.d.ts.map