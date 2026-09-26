import { describe, it, expect, vi } from 'vitest';
import { createStore } from '../src/lib/store.svelte.js';
import { Effect } from '../src/lib/effect.js';
import { createDeterministicScheduler } from '../src/lib/execution/scheduler.js';
import { createLifecycle, stampOrigin, qualifyEffect } from '../src/lib/execution/identity.js';
import type { Reducer } from '../src/lib/types.js';
import { ownerAt } from '../src/lib/execution/identity.js';
describe('createStore execution modes', () => {
    it('preserves legacy immediate dispatch behavior by default', () => {
        const log: string[] = [];
        type Action = {
            type: 'A';
        } | {
            type: 'B';
        };
        const reducer: Reducer<number, Action> = (state, action) => {
            log.push(`reduce:${action.type}`);
            return [state + 1, Effect.none()];
        };
        const store = createStore({ initialState: 0, reducer });
        store.subscribe(state => {
            log.push(`sub:${state}`);
            if (state === 1) {
                store.dispatch({ type: 'B' });
            }
        });
        store.dispatch({ type: 'A' });
        // Under legacy immediate dispatch, reentrant B reduces inside subscriber of A:
        expect(log).toEqual(['sub:0', 'reduce:A', 'sub:1', 'reduce:B', 'sub:2']);
    });
    it('orders reentrant observer dispatches in managed FIFO mode', () => {
        let cleanupCount = 0;
        const transcript: string[] = [];
        type Action = {
            type: 'A';
        } | {
            type: 'B';
        } | {
            type: 'C';
        } | {
            type: 'D';
        } | {
            type: 'E';
        };
        const reducer: Reducer<{
            count: number;
            name: string;
        }, Action> = (state, action) => {
            transcript.push(`reduce:${action.type}:${state.count}`);
            switch (action.type) {
                case 'A':
                    return [
                        { ...state, count: state.count + 1, name: 'A' },
                        Effect.batch(
                            Effect.run(d => {
                                transcript.push('effect:A1');
                                d({ type: 'D' });
                            }),
                            Effect.run(() => {
                                transcript.push('effect:A2');
                            }),
                            Effect.subscription('sub', d => {
                                transcript.push('subscription:setup');
                                d({ type: 'E' });
                                return () => {
                                    cleanupCount++;
                                };
                            })
                        )
                    ];
                case 'B':
                    return [{ ...state, count: state.count + 1, name: 'B' }, Effect.none()];
                case 'C':
                    return [{ ...state, count: state.count + 1, name: 'C' }, Effect.none()];
                case 'D':
                    return [{ ...state, count: state.count + 1, name: 'D' }, Effect.none()];
                case 'E':
                    return [{ ...state, count: state.count + 1, name: 'E' }, Effect.none()];
                default:
                    return [state, Effect.none()];
            }
        };
        const store = createStore({
            initialState: { count: 0, name: 'init' },
            reducer,
            execution: { mode: 'managed' }
        });
        store.subscribe(state => {
            transcript.push(`stateSub:${state.name}:${state.count}`);
            if (state.name === 'A' && state.count === 1) {
                store.dispatch({ type: 'B' });
            }
        });
        store.subscribeToActions!((action, state) => {
            transcript.push(`actionSub:${action.type}:${state.count}`);
            if (action.type === 'A') {
                store.dispatch({ type: 'C' });
            }
        });
        store.dispatch({ type: 'A' });
        // Required transcript order: A commits, state observer enqueues B, action observer enqueues C,
        // A's first effect enqueues D, A's second effect runs, A's subscription enqueues E during setup,
        // then B, C, D, E reduce in FIFO order without recursive reduction.
        expect(transcript).toEqual([
            'stateSub:init:0',
            'reduce:A:0',
            'stateSub:A:1',
            'actionSub:A:1',
            'effect:A1',
            'effect:A2',
            'subscription:setup',
            'reduce:B:1',
            'stateSub:B:2',
            'actionSub:B:2',
            'reduce:C:2',
            'stateSub:C:3',
            'actionSub:C:3',
            'reduce:D:3',
            'stateSub:D:4',
            'actionSub:D:4',
            'reduce:E:4',
            'stateSub:E:5',
            'actionSub:E:5'
        ]);
        expect(cleanupCount).toBe(0);
        store.destroy();
        expect(cleanupCount).toBe(1);
    });
    it('cancels removed-child resources before leaf filter without requiring a cancel leaf (REG-009.04 / MUT-023)', () => {
        let cleanupCount = 0;
        type State = {
            child: {
                id: string;
            } | null;
        };
        type Action = {
            type: 'open';
        } | {
            type: 'dismiss';
        };
        const slotDescriptor = {
            select: (s: State) => (s.child ? [[{ slot: 'child' }]] : [])
        };
        const reducer: Reducer<State, Action> = (state, action) => {
            if (action.type === 'open') {
                return [
                    { child: { id: 'c1' } },
                    Effect.subscription('child-subscription', () => () => {
                        cleanupCount++;
                    })
                ];
            }
            if (action.type === 'dismiss') {
                // Parent emits Effect.none() — NO cancel leaf or cancelGroup is returned!
                return [{ child: null }, Effect.none()];
            }
            return [state, Effect.none()];
        };
        const store = createStore({
            initialState: { child: { id: 'c1' } } as State,
            reducer,
            execution: { mode: 'managed', slots: slotDescriptor, _reduce: ({ state, action, dependencies, reducer, lifecycle }) => { const [next, effect] = reducer(state, action, dependencies); const owner = ownerAt(lifecycle, [{ slot: 'child' }]); return [next, owner ? stampOrigin(effect, owner) : effect]; } }
        });
        store.dispatch({ type: 'open' });
        expect(cleanupCount).toBe(0);
        store.dispatch({ type: 'dismiss' });
        // Removal of child slot causes executor-driven owner invalidation before observers,
        // running subscription cleanup immediately without needing a cancel leaf.
        expect(cleanupCount).toBe(1);
    });
    it('allocates initial owner tokens for prepopulated feature slots symmetrically', () => {
        type State = {
            slotA: string;
        };
        const slotDescriptor = { select: (_s: State) => [[{ slot: 'slotA' }]] };
        const reducer: Reducer<State, {
            type: 'update';
        }> = (state, action) => {
            return [{ slotA: 'next' }, Effect.none()];
        };
        const store = createStore({
            initialState: { slotA: 'initial' },
            reducer,
            execution: { mode: 'managed', slots: slotDescriptor }
        });
        // First reduction must not throw 'Lifecycle does not match before state'
        expect(() => store.dispatch({ type: 'update' })).not.toThrow();
        expect(store.state.slotA).toBe('next');
    });
    it('stops subsequent effects when store is destroyed during observer notification', () => {
        let effectRan = false;
        type Action = {
            type: 'fire';
        };
        const reducer: Reducer<number, Action> = state => [
            state + 1,
            Effect.run(() => {
                effectRan = true;
            })
        ];
        const store = createStore({
            initialState: 0,
            reducer,
            execution: { mode: 'managed' }
        });
        store.subscribe(state => {
            if (state === 1) {
                store.destroy();
            }
        });
        store.dispatch({ type: 'fire' });
        expect(effectRan).toBe(false);
    });
    it('implements proposed reducer-throw policy: atomic failed turn, continues valid queued work', () => {
        type Action = {
            type: 'good1';
        } | {
            type: 'bad';
        } | {
            type: 'good2';
        };
        const committed: string[] = [];
        const reducer: Reducer<{
            count: number;
        }, Action> = (state, action) => {
            if (action.type === 'bad') {
                throw new Error('Boom from reducer');
            }
            committed.push(action.type);
            return [{ count: state.count + 1 }, Effect.none()];
        };
        const store = createStore({
            initialState: { count: 0 },
            reducer,
            execution: { mode: 'managed' }
        });
        store.subscribe(state => {
            if (state.count === 1) {
                // Enqueue bad and good2 during good1's notification
                store.dispatch({ type: 'bad' });
                store.dispatch({ type: 'good2' });
            }
        });
        expect(() => store.dispatch({ type: 'good1' })).toThrow('Boom from reducer');
        // good1 committed, bad failed atomically without commit, good2 completed validly:
        expect(committed).toEqual(['good1', 'good2']);
        expect(store.state.count).toBe(2);
    });
    it('bounds diagnostic history with oldest-entry eviction in managed mode', () => {
        const store = createStore({
            initialState: 0,
            reducer: (state, action: {
                type: string;
                i: number;
            }) => [state + 1, Effect.none()],
            maxHistorySize: 10, execution: { mode: 'managed' }
        });
        for (let i = 0; i < 25; i++) {
            store.dispatch({ type: 'inc', i });
        }
        expect(store.history.length).toBe(10);
        expect((store.history[0] as any).i).toBe(15);
        expect((store.history[9] as any).i).toBe(24);
    });
    it('integrates DeterministicScheduler for debounced and delayed effects', async () => {
        const scheduler = createDeterministicScheduler(0);
        let fired = 0;
        const reducer: Reducer<number, {
            type: 'trigger';
        }> = state => [
            state + 1,
            Effect.afterDelay(100, () => {
                fired++;
            })
        ];
        const store = createStore({
            initialState: 0,
            reducer,
            execution: { mode: 'managed', scheduler }
        });
        store.dispatch({ type: 'trigger' });
        expect(fired).toBe(0);
        await scheduler.advanceTime(50);
        expect(fired).toBe(0);
        await scheduler.advanceTime(50);
        expect(fired).toBe(1);
    });
});
