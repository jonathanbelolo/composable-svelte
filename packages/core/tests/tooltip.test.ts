/**
 * Tooltip Reducer Tests
 *
 * Tests the tooltip state management with hover delay and animation lifecycle.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestStore as baseCreateTestStore } from '../src/lib/test/test-store.js';
import { tooltipReducer } from '../src/lib/components/ui/tooltip/tooltip.reducer.js';
import { initialTooltipState } from '../src/lib/components/ui/tooltip/tooltip.types.js';
import type { TooltipState, TooltipAction, TooltipDependencies } from '../src/lib/components/ui/tooltip/tooltip.types.js';

const activeStores: Array<{ destroy(): void }> = [];
const createTestStore: typeof baseCreateTestStore = (config) => { const store = baseCreateTestStore(config); activeStores.push(store); return store; };

describe('Tooltip Reducer', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		for (const store of activeStores.splice(0)) store.destroy();
		vi.clearAllTimers();
		vi.useRealTimers();
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
				expect(state.presentation).toMatchObject({
					status: 'presenting',
					content: 'Save file'
				});
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

			await store.advanceTime(300);
			expect(vi.getTimerCount()).toBe(0);
			store.assertNoPendingActions();
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
				expect(state.presentation).toMatchObject({
					status: 'presented',
					content: 'Delete item'
				});
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
				expect(state.presentation).toMatchObject({
					status: 'dismissing',
					content: 'Refresh page'
				});
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
		it('should retain exit intent during presenting', async () => {
			const store = createTestStore<TooltipState, TooltipAction, TooltipDependencies>({
				initialState: initialTooltipState,
				reducer: tooltipReducer,
				dependencies: { hoverDelay: 300 }
			});

			await store.send({ type: 'hoverStarted', content: 'Copy text' });
			await store.advanceTime(300);
			await store.receive({ type: 'delayCompleted' });

			// Hover ends during animation: phase finishes, then recorded exit intent dismisses.
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

	describe('Hover Exit During Presentation', () => {
		it('should dismiss after presentation completes if hover ended during entrance', async () => {
			const store = createTestStore<TooltipState, TooltipAction, TooltipDependencies>({
				initialState: initialTooltipState,
				reducer: tooltipReducer,
				dependencies: { hoverDelay: 300 }
			});

			await store.send({ type: 'hoverStarted', content: 'Info' });
			await store.advanceTime(300);
			await store.receive({ type: 'delayCompleted' });

			// Pointer leaves trigger while entrance animation is running
			await store.send({ type: 'hoverEnded' }, (state) => {
				expect(state.presentation.status).toBe('presenting');
				expect(state.isHovered).toBe(false);
			});

			// Advance time for entrance animation duration (150ms)
			await store.advanceTime(150);

			// Presentation completes: because hover ended, transition directly to dismissing
			await store.receive(
				{
					type: 'presentation',
					event: { type: 'presentationCompleted' }
				},
				(state) => {
					expect(state.presentation).toMatchObject({
						status: 'dismissing',
						content: 'Info'
					});
				}
			);

			// Advance time for dismissal animation duration (105ms)
			await store.advanceTime(105);

			// Dismissal completes: returns to idle
			await store.receive(
				{
					type: 'presentation',
					event: { type: 'dismissalCompleted' }
				},
				(state) => {
					expect(state.content).toBe(null);
					expect(state.presentation.status).toBe('idle');
				}
			);
		});

		it('should remain presented if pointer exits and re-enters during entrance', async () => {
			const store = createTestStore<TooltipState, TooltipAction, TooltipDependencies>({
				initialState: initialTooltipState,
				reducer: tooltipReducer,
				dependencies: { hoverDelay: 300 }
			});

			await store.send({ type: 'hoverStarted', content: 'Info' });
			await store.advanceTime(300);
			await store.receive({ type: 'delayCompleted' });

			// Pointer exits during entrance
			await store.send({ type: 'hoverEnded' }, (state) => {
				expect(state.isHovered).toBe(false);
				expect(state.presentation.status).toBe('presenting');
			});

			// Pointer re-enters before entrance completes
			await store.send({ type: 'hoverStarted', content: 'Info' }, (state) => {
				expect(state.isHovered).toBe(true);
				expect(state.presentation.status).toBe('presenting');
			});

			// Advance time for entrance animation (150ms)
			await store.advanceTime(150);

			// Presentation completes: latest intent was hovered, so transition to presented
			await store.receive(
				{
					type: 'presentation',
					event: { type: 'presentationCompleted' }
				},
				(state) => {
					expect(state.presentation).toMatchObject({
						status: 'presented',
						content: 'Info'
					});
				}
			);
		});

		it('should preserve hover intent when pointer re-enters during dismissal animation', async () => {
			const store = createTestStore<TooltipState, TooltipAction, TooltipDependencies>({
				initialState: initialTooltipState,
				reducer: tooltipReducer,
				dependencies: { hoverDelay: 300 }
			});

			await store.send({ type: 'hoverStarted', content: 'First' });
			await store.advanceTime(300);
			await store.receive({ type: 'delayCompleted' });
			await store.advanceTime(150);
			await store.receive({
				type: 'presentation',
				event: { type: 'presentationCompleted' }
			});

			// User unhovers: enters dismissal animation
			await store.send({ type: 'hoverEnded' }, (state) => {
				expect(state.presentation.status).toBe('dismissing');
			});

			// User re-hovers 50ms into dismissal
			await store.advanceTime(50);
			await store.send({ type: 'hoverStarted', content: 'Second' }, (state) => {
				expect(state.isHovered).toBe(true);
				expect(state.isWaitingToShow).toBe(true);
				expect(state.content).toBe('Second');
			});

			// Old dismissal finishes at 105ms total (55ms after re-hover)
			await store.advanceTime(55);
			await store.receive(
				{
					type: 'presentation',
					event: { type: 'dismissalCompleted' }
				},
				(state) => {
					// Stale dismissal completion does not clear content or pending hover
					expect(state.presentation.status).toBe('idle');
					expect(state.content).toBe('Second');
					expect(state.isWaitingToShow).toBe(true);
				}
			);

			// Advance remaining hover delay (300ms - 55ms = 245ms)
			await store.advanceTime(245);
			await store.receive({ type: 'delayCompleted' }, (state) => {
				expect(state.presentation.status).toBe('presenting');
				expect(state.content).toBe('Second');
			});

			// Presentation animation finishes
			await store.advanceTime(150);
			await store.receive(
				{
					type: 'presentation',
					event: { type: 'presentationCompleted' }
				},
				(state) => {
					expect(state.presentation).toMatchObject({
						status: 'presented',
						content: 'Second'
					});
				}
			);
		});
	});
});
