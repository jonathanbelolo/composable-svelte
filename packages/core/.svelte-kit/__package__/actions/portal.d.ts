/**
 * Portal (teleport) an element to a different location in the DOM.
 *
 * Default target is document.body, but can be customized.
 * Properly handles cleanup when component is destroyed.
 *
 * @example
 * ```svelte
 * <div use:portal>
 *   This will be appended to document.body
 * </div>
 * ```
 *
 * @example
 * ```svelte
 * <div use:portal={'#portal-target'}>
 *   This will be appended to #portal-target
 * </div>
 * ```
 */
export declare function portal(node: HTMLElement, target?: HTMLElement | string): {
    update(newTarget: HTMLElement | string): void;
    destroy(): void;
};
//# sourceMappingURL=portal.d.ts.map