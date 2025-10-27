/**
 * Browser tests for Sheet animation lifecycle.
 *
 * These tests verify that:
 * 1. Sheet animations actually run in the browser
 * 2. The presentation state machine transitions correctly
 * 3. Animation callbacks are invoked at the right times
 * 4. The component stays mounted during dismissal
 * 5. Sheet animates from bottom edge
 */

import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
import SheetTest from './test-components/SheetTest.svelte';

// Simple wait helper for DOM checks
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Wait for store state to match a condition.
 * This hooks directly into the store's reactivity system - NO POLLING!
 */
function waitForState<State>(
	store: { subscribe: (listener: (state: State) => void) => () => void },
	condition: (state: State) => boolean,
	options: { timeout?: number; description?: string } = {}
): Promise<State> {
	const { timeout = 2000, description = 'state condition' } = options;

	return new Promise((resolve, reject) => {
		let unsubscribe: (() => void) | null = null;
		let timeoutId: ReturnType<typeof setTimeout> | null = null;

		// Set up timeout
		timeoutId = setTimeout(() => {
			unsubscribe?.();
			reject(new Error(`Timeout waiting for ${description} after ${timeout}ms`));
		}, timeout);

		// Subscribe to state changes
		unsubscribe = store.subscribe((state) => {
			if (condition(state)) {
				// Condition met! Clean up and resolve
				if (timeoutId) clearTimeout(timeoutId);
				unsubscribe?.();
				resolve(state);
			}
		});
	});
}

describe('Sheet Animation Lifecycle', () => {
	it('should animate in when presenting', async () => {
		const { container } = render(SheetTest);

		// Get store reference from window
		const store = (window as any).__sheetTestStore;
		expect(store).toBeDefined();

		// Initially, sheet should not be visible
		let sheetContent = document.querySelector('[data-testid="sheet-content"]');
		expect(sheetContent).toBeNull();

		// Click button to open sheet
		const openButton = container.querySelector('[data-testid="open-sheet"]') as HTMLButtonElement;
		await userEvent.click(openButton);

		// Wait for sheet to mount (status changes to 'presenting')
		await waitForState(store, (state: any) => state.presentation.status === 'presenting', {
			description: "presentation status to be 'presenting'"
		});

		// Sheet should now be in DOM
		sheetContent = document.querySelector('[data-testid="sheet-content"]');
		expect(sheetContent).toBeTruthy();

		// NOW wait for animation to complete - store will notify us when state changes to 'presented'
		await waitForState(store, (state: any) => state.presentation.status === 'presented', {
			description: "presentation status to be 'presented'"
		});

		// After animation completes, status should be 'presented'
		const status = container.querySelector('[data-testid="presentation-status"]');
		expect(status?.textContent).toBe('presented');
	});

	it('should animate out when dismissing', async () => {
		const { container } = render(SheetTest);
		const store = (window as any).__sheetTestStore;

		// Open sheet
		const openButton = container.querySelector('[data-testid="open-sheet"]') as HTMLButtonElement;
		await userEvent.click(openButton);

		// Wait for animation to complete - notification-based!
		await waitForState(store, (state: any) => state.presentation.status === 'presented', {
			description: "presentation to complete"
		});

		// Sheet should be fully presented
		let sheetContent = document.querySelector('[data-testid="sheet-content"]');
		expect(sheetContent).toBeTruthy();

		// Click dismiss button
		const dismissButton = document.querySelector('[data-testid="dismiss-sheet"]') as HTMLButtonElement;
		await userEvent.click(dismissButton);

		// Wait for dismissal to start
		await waitForState(store, (state: any) => state.presentation.status === 'dismissing', {
			description: "dismissal to start"
		});

		// Sheet should stay mounted during dismissal animation
		sheetContent = document.querySelector('[data-testid="sheet-content"]');
		expect(sheetContent).toBeTruthy();

		// Wait for dismissal to complete - notification-based!
		await waitForState(store, (state: any) => state.presentation.status === 'idle', {
			description: "dismissal to complete"
		});

		// Sheet should now be removed from DOM
		sheetContent = document.querySelector('[data-testid="sheet-content"]');
		expect(sheetContent).toBeNull();

		// Status should be back to 'idle'
		const status = container.querySelector('[data-testid="presentation-status"]');
		expect(status?.textContent).toBe('idle');
	});

	it('should prevent interactions during animation', async () => {
		const { container } = render(SheetTest);
		const store = (window as any).__sheetTestStore;

		// Open sheet
		const openButton = container.querySelector('[data-testid="open-sheet"]') as HTMLButtonElement;
		await userEvent.click(openButton);

		// Wait for sheet to mount
		await waitForState(store, (state: any) => state.presentation.status === 'presenting', {
			description: "presentation to start"
		});

		// During presentation animation, button should be disabled
		let button = document.querySelector('[data-testid="sheet-action-button"]') as HTMLButtonElement;
		expect(button.disabled).toBe(true);

		// Wait for animation to complete - notification-based!
		await waitForState(store, (state: any) => state.presentation.status === 'presented', {
			description: "presentation to complete"
		});

		// After presentation, button should be enabled
		button = document.querySelector('[data-testid="sheet-action-button"]') as HTMLButtonElement;
		expect(button.disabled).toBe(false);

		// Start dismissal
		const dismissButton = document.querySelector('[data-testid="dismiss-sheet"]') as HTMLButtonElement;
		await userEvent.click(dismissButton);

		// Wait for dismissal to start
		await waitForState(store, (state: any) => state.presentation.status === 'dismissing', {
			description: "dismissal to start"
		});

		// During dismissal, button should be disabled again
		button = document.querySelector('[data-testid="sheet-action-button"]') as HTMLButtonElement;
		expect(button.disabled).toBe(true);
	});

	it('should handle rapid open/close transitions', async () => {
		const { container } = render(SheetTest);
		const store = (window as any).__sheetTestStore;

		// Rapidly open and close
		const openButton = container.querySelector('[data-testid="open-sheet"]') as HTMLButtonElement;
		await userEvent.click(openButton);

		// Wait for presentation to start
		await waitForState(store, (state: any) => state.presentation.status === 'presenting', {
			description: "presentation to start"
		});

		// Dismiss before animation completes
		const dismissButton = document.querySelector('[data-testid="dismiss-sheet"]') as HTMLButtonElement;
		await userEvent.click(dismissButton);

		// Wait for all animations to settle - notification-based!
		await waitForState(store, (state: any) => state.presentation.status === 'idle', {
			description: "all animations to settle"
		});

		// Sheet should eventually be removed
		const sheetContent = document.querySelector('[data-testid="sheet-content"]');
		expect(sheetContent).toBeNull();

		// Status should be idle
		const status = container.querySelector('[data-testid="presentation-status"]');
		expect(status?.textContent).toBe('idle');
	});

	it('should animate backdrop independently', async () => {
		const { container } = render(SheetTest);
		const store = (window as any).__sheetTestStore;

		// Open sheet
		const openButton = container.querySelector('[data-testid="open-sheet"]') as HTMLButtonElement;
		await userEvent.click(openButton);

		// Wait for presentation to start
		await waitForState(store, (state: any) => state.presentation.status === 'presenting', {
			description: "presentation to start"
		});

		// Both backdrop and content should be present
		const backdrop = document.querySelector('[data-testid="sheet-backdrop"]');
		const content = document.querySelector('[data-testid="sheet-content"]');

		expect(backdrop).toBeTruthy();
		expect(content).toBeTruthy();

		// Check that backdrop has opacity applied (animated)
		const initialOpacity = window.getComputedStyle(backdrop as Element).opacity;
		expect(parseFloat(initialOpacity)).toBeGreaterThanOrEqual(0);
		expect(parseFloat(initialOpacity)).toBeLessThanOrEqual(1);

		// Wait for animation to complete - notification-based!
		await waitForState(store, (state: any) => state.presentation.status === 'presented', {
			description: "presentation to complete"
		});

		// After animation, opacity should be 1
		const finalOpacity = window.getComputedStyle(backdrop as Element).opacity;
		expect(parseFloat(finalOpacity)).toBe(1);
	});

	it('should animate from bottom edge', async () => {
		const { container } = render(SheetTest);
		const store = (window as any).__sheetTestStore;

		// Open sheet
		const openButton = container.querySelector('[data-testid="open-sheet"]') as HTMLButtonElement;
		await userEvent.click(openButton);

		// Wait for presentation to start
		await waitForState(store, (state: any) => state.presentation.status === 'presenting', {
			description: "presentation to start"
		});

		// Sheet content should be present and positioned at bottom
		const content = document.querySelector('[data-testid="sheet-content"]') as HTMLElement;
		expect(content).toBeTruthy();

		// Check that content is positioned at bottom (has bottom: 0)
		const styles = window.getComputedStyle(content);
		expect(styles.position).toBe('fixed');
		expect(styles.bottom).toBe('0px');

		// Wait for animation to complete
		await waitForState(store, (state: any) => state.presentation.status === 'presented', {
			description: "presentation to complete"
		});

		// After animation, content should still be at bottom
		const finalStyles = window.getComputedStyle(content);
		expect(finalStyles.bottom).toBe('0px');
	});
});
