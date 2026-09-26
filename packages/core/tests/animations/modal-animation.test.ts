import { waitForState } from '../helpers/wait-for-state.js';
/**
 * Browser tests for Modal animation lifecycle.
 *
 * These tests verify that:
 * 1. Modal animations actually run in the browser
 * 2. The presentation state machine transitions correctly
 * 3. Animation callbacks are invoked at the right times
 * 4. The component stays mounted during dismissal
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
import ModalTest from './test-components/ModalTest.svelte';

import { tick } from 'svelte';
import { assertMotionAllowed, midFlight, waitUntil, waitForAnimations } from '../../src/lib/test/animation.js';

beforeAll(() => assertMotionAllowed());

/**
 * Wait for store state to match a condition.
 * This hooks directly into the store's reactivity system - NO POLLING!
 */

describe('Modal Animation Lifecycle', () => {
	it('should animate in when presenting', async () => {
		const { container } = render(ModalTest);

		// Get store reference from window
		const store = (window as any).__modalTestStore;
		expect(store).toBeDefined();

		// Initially, modal should not be visible
		let modalContent = document.querySelector('[data-testid="modal-content"]');
		expect(modalContent).toBeNull();

		// Click button to open modal
		const openButton = container.querySelector('[data-testid="open-modal"]') as HTMLButtonElement;
		await userEvent.click(openButton);

		// Wait for modal to mount (status changes to 'presenting')
		await waitForState(store, (state: any) => state.presentation.status === 'presenting', {
			description: "presentation status to be 'presenting'"
		});

		// Modal should now be in DOM
		modalContent = document.querySelector('[data-testid="modal-content"]');
		expect(modalContent).toBeTruthy();

		// NOW wait for animation to complete - store will notify us when state changes to 'presented'
		await waitForState(store, (state: any) => state.presentation.status === 'presented', {
			description: "presentation status to be 'presented'"
		});

		// After animation completes, status should be 'presented'
		const status = container.querySelector('[data-testid="presentation-status"]');
		expect(status?.textContent).toBe('presented');
	});

	it('should animate out when dismissing', async () => {
		const { container } = render(ModalTest);
		const store = (window as any).__modalTestStore;

		// Open modal
		const openButton = container.querySelector('[data-testid="open-modal"]') as HTMLButtonElement;
		await userEvent.click(openButton);

		// Wait for animation to complete - notification-based!
		await waitForState(store, (state: any) => state.presentation.status === 'presented', {
			description: "presentation to complete"
		});

		// Modal should be fully presented
		let modalContent = document.querySelector('[data-testid="modal-content"]');
		expect(modalContent).toBeTruthy();

		// Click dismiss button
		const dismissButton = document.querySelector('[data-testid="dismiss-modal"]') as HTMLButtonElement;
		await userEvent.click(dismissButton);

		// Wait for dismissal to start
		await waitForState(store, (state: any) => state.presentation.status === 'dismissing', {
			description: "dismissal to start"
		});

		// Modal should stay mounted during dismissal animation
		modalContent = document.querySelector('[data-testid="modal-content"]');
		expect(modalContent).toBeTruthy();

		// Wait for dismissal to complete - notification-based!
		await waitForState(store, (state: any) => state.presentation.status === 'idle', {
			description: "dismissal to complete"
		});

		// Modal should now be removed from DOM
		modalContent = document.querySelector('[data-testid="modal-content"]');
		expect(modalContent).toBeNull();

		// Status should be back to 'idle'
		const status = container.querySelector('[data-testid="presentation-status"]');
		expect(status?.textContent).toBe('idle');
	});

	it('should prevent interactions during animation', async () => {
		const { container } = render(ModalTest);
		const store = (window as any).__modalTestStore;

		// Open modal
		const openButton = container.querySelector('[data-testid="open-modal"]') as HTMLButtonElement;
		await userEvent.click(openButton);

		// Wait for modal to mount
		await waitForState(store, (state: any) => state.presentation.status === 'presenting', {
			description: "presentation to start"
		});

		// During presentation animation, button should be disabled (in document, not container)
		let button = document.querySelector('[data-testid="modal-action-button"]') as HTMLButtonElement;
		expect(button.disabled).toBe(true);

		// Wait for animation to complete - notification-based!
		await waitForState(store, (state: any) => state.presentation.status === 'presented', {
			description: "presentation to complete"
		});

		// After presentation, button should be enabled
		button = document.querySelector('[data-testid="modal-action-button"]') as HTMLButtonElement;
		expect(button.disabled).toBe(false);

		// Start dismissal
		const dismissButton = document.querySelector('[data-testid="dismiss-modal"]') as HTMLButtonElement;
		await userEvent.click(dismissButton);

		// Wait for dismissal to start
		await waitForState(store, (state: any) => state.presentation.status === 'dismissing', {
			description: "dismissal to start"
		});

		// During dismissal, button should be disabled again
		button = document.querySelector('[data-testid="modal-action-button"]') as HTMLButtonElement;
		expect(button.disabled).toBe(true);
	});

	it('should handle rapid open/close transitions', async () => {
		render(ModalTest);
		const store = (window as any).__modalTestStore;
		store.dispatch({ type: 'openModal' });
		await tick();
		const content = document.querySelector<HTMLElement>('.actual-modal-content')!;
		expect(content).toBeTruthy();
		expect(store.state.presentation.status).toBe('presenting');
		// The supported contract rejects dismiss while entering. Direct dispatch
		// does not let userEvent wait for pointer-events to become enabled.
		store.dispatch({ type: 'dismissModal' });
		expect(store.state.presentation.status).toBe('presenting');
		await waitForState(store, (state: any) => state.presentation.status === 'presented');
		store.dispatch({ type: 'dismissModal' });
		expect(store.state.presentation.status).toBe('dismissing');
		await tick();
		const opacity = await midFlight(() => Number(getComputedStyle(content).opacity), { from: 1, to: 0, what: 'modal exit opacity' });
		expect(opacity).toBeGreaterThan(0);
		expect(opacity).toBeLessThan(1);
		expect(content.isConnected).toBe(true);
		expect(store.state.presentation.status).toBe('dismissing');
		await waitForState(store, (state: any) => state.presentation.status === 'idle');
		await tick();
		expect(content.isConnected).toBe(false);
		// A completed cycle can present again; no permanently stuck guard.
		store.dispatch({ type: 'openModal' });
		await waitForState(store, (state: any) => state.presentation.status === 'presented');
	});

	it('should animate backdrop independently', async () => {
		render(ModalTest);
		const store = (window as any).__modalTestStore;
		store.dispatch({ type: 'openModal' });
		await tick();
		const backdrop = document.querySelector<HTMLElement>('.actual-modal-backdrop')!;
		const content = document.querySelector<HTMLElement>('.actual-modal-content')!;
		expect(backdrop).toBeTruthy();
		expect(backdrop).not.toBe(content);
		expect(backdrop.contains(content)).toBe(false);
		const animations = await waitForAnimations(backdrop, { subtree: false });
		const opacityAnimation = animations.find(animation =>
			(animation.effect as KeyframeEffect).getKeyframes().some(frame => frame.opacity !== undefined));
		expect(opacityAnimation, 'the library backdrop must own an opacity animation').toBeDefined();
		const animation = opacityAnimation!;
		animation.pause();
		await animation.ready;
		animation.currentTime = 0;
		const startOpacity = Number(getComputedStyle(backdrop).opacity);
		const duration = Number(animation.effect!.getComputedTiming().activeDuration);
		expect(duration).toBeGreaterThan(0);
		animation.currentTime = duration * 0.1;
		const movingOpacity = Number(getComputedStyle(backdrop).opacity);
		expect(startOpacity).toBeCloseTo(0, 3);
		expect(movingOpacity).toBeGreaterThan(startOpacity);
		expect(movingOpacity).toBeLessThan(1);
		// Hold only the backdrop: finishing content must not complete presentation.
		const contentAnimations = await waitForAnimations(content, { subtree: false });
		await Promise.all(contentAnimations.map(playback => playback.finished));
		// Modal's helper commits styles on the following frame, then publishes
		// completion through a microtask. Observe after that boundary.
		await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
		await waitUntil(() => Number(getComputedStyle(content).opacity), value => value === 1, { what: 'content entering independently' });
		expect(store.state.presentation.status).toBe('presenting');
		animation.finish();
		await waitForState(store, (state: any) => state.presentation.status === 'presented');
		expect(Number(getComputedStyle(backdrop).opacity)).toBe(1);
	});

});
