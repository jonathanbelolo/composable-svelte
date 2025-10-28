/**
 * Tooltip Reducer Tests
 *
 * Tests the tooltip state management with hover delay and animation lifecycle.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestStore } from '../src/test/test-store.js';
import { tooltipReducer } from '../src/components/ui/tooltip/tooltip.reducer.js';
import { initialTooltipState } from '../src/components/ui/tooltip/tooltip.types.js';
import type { TooltipState, TooltipAction, TooltipDependencies } from '../src/components/ui/tooltip/tooltip.types.js';

describe('Tooltip Reducer', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('Hover Delay', () => {
		it('should start waiting when hover starts', async () => {
			const store = createTestStore<TooltipState, TooltipAction, TooltipDependencies>({
				initialState: initialTooltipState,
				reducer: tooltipReducer,
				dependencies: { hoverDelay: 300 }
			});

			// Send hover action
			await store.send({ type: 'hoverStarted', content: 'Save file' }, (state) => {
				expect(state.content).toBe('Save file');
				expect(state.isWaitingToShow).toBe(true);
				expect(state.presentation.status).toBe('idle');
			});

			// Advance time by 300ms to trigger delay
			await store.advanceTime(300);

			// Now receive the delayCompleted action
			await store.receive({ type: 'delayCompleted' }, (state) => {
				expect(state.isWaitingToShow).toBe(false);
				expect(state.content).toBe('Save file');
				expect(state.presentation.status).toBe('presenting');
			});
		});

		it('should show tooltip after delay completes', async () => {
			const store = createTestStore<TooltipState, TooltipAction, TooltipDependencies>({
				initialState: initialTooltipState,
				reducer: tooltipReducer,
				dependencies: { hoverDelay: 300 }
			});

			await store.send({ type: 'hoverStarted', content: 'Save file' });

			// Advance time to complete delay
			await store.advanceTime(300);

			// Delay effect fires delayCompleted
			await store.receive({ type: 'delayCompleted' }, (state) => {
				expect(state.isWaitingToShow).toBe(false);
				expect(state.presentation.status).toBe('presenting');
				expect(state.presentation.content).toBe('Save file');
			});
		});

		it('should cancel tooltip if hover ends before delay completes', async () => {
			const store = createTestStore<TooltipState, TooltipAction, TooltipDependencies>({
				initialState: initialTooltipState,
				reducer: tooltipReducer,
				dependencies: { hoverDelay: 300 }
			});

			await store.send({ type: 'hoverStarted', content: 'Save file' });

			// Hover ends before delay completes (only advance 100ms)
			await store.advanceTime(100);

			await store.send({ type: 'hoverEnded' }, (state) => {
				expect(state.content).toBe(null);
				expect(state.isWaitingToShow).toBe(false);
				expect(state.presentation.status).toBe('idle');
			});

			// Advance past original delay time - delayCompleted will fire but be ignored
			await store.advanceTime(300);

			// Receive the delayCompleted action (it fires but is ignored by guard)
			await store.receive({ type: 'delayCompleted' }, (state) => {
				// State should remain unchanged (action was ignored)
				expect(state.content).toBe(null);
				expect(state.isWaitingToShow).toBe(false);
				expect(state.presentation.status).toBe('idle');
			});

			await store.finish();
		});
	});

	describe('Presentation Lifecycle', () => {
		it('should transition from presenting to presented', async () => {
			const store = createTestStore<TooltipState, TooltipAction, TooltipDependencies>({
				initialState: initialTooltipState,
				reducer: tooltipReducer,
				dependencies: { hoverDelay: 300 }
			});

			await store.send({ type: 'hoverStarted', content: 'Delete item' });
			await store.advanceTime(300);
			await store.receive({ type: 'delayCompleted' });

			// Advance time for animation duration (150ms)
			await store.advanceTime(150);

			// Animation completes
			await store.receive({
				type: 'presentation',
				event: { type: 'presentationCompleted' }
			}, (state) => {
				expect(state.presentation.status).toBe('presented');
				expect(state.presentation.content).toBe('Delete item');
			});
		});
	});

	describe('Dismissal Lifecycle', () => {
		it('should start dismissal when hover ends on presented tooltip', async () => {
			const store = createTestStore<TooltipState, TooltipAction, TooltipDependencies>({
				initialState: initialTooltipState,
				reducer: tooltipReducer,
				dependencies: { hoverDelay: 300 }
			});

			await store.send({ type: 'hoverStarted', content: 'Refresh page' });
			await store.advanceTime(300);
			await store.receive({ type: 'delayCompleted' });
			await store.advanceTime(150);
			await store.receive({
				type: 'presentation',
				event: { type: 'presentationCompleted' }
			});

			// Now hover ends
			await store.send({ type: 'hoverEnded' }, (state) => {
				expect(state.presentation.status).toBe('dismissing');
				expect(state.presentation.content).toBe('Refresh page');
			});
		});

		it('should transition from dismissing to idle', async () => {
			const store = createTestStore<TooltipState, TooltipAction, TooltipDependencies>({
				initialState: initialTooltipState,
				reducer: tooltipReducer,
				dependencies: { hoverDelay: 300 }
			});

			await store.send({ type: 'hoverStarted', content: 'Refresh page' });
			await store.advanceTime(300);
			await store.receive({ type: 'delayCompleted' });
			await store.advanceTime(150);
			await store.receive({
				type: 'presentation',
				event: { type: 'presentationCompleted' }
			});
			await store.send({ type: 'hoverEnded' });

			// Advance time for dismissal animation (105ms = 150 * 0.7)
			await store.advanceTime(105);

			// Dismissal animation completes
			await store.receive({
				type: 'presentation',
				event: { type: 'dismissalCompleted' }
			}, (state) => {
				expect(state.content).toBe(null);
				expect(state.presentation.status).toBe('idle');
			});
		});
	});

	describe('State Guards', () => {
		it('should ignore hoverEnded during presenting', async () => {
			const store = createTestStore<TooltipState, TooltipAction, TooltipDependencies>({
				initialState: initialTooltipState,
				reducer: tooltipReducer,
				dependencies: { hoverDelay: 300 }
			});

			await store.send({ type: 'hoverStarted', content: 'Copy text' });
			await store.advanceTime(300);
			await store.receive({ type: 'delayCompleted' });

			// Hover ends during animation - should be ignored
			await store.send({ type: 'hoverEnded' }, (state) => {
				expect(state.presentation.status).toBe('presenting');
			});
		});

		it('should ignore presentationCompleted if not presenting', async () => {
			const store = createTestStore<TooltipState, TooltipAction, TooltipDependencies>({
				initialState: initialTooltipState,
				reducer: tooltipReducer,
				dependencies: { hoverDelay: 300 }
			});

			// Send completion event without being in presenting state
			await store.send({
				type: 'presentation',
				event: { type: 'presentationCompleted' }
			}, (state) => {
				expect(state.presentation.status).toBe('idle');
			});
		});

		it('should ignore dismissalCompleted if not dismissing', async () => {
			const store = createTestStore<TooltipState, TooltipAction, TooltipDependencies>({
				initialState: initialTooltipState,
				reducer: tooltipReducer,
				dependencies: { hoverDelay: 300 }
			});

			// Send dismissal event without being in dismissing state
			await store.send({
				type: 'presentation',
				event: { type: 'dismissalCompleted' }
			}, (state) => {
				expect(state.presentation.status).toBe('idle');
			});
		});
	});

	describe('Custom Hover Delay', () => {
		it('should use custom hover delay from dependencies', async () => {
			const store = createTestStore<TooltipState, TooltipAction, TooltipDependencies>({
				initialState: initialTooltipState,
				reducer: tooltipReducer,
				dependencies: { hoverDelay: 500 } // Custom delay
			});

			await store.send({ type: 'hoverStarted', content: 'Custom delay' }, (state) => {
				expect(state.isWaitingToShow).toBe(true);
			});

			// Delay would be 500ms instead of default 300ms
			await store.advanceTime(500);

			await store.receive({ type: 'delayCompleted' }, (state) => {
				expect(state.presentation.status).toBe('presenting');
			});
		});
	});

	describe('Full User Flow', () => {
		it('should complete full hover → show → hide flow', async () => {
			const store = createTestStore<TooltipState, TooltipAction, TooltipDependencies>({
				initialState: initialTooltipState,
				reducer: tooltipReducer,
				dependencies: { hoverDelay: 300 }
			});

			// 1. User hovers
			await store.send({ type: 'hoverStarted', content: 'Download file' }, (state) => {
				expect(state.content).toBe('Download file');
				expect(state.isWaitingToShow).toBe(true);
			});

			// 2. Delay completes
			await store.advanceTime(300);
			await store.receive({ type: 'delayCompleted' }, (state) => {
				expect(state.presentation.status).toBe('presenting');
			});

			// 3. Presentation animation completes
			await store.advanceTime(150);
			await store.receive({
				type: 'presentation',
				event: { type: 'presentationCompleted' }
			}, (state) => {
				expect(state.presentation.status).toBe('presented');
			});

			// 4. User stops hovering
			await store.send({ type: 'hoverEnded' }, (state) => {
				expect(state.presentation.status).toBe('dismissing');
			});

			// 5. Dismissal animation completes
			await store.advanceTime(105);
			await store.receive({
				type: 'presentation',
				event: { type: 'dismissalCompleted' }
			}, (state) => {
				expect(state.content).toBe(null);
				expect(state.presentation.status).toBe('idle');
			});
		});
	});
});
