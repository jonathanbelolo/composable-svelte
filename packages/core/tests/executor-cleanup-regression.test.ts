import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { expectConsole, slot } from './helpers/console.js';
import { createStore } from '../src/lib/store.svelte';
import { createTestStore } from '../src/lib/test/test-store';
import { Effect } from '../src/lib/effect';
import type { Reducer, Dispatch } from '../src/lib/types';
// Observe task-boundary failures explicitly; console interception alone does
// not prove that a rejecting cleanup was handled.
let unhandled: unknown[] = [];
const nodeUnhandled = (reason: unknown) => { unhandled.push(reason); };
const browserUnhandled = (event: PromiseRejectionEvent) => { unhandled.push(event.reason); };
beforeEach(() => {
    unhandled = [];
    if (typeof process !== 'undefined' && typeof process.on === 'function')
        process.on('unhandledRejection', nodeUnhandled);
    if (typeof window !== 'undefined')
        window.addEventListener('unhandledrejection', browserUnhandled);
});
afterEach(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
    if (typeof process !== 'undefined' && typeof process.off === 'function')
        process.off('unhandledRejection', nodeUnhandled);
    if (typeof window !== 'undefined')
        window.removeEventListener('unhandledrejection', browserUnhandled);
    expect(unhandled).toEqual([]);
});
describe('executor cleanup regressions (DEF002, DEF003)', () => {
    describe('DEF002: async subscription cleanup rejection', () => {
        it('createStore: async cleanup rejection on destroy is caught and does not emit unhandledRejection', async () => {
            expectConsole('error', 1);
            type State = {
                status: string;
            };
            type Action = {
                type: 'start';
            };
            const reducer: Reducer<State, Action> = (state, action) => {
                if (action.type === 'start') {
                    return [
                        { status: 'started' },
                        Effect.subscription('sub-destroy', () => async () => {
                            throw new Error('destroy cleanup rejection');
                        })
                    ];
                }
                return [state, Effect.none()];
            };
            const store = createStore({ initialState: { status: 'idle' }, reducer, ssr: { deferEffects: false } });
            store.dispatch({ type: 'start' });
            store.destroy();
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(slot.calls.error).toHaveLength(1);
        });
        it('createStore: async cleanup rejection on Effect.cancel(id) is caught and does not emit unhandledRejection', async () => {
            expectConsole('error', 1);
            type State = {
                active: boolean;
            };
            type Action = {
                type: 'start';
            } | {
                type: 'cancel';
            };
            const reducer: Reducer<State, Action> = (state, action) => {
                if (action.type === 'start') {
                    return [
                        { active: true },
                        Effect.subscription('sub-id', () => async () => {
                            throw new Error('id cleanup rejection');
                        })
                    ];
                }
                if (action.type === 'cancel') {
                    return [{ active: false }, Effect.cancel('sub-id')];
                }
                return [state, Effect.none()];
            };
            const store = createStore({ initialState: { active: false }, reducer, ssr: { deferEffects: false } });
            store.dispatch({ type: 'start' });
            store.dispatch({ type: 'cancel' });
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(slot.calls.error).toHaveLength(1);
        });
        it('createStore: async cleanup rejection on cancelGroup is caught and does not emit unhandledRejection', async () => {
            expectConsole('error', 1);
            type State = {
                active: boolean;
            };
            type Action = {
                type: 'start';
            } | {
                type: 'cancel';
            };
            const reducer: Reducer<State, Action> = (state, action) => {
                if (action.type === 'start') {
                    return [
                        { active: true },
                        Effect.inGroup(Effect.subscription('sub-grp', () => async () => {
                            throw new Error('group cleanup rejection');
                        }), 'my-group')
                    ];
                }
                if (action.type === 'cancel') {
                    return [{ active: false }, Effect.cancelGroup('my-group')];
                }
                return [state, Effect.none()];
            };
            const store = createStore({ initialState: { active: false }, reducer, ssr: { deferEffects: false } });
            store.dispatch({ type: 'start' });
            store.dispatch({ type: 'cancel' });
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(slot.calls.error).toHaveLength(1);
        });
        it('createStore: async cleanup rejection on subscription replacement is caught', async () => {
            expectConsole('error', 1);
            type State = {
                count: number;
            };
            type Action = {
                type: 'start';
            };
            let secondCleanupRan = false;
            const reducer: Reducer<State, Action> = (state, action) => {
                if (action.type === 'start') {
                    const count = state.count + 1;
                    return [
                        { count },
                        Effect.subscription('sub-repl', () => {
                            if (count === 1) {
                                return async () => {
                                    throw new Error('first cleanup error');
                                };
                            }
                            return () => {
                                secondCleanupRan = true;
                            };
                        })
                    ];
                }
                return [state, Effect.none()];
            };
            const store = createStore({ initialState: { count: 0 }, reducer, ssr: { deferEffects: false } });
            store.dispatch({ type: 'start' });
            store.dispatch({ type: 'start' });
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(slot.calls.error).toHaveLength(1);
            store.destroy();
            expect(secondCleanupRan).toBe(true);
        });
    });
    describe('synchronous self-cancel during setup', () => {
        it('createStore: synchronous self-cancel by ID during setup runs cleanup returned by setup and gates callbacks', () => {
            type State = {
                cancelled: boolean;
                count: number;
            };
            type Action = {
                type: 'init';
            } | {
                type: 'doCancel';
            } | {
                type: 'late';
            };
            let cleanupRunCount = 0;
            let capturedDispatch: Dispatch<Action> | undefined;
            const reducer: Reducer<State, Action> = (state, action) => {
                if (action.type === 'init') {
                    return [
                        state,
                        Effect.subscription('self-id', (dispatch) => {
                            capturedDispatch = dispatch;
                            dispatch({ type: 'doCancel' });
                            return () => {
                                cleanupRunCount++;
                            };
                        })
                    ];
                }
                if (action.type === 'doCancel') {
                    return [{ ...state, cancelled: true }, Effect.cancel('self-id')];
                }
                if (action.type === 'late') {
                    return [{ ...state, count: state.count + 1 }, Effect.none()];
                }
                return [state, Effect.none()];
            };
            const store = createStore({ initialState: { cancelled: false, count: 0 }, reducer, ssr: { deferEffects: false } });
            store.dispatch({ type: 'init' });
            expect(store.state.cancelled).toBe(true);
            expect(cleanupRunCount).toBe(1);
            capturedDispatch?.({ type: 'late' });
            expect(store.state.count).toBe(0);
            store.dispatch({ type: 'doCancel' });
            expect(cleanupRunCount).toBe(1);
            store.destroy();
            expect(cleanupRunCount).toBe(1);
        });
        it('createStore: synchronous self-cancel by group during setup runs cleanup returned by setup', () => {
            type State = {
                cancelled: boolean;
            };
            type Action = {
                type: 'init';
            } | {
                type: 'cancelGrp';
            };
            let cleanupRunCount = 0;
            const reducer: Reducer<State, Action> = (state, action) => {
                if (action.type === 'init') {
                    return [
                        state,
                        Effect.inGroup(Effect.subscription('self-grp', (dispatch) => {
                            dispatch({ type: 'cancelGrp' });
                            return () => {
                                cleanupRunCount++;
                            };
                        }), 'g-init')
                    ];
                }
                if (action.type === 'cancelGrp') {
                    return [{ cancelled: true }, Effect.cancelGroup('g-init')];
                }
                return [state, Effect.none()];
            };
            const store = createStore({ initialState: { cancelled: false }, reducer, ssr: { deferEffects: false } });
            store.dispatch({ type: 'init' });
            expect(store.state.cancelled).toBe(true);
            expect(cleanupRunCount).toBe(1);
            store.dispatch({ type: 'cancelGrp' });
            expect(cleanupRunCount).toBe(1);
            store.destroy();
            expect(cleanupRunCount).toBe(1);
        });
        it('TestStore: synchronous self-cancel by ID during setup runs cleanup and gates callbacks', async () => {
            type State = {
                cancelled: boolean;
                count: number;
            };
            type Action = {
                type: 'init';
            } | {
                type: 'doCancel';
            } | {
                type: 'late';
            };
            let cleanupRunCount = 0;
            let capturedDispatch: Dispatch<Action> | undefined;
            const reducer: Reducer<State, Action> = (state, action) => {
                if (action.type === 'init') {
                    return [
                        state,
                        Effect.subscription('ts-self-id', (dispatch) => {
                            capturedDispatch = dispatch;
                            dispatch({ type: 'doCancel' });
                            return () => {
                                cleanupRunCount++;
                            };
                        })
                    ];
                }
                if (action.type === 'doCancel') {
                    return [{ ...state, cancelled: true }, Effect.cancel('ts-self-id')];
                }
                if (action.type === 'late') {
                    return [{ ...state, count: state.count + 1 }, Effect.none()];
                }
                return [state, Effect.none()];
            };
            const store = createTestStore({ initialState: { cancelled: false, count: 0 }, reducer });
            await store.send({ type: 'init' });
            await store.receive({ type: 'doCancel' }, (state) => {
                expect(state.cancelled).toBe(true);
            });
            expect(cleanupRunCount).toBe(1);
            capturedDispatch?.({ type: 'late' });
            store.assertNoPendingActions();
            expect(store.getState().count).toBe(0);
            await store.finish(30);
            store.destroy();
        });
    });
    describe('DEF003: TestStore synchronous abort does not hang finish()', () => {
        it('Cancellable: synchronous self-cancellation by ID with unsettled promise does not hang finish()', async () => {
            type State = {
                cancelled: boolean;
            };
            type Action = {
                type: 'start';
            } | {
                type: 'cancelSelf';
            };
            const reducer: Reducer<State, Action> = (state, action) => {
                if (action.type === 'start') {
                    return [
                        state,
                        Effect.cancellable('self-abort-id', (dispatch) => {
                            dispatch({ type: 'cancelSelf' });
                            return new Promise<void>(() => { });
                        })
                    ];
                }
                if (action.type === 'cancelSelf') {
                    return [{ cancelled: true }, Effect.cancel('self-abort-id')];
                }
                return [state, Effect.none()];
            };
            const store = createTestStore({ initialState: { cancelled: false }, reducer });
            await store.send({ type: 'start' });
            await store.receive({ type: 'cancelSelf' }, (state) => {
                expect(state.cancelled).toBe(true);
            });
            await store.finish(30);
            store.destroy();
        });
        it('Cancellable: synchronous self-cancellation by group with unsettled promise does not hang finish()', async () => {
            type State = {
                cancelled: boolean;
            };
            type Action = {
                type: 'start';
            } | {
                type: 'cancelGroup';
            };
            const reducer: Reducer<State, Action> = (state, action) => {
                if (action.type === 'start') {
                    return [
                        state,
                        Effect.inGroup(Effect.cancellable('cancellable-grp', (dispatch) => {
                            dispatch({ type: 'cancelGroup' });
                            return new Promise<void>(() => { });
                        }), 'test-grp')
                    ];
                }
                if (action.type === 'cancelGroup') {
                    return [{ cancelled: true }, Effect.cancelGroup('test-grp')];
                }
                return [state, Effect.none()];
            };
            const store = createTestStore({ initialState: { cancelled: false }, reducer });
            await store.send({ type: 'start' });
            await store.receive({ type: 'cancelGroup' }, (state) => {
                expect(state.cancelled).toBe(true);
            });
            await store.finish(30);
            store.destroy();
        });
    });
});
for (const adapter of ['production', 'test'] as const) {
    for (const cancellation of ['id', 'group', 'replace', 'destroy'] as const) {
        it(`${adapter}: retained subscription callback is gated after ${cancellation}, cleanup once`, async () => {
            type A = {
                type: 'start' | 'cancel' | 'message';
            };
            const callbacks: Dispatch<A>[] = [];
            let cleanups = 0;
            const reducer: Reducer<number, A> = (state, action) => {
                if (action.type === 'start')
                    return [state, Effect.inGroup(Effect.subscription<A>('sub', dispatch => { callbacks.push(dispatch); return () => { cleanups++; }; }), 'g')];
                if (action.type === 'cancel')
                    return [state, cancellation === 'group' ? Effect.cancelGroup('g') : Effect.cancel('sub')];
                return [state + 1, Effect.none()];
            };
            const prod = adapter === 'production' ? createStore({ initialState: 0, reducer, ssr: { deferEffects: false } }) : undefined;
            const test = adapter === 'test' ? createTestStore({ initialState: 0, reducer }) : undefined;
            const send = async (action: A) => { if (test)
                await test.send(action);
            else
                prod!.dispatch(action); };
            const destroy = () => { prod?.destroy(); test?.destroy(); };
            try {
                await send({ type: 'start' });
                expect(callbacks).toHaveLength(1);
                callbacks[0]!({ type: 'message' });
                if (test)
                    await test.receive({ type: 'message' });
                expect(test ? test.getState() : prod!.state).toBe(1);
                if (cancellation === 'destroy')
                    destroy();
                else
                    await send({ type: cancellation === 'replace' ? 'start' : 'cancel' });
                expect(cleanups).toBe(1);
                callbacks[0]!({ type: 'message' });
                if (test && cancellation !== 'destroy')
                    test.assertNoPendingActions();
                expect(test ? test.getState() : prod!.state).toBe(1);
                if (cancellation === 'replace') {
                    callbacks[1]!({ type: 'message' });
                    if (test)
                        await test.receive({ type: 'message' });
                    expect(test ? test.getState() : prod!.state).toBe(2);
                }
            }
            finally {
                destroy();
            }
            expect(cleanups).toBe(cancellation === 'replace' ? 2 : 1);
        });
    }
    it(`${adapter}: cleanup reentrantly replacing a subscription keeps newest setup and disposes exactly once`, async () => {
        type A = {
            type: 'start';
            name: string;
        } | {
            type: 'cancel';
        };
        const started: string[] = [];
        const cleaned: string[] = [];
        let reentered = false;
        let rootDispatch!: Dispatch<A>;
        const reducer: Reducer<number, A> = (state, action) => {
            if (action.type === 'cancel')
                return [state, Effect.cancel('sub')];
            const name = action.name;
            return [state, Effect.subscription('sub', () => {
                    started.push(name);
                    return () => {
                        cleaned.push(name);
                        if (name === 'A' && !reentered) {
                            reentered = true;
                            rootDispatch({ type: 'start', name: 'C' });
                        }
                    };
                })];
        };
        const prod = adapter === 'production' ? createStore({ initialState: 0, reducer, ssr: { deferEffects: false } }) : undefined;
        const test = adapter === 'test' ? createTestStore({ initialState: 0, reducer }) : undefined;
        rootDispatch = action => { if (test)
            test.dispatch(action);
        else
            prod!.dispatch(action); };
        const send = async (action: A) => { if (test)
            await test.send(action);
        else
            prod!.dispatch(action); };
        try {
            await send({ type: 'start', name: 'A' });
            await send({ type: 'start', name: 'B' });
            if (test)
                await test.receive({ type: 'start', name: 'C' });
            expect(started).toEqual(['A', 'C']);
            expect(cleaned).toEqual(['A']);
            await send({ type: 'cancel' });
            expect(cleaned).toEqual(['A', 'C']);
            if (test)
                await test.finish(30);
        }
        finally {
            prod?.destroy();
            test?.destroy();
        }
        expect(cleaned).toEqual(['A', 'C']);
    });
}
it('TestStore: grouped Run synchronous self-abort leaves pending work immediately', async () => {
    type A = {
        type: 'start' | 'cancel';
    };
    const reducer: Reducer<number, A> = (state, action) => action.type === 'start'
        ? [state, Effect.inGroup(Effect.run<A>(dispatch => { dispatch({ type: 'cancel' }); return new Promise<void>(() => { }); }), 'g')]
        : [state, Effect.cancelGroup('g')];
    const store = createTestStore({ initialState: 0, reducer });
    try {
        await store.send({ type: 'start' });
        await store.receive({ type: 'cancel' });
        await store.finish(30);
    }
    finally {
        store.destroy();
    }
});
it('TestStore: setup self-cancels by group and late async cleanup failure is observed', async () => {
    type A = {
        type: 'start' | 'cancel' | 'late';
    };
    let cleanups = 0;
    let retained: Dispatch<A> | undefined;
    const reducer: Reducer<number, A> = (state, action) => {
        if (action.type === 'start')
            return [state, Effect.inGroup(Effect.subscription<A>('sub', dispatch => { retained = dispatch; dispatch({ type: 'cancel' }); return async () => { cleanups++; throw new Error('late setup cleanup'); }; }), 'g')];
        if (action.type === 'cancel')
            return [state, Effect.cancelGroup('g')];
        return [state + 1, Effect.none()];
    };
    const store = createTestStore({ initialState: 0, reducer });
    try {
        await store.send({ type: 'start' });
        // The cleanup can reject before receive checks failures, so consume the
        // expected diagnostic through finish and then assert the queued action.
        await expect(store.finish(30)).rejects.toThrow('late setup cleanup');
        await store.receive({ type: 'cancel' });
        retained?.({ type: 'late' });
        store.assertNoPendingActions();
        expect(store.getState()).toBe(0);
        expect(cleanups).toBe(1);
        await store.finish(30);
    }
    finally {
        store.destroy();
    }
    expect(cleanups).toBe(1);
});
for (const adapter of ['production', 'test'] as const) {
    it(`${adapter}: throwing cleanup cannot prevent later group member cleanup`, async () => {
        type A = {
            type: 'start' | 'cancel';
        };
        const cleaned: string[] = [];
        const reducer: Reducer<number, A> = (state, action) => action.type === 'start' ? [state, Effect.batch(Effect.inGroup(Effect.subscription('bad', () => () => { cleaned.push('bad'); throw new Error('expected disposer failure'); }), 'g'), Effect.inGroup(Effect.subscription('good', () => () => { cleaned.push('good'); }), 'g'))] : [state, Effect.cancelGroup('g')];
        if (adapter === 'production') {
            expectConsole('error', 1);
            const store = createStore({ initialState: 0, reducer, ssr: { deferEffects: false } });
            try {
                store.dispatch({ type: 'start' });
                store.dispatch({ type: 'cancel' });
                expect(cleaned).toEqual(['bad', 'good']);
            }
            finally {
                store.destroy();
            }
        }
        else {
            const store = createTestStore({ initialState: 0, reducer });
            try {
                await store.send({ type: 'start' });
                await store.send({ type: 'cancel' });
                await expect(store.finish(30)).rejects.toThrow('expected disposer failure');
                expect(cleaned).toEqual(['bad', 'good']);
                await store.finish(30);
            }
            finally {
                store.destroy();
            }
        }
        expect(cleaned).toEqual(['bad', 'good']);
    });
}
it('production: setup self-cancel observes late async cleanup exactly once', async () => {
    expectConsole('error', 1);
    type A = {
        type: 'start' | 'cancel' | 'late';
    };
    let count = 0;
    let retained: Dispatch<A> | undefined;
    const reducer: Reducer<number, A> = (state, action) => {
        if (action.type === 'start')
            return [state, Effect.inGroup(Effect.subscription<A>('sub', dispatch => { retained = dispatch; dispatch({ type: 'cancel' }); return async () => { count++; throw new Error('late setup cleanup'); }; }), 'g')];
        if (action.type === 'cancel')
            return [state, Effect.cancelGroup('g')];
        return [state + 1, Effect.none()];
    };
    const store = createStore({ initialState: 0, reducer, ssr: { deferEffects: false } });
    try {
        store.dispatch({ type: 'start' });
        await new Promise(resolve => setTimeout(resolve, 0));
        retained?.({ type: 'late' });
        expect(store.state).toBe(0);
        expect(count).toBe(1);
        expect(slot.calls.error).toHaveLength(1);
    }
    finally {
        store.destroy();
    }
    expect(count).toBe(1);
});
describe('F1: setup returning non-function is tolerated without spurious errors', () => {
    it('createStore: setup returning non-function does not log error on destroy', () => {
        expectConsole('error', 0);
        const reducer: Reducer<{
            ok: boolean;
        }, {
            type: 'start';
        }> = (state, action) => {
            if (action.type === 'start') {
                return [state, Effect.subscription('sub-num', (() => 12345 as any) as any)];
            }
            return [state, Effect.none()];
        };
        const store = createStore({ initialState: { ok: true }, reducer, ssr: { deferEffects: false } });
        store.dispatch({ type: 'start' });
        expect(() => store.destroy()).not.toThrow();
        expect(slot.calls.error).toHaveLength(0);
    });
    it('TestStore: setup returning non-function does not register a failure on finish', async () => {
        const reducer: Reducer<{
            ok: boolean;
        }, {
            type: 'start';
        }> = (state, action) => {
            if (action.type === 'start') {
                return [state, Effect.subscription('sub-num', (() => 12345 as any) as any)];
            }
            return [state, Effect.none()];
        };
        const store = createTestStore({ initialState: { ok: true }, reducer });
        await store.send({ type: 'start' });
        await store.finish(30);
        store.destroy();
    });
});
describe('F2: synchronous throw despite self-cancel is observed in TestStore', () => {
    it('Cancellable: synchronous throw in self-cancelling executor fails receive', async () => {
        type State = {
            cancelled: boolean;
        };
        type Action = {
            type: 'start';
        } | {
            type: 'cancelSelf';
        };
        const reducer: Reducer<State, Action> = (state, action) => {
            if (action.type === 'start') {
                return [
                    state,
                    Effect.cancellable('self-throw-id', (dispatch) => {
                        dispatch({ type: 'cancelSelf' });
                        throw new TypeError('synchronous cancellable failure');
                    })
                ];
            }
            if (action.type === 'cancelSelf') {
                return [{ cancelled: true }, Effect.cancel('self-throw-id')];
            }
            return [state, Effect.none()];
        };
        const store = createTestStore({ initialState: { cancelled: false }, reducer });
        await store.send({ type: 'start' });
        await expect(store.receive({ type: 'cancelSelf' })).rejects.toThrow('synchronous cancellable failure');
        store.destroy();
    });
    it('grouped Run: synchronous throw in self-aborting executor fails receive', async () => {
        type State = {
            cancelled: boolean;
        };
        type Action = {
            type: 'start';
        } | {
            type: 'cancelGroup';
        };
        const reducer: Reducer<State, Action> = (state, action) => {
            if (action.type === 'start') {
                return [
                    state,
                    Effect.inGroup(Effect.run((dispatch) => {
                        dispatch({ type: 'cancelGroup' });
                        throw new TypeError('synchronous run failure');
                    }), 'sync-grp')
                ];
            }
            if (action.type === 'cancelGroup') {
                return [{ cancelled: true }, Effect.cancelGroup('sync-grp')];
            }
            return [state, Effect.none()];
        };
        const store = createTestStore({ initialState: { cancelled: false }, reducer });
        await store.send({ type: 'start' });
        await expect(store.receive({ type: 'cancelGroup' })).rejects.toThrow('synchronous run failure');
        store.destroy();
    });
});
describe('F3: TestStore async subscription cleanup rejection at destruction', () => {
    it('TestStore: async cleanup rejection on destroy is surfaced via destroyAndSettle', async () => {
        type State = {
            status: string;
        };
        type Action = {
            type: 'start';
        };
        const reducer: Reducer<State, Action> = (state, action) => {
            if (action.type === 'start') {
                return [
                    { status: 'started' },
                    Effect.subscription('sub-destroy-async', () => async () => {
                        throw new Error('teststore destroy cleanup rejection');
                    })
                ];
            }
            return [state, Effect.none()];
        };
        const store = createTestStore({ initialState: { status: 'idle' }, reducer });
        await store.send({ type: 'start' });
        await expect(store.destroyAndSettle()).rejects.toThrow('teststore destroy cleanup rejection');
    });
});
describe('F4: Effect.cancel reentrantly installing successor under same id', () => {
    for (const adapter of ['production', 'test'] as const) {
        it(`${adapter}: Effect.cancel cleanup replacing subscription keeps successor and disposes once`, async () => {
            type Action = {
                type: 'start';
            } | {
                type: 'cancel';
            } | {
                type: 'reenter';
            } | {
                type: 'msg';
                val: string;
            };
            type State = {
                msgs: string[];
            };
            const cleaned: string[] = [];
            let successorDispatch: Dispatch<Action> | undefined;
            let rootDispatch!: Dispatch<Action>;
            const reducer: Reducer<State, Action> = (state, action) => {
                if (action.type === 'start') {
                    return [
                        state,
                        Effect.subscription('sub-reentrant', () => () => {
                            cleaned.push('initial');
                            rootDispatch({ type: 'reenter' });
                        })
                    ];
                }
                if (action.type === 'cancel') {
                    return [state, Effect.cancel('sub-reentrant')];
                }
                if (action.type === 'reenter') {
                    return [
                        state,
                        Effect.subscription('sub-reentrant', (dispatch) => {
                            successorDispatch = dispatch;
                            return () => {
                                cleaned.push('successor');
                            };
                        })
                    ];
                }
                if (action.type === 'msg') {
                    return [{ msgs: [...state.msgs, action.val] }, Effect.none()];
                }
                return [state, Effect.none()];
            };
            const prod = adapter === 'production' ? createStore({ initialState: { msgs: [] }, reducer, ssr: { deferEffects: false } }) : undefined;
            const test = adapter === 'test' ? createTestStore({ initialState: { msgs: [] }, reducer }) : undefined;
            rootDispatch = (a) => (test ? test.dispatch(a) : prod!.dispatch(a));
            const send = async (a: Action) => {
                if (test)
                    await test.send(a);
                else
                    prod!.dispatch(a);
            };
            try {
                await send({ type: 'start' });
                expect(cleaned).toEqual([]);
                await send({ type: 'cancel' });
                expect(cleaned).toEqual(['initial']);
                if (test)
                    await test.receive({ type: 'reenter' });
                expect(successorDispatch).toBeDefined();
                successorDispatch!({ type: 'msg', val: 'live' });
                if (test)
                    await test.receive({ type: 'msg', val: 'live' });
                expect(test ? test.getState().msgs : prod!.state.msgs).toEqual(['live']);
            }
            finally {
                if (test)
                    await test.destroyAndSettle();
                else
                    prod?.destroy();
            }
            expect(cleaned).toEqual(['initial', 'successor']);
        });
    }
});
describe('cleanup settlement is independent of executor lifetime', () => {
    for (const mode of ['cancel', 'replace', 'group'] as const) {
        it(`awaits cleanup begun by ${mode} before destruction`, async () => {
            type A = {
                type: 'start' | 'stop';
            };
            let rejectCleanup!: (error: Error) => void;
            const cleanup = new Promise<void>((_, reject) => { rejectCleanup = reject; });
            const store = createTestStore({ initialState: 0, reducer: (state: number, action: A) => [state,
                    action.type === 'start' ? Effect.inGroup(Effect.subscription<A>('old', () => () => cleanup), 'group') :
                        mode === 'cancel' ? Effect.cancel('old') : mode === 'group' ? Effect.cancelGroup('group') : Effect.subscription<A>('old', () => () => { })
                ] as const });
            await store.send({ type: 'start' });
            await store.send({ type: 'stop' });
            const settled = store.destroyAndSettle(100);
            const rejection = expect(settled).rejects.toThrow('cleanup started before destroy');
            await new Promise(resolve => setTimeout(resolve, 0));
            rejectCleanup(new Error('cleanup started before destroy'));
            await rejection;
        });
    }
    it('reports a pending cleanup at a real-time deadline and can later settle', async () => {
        let release!: () => void;
        const cleanup = new Promise<void>(resolve => { release = resolve; });
        const store = createTestStore({ initialState: 0, reducer: (state: number, _action: {
                type: 'start';
            }) => [state, Effect.subscription('pending', () => () => cleanup)] as const });
        await store.send({ type: 'start' });
        await expect(store.destroyAndSettle(5)).rejects.toThrow('1 pending subscription cleanup');
        release();
        await store.destroyAndSettle(100);
    });
    for (const adapter of ['production', 'test'] as const) {
        it(`${adapter}: destroy during setup disposes the late returned cleanup`, async () => {
            let destroy!: () => void;
            let disposed = 0;
            let dispatch!: Dispatch<{
                type: 'start' | 'late';
            }>;
            const reducer: Reducer<number, {
                type: 'start' | 'late';
            }> = (state, action) => action.type === 'start'
                ? [state, Effect.subscription('setup-destroy', send => { dispatch = send; destroy(); return () => { disposed++; }; })]
                : [state + 1, Effect.none()];
            const prod = adapter === 'production' ? createStore({ initialState: 0, reducer, ssr: { deferEffects: false } }) : undefined;
            const test = adapter === 'test' ? createTestStore({ initialState: 0, reducer }) : undefined;
            destroy = () => test ? test.destroy() : prod!.destroy();
            if (test)
                await test.send({ type: 'start' });
            else
                prod!.dispatch({ type: 'start' });
            dispatch({ type: 'late' });
            if (test)
                await test.destroyAndSettle();
            else
                prod!.destroy();
            expect(disposed).toBe(1);
            expect(test ? test.state : prod!.state).toBe(0);
        });
    }
});

it.skipIf(typeof window === 'undefined')('browser guard: a retired handle emits close but cannot overwrite reconnect state', async () => {
    type A = { type: 'connect' } | { type: 'status'; connected: boolean };
    const counts: number[] = [];
    let delivered = 0;
    const reducer: Reducer<boolean, A> = (state, action) => action.type === 'connect'
        ? [true, Effect.subscription('socket', dispatch => {
            const handle = new EventTarget();
            const index = counts.push(0) - 1;
            handle.addEventListener('close', () => { delivered++; dispatch({ type: 'status', connected: false }); });
            return () => { counts[index] = (counts[index] ?? 0) + 1; setTimeout(() => handle.dispatchEvent(new Event('close')), 0); };
        })]
        : [action.connected, Effect.none()];
    const store = createStore({ initialState: false, reducer });
    store.dispatch({ type: 'connect' });
    store.dispatch({ type: 'connect' });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(counts).toEqual([1, 0]);
    expect(delivered).toBe(1);
    expect(store.state).toBe(true);
    store.destroy();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(counts).toEqual([1, 1]);
    expect(delivered).toBe(2);
    expect(store.state).toBe(true);
});

for (const adapter of ['production', 'test'] as const) {
    it(`${adapter}: same-id executor and subscription are both cancelled`, async () => {
        type A = { type: 'start' | 'cancel' };
        let signal!: AbortSignal;
        let cleaned = 0;
        const reducer: Reducer<number, A> = (state, action) => [state, action.type === 'start'
            ? Effect.batch(Effect.cancellable('shared', (_, active) => { if (!active) throw new Error('Missing cancellation signal'); signal = active; return new Promise<void>(() => {}); }), Effect.subscription('shared', () => () => { cleaned++; }))
            : Effect.cancel('shared')];
        const prod = adapter === 'production' ? createStore({ initialState: 0, reducer, ssr: { deferEffects: false } }) : undefined;
        const test = adapter === 'test' ? createTestStore({ initialState: 0, reducer }) : undefined;
        if (test) { await test.send({ type: 'start' }); await test.send({ type: 'cancel' }); await test.finish(50); await test.destroyAndSettle(); }
        else { prod!.dispatch({ type: 'start' }); prod!.dispatch({ type: 'cancel' }); prod!.destroy(); }
        expect(signal.aborted).toBe(true);
        expect(cleaned).toBe(1);
    });
    it(`${adapter}: previous cleanup destroying the store prevents replacement setup`, async () => {
        type A = { type: 'start' };
        let destroy!: () => void;
        let setups = 0;
        const reducer: Reducer<number, A> = state => [state, Effect.subscription('replace', () => { setups++; return () => { destroy(); }; })];
        const prod = adapter === 'production' ? createStore({ initialState: 0, reducer, ssr: { deferEffects: false } }) : undefined;
        const test = adapter === 'test' ? createTestStore({ initialState: 0, reducer }) : undefined;
        destroy = () => test ? test.destroy() : prod!.destroy();
        if (test) { await test.send({ type: 'start' }); await test.send({ type: 'start' }); await test.destroyAndSettle(); }
        else { prod!.dispatch({ type: 'start' }); prod!.dispatch({ type: 'start' }); prod!.destroy(); }
        expect(setups).toBe(1);
    });
}
for (const kind of ['cancellable', 'grouped run'] as const) {
    it(`TestStore: asynchronous abort of ${kind} ignores a later rejection without an unhandled promise`, async () => {
        type A = { type: 'start' | 'cancel' };
        let reject!: (error: Error) => void;
        const execute = () => new Promise<void>((_, fail) => { reject = fail; });
        const store = createTestStore({ initialState: 0, reducer: (state: number, action: A) => action.type === 'start'
            ? [state, kind === 'cancellable' ? Effect.cancellable('pending', execute) : Effect.inGroup(Effect.run(execute), 'pending')]
            : [state, kind === 'cancellable' ? Effect.cancel('pending') : Effect.cancelGroup('pending')] });
        await store.send({ type: 'start' });
        await store.send({ type: 'cancel' });
        await store.finish(50);
        reject(new Error('late rejected abandoned work'));
        await new Promise(resolve => setTimeout(resolve, 0));
        await store.finish(50);
        await store.destroyAndSettle();
    });
}

for (const adapter of ['production', 'test'] as const) {
    for (const operation of ['cancel', 'replace'] as const) {
        for (const successor of ['debounce', 'throttle', 'cancellable'] as const) {
            it(`${adapter}: ${operation} preserves reentrant ${successor} ownership`, async () => {
                type A = { type: 'start' | 'operate' | 'successor' | 'cancelAgain' | 'message' };
                let dispatch!: Dispatch<A>;
                let successorSignal: AbortSignal | undefined;
                let sendSuccessor!: Dispatch<A>;
                let outerStarted = 0;
                const reducer: Reducer<number, A> = (state, action) => {
                    if (action.type === 'start') return [state, Effect.subscription('shared', () => () => dispatch({ type: 'successor' }))];
                    if (action.type === 'operate') return [state, operation === 'cancel' ? Effect.cancel('shared') : Effect.cancellable('shared', () => { outerStarted++; })];
                    if (action.type === 'cancelAgain') return [state, Effect.cancel('shared')];
                    if (action.type === 'message') return [state + 1, Effect.none()];
                    const send = (send: Dispatch<A>) => send({ type: 'message' });
                    if (successor === 'debounce') return [state, Effect.debounced('shared', 5, send)];
                    if (successor === 'throttle') return [state, Effect.batch(Effect.throttled('shared', 5, send), Effect.throttled('shared', 5, send))];
                    return [state, Effect.cancellable('shared', (send, signal) => {
                        successorSignal = signal;
                        sendSuccessor = send;
                        return new Promise<void>(() => {});
                    })];
                };
                const prod = adapter === 'production' ? createStore({ initialState: 0, reducer, ssr: { deferEffects: false } }) : undefined;
                const test = adapter === 'test' ? createTestStore({ initialState: 0, reducer }) : undefined;
                dispatch = action => test ? test.dispatch(action) : prod!.dispatch(action);
                const send = async (action: A) => { if (test) await test.send(action); else prod!.dispatch(action); };
                try {
                    await send({ type: 'start' });
                    await send({ type: 'operate' });
                    if (test) await test.receive({ type: 'successor' });
                    if (successor === 'cancellable') {
                        expect(successorSignal).toBeDefined();
                        expect(successorSignal!.aborted).toBe(false);
                        expect(outerStarted).toBe(0);
                        sendSuccessor({ type: 'message' });
                    }
                    const expected = successor === 'throttle' ? 2 : 1;
                    if (test) for (let i = 0; i < expected; i++) await test.receive({ type: 'message' }, undefined, 100);
                    else await new Promise(resolve => setTimeout(resolve, 10));
                    expect(test ? test.state : prod!.state).toBe(expected);
                    await send({ type: 'cancelAgain' });
                    if (successor === 'cancellable') expect(successorSignal!.aborted).toBe(true);
                    if (test) await test.finish(100);
                } finally {
                    if (test) await test.destroyAndSettle(); else prod!.destroy();
                }
            });
        }
    }
    it(`${adapter}: a destroy inside a batch prevents later resource enrollment or work`, async () => {
        let destroy!: () => void;
        let started = 0;
        type A = { type: 'start' };
        const reducer: Reducer<number, A> = state => [state, Effect.batch(
            Effect.fireAndForget(() => destroy()),
            Effect.inGroup(Effect.subscription('late', () => { started++; return () => {}; }), 'late-group'),
            Effect.run(() => { started++; }),
            Effect.debounced('late', 0, () => { started++; })
        )];
        const prod = adapter === 'production' ? createStore({ initialState: 0, reducer, ssr: { deferEffects: false } }) : undefined;
        const test = adapter === 'test' ? createTestStore({ initialState: 0, reducer }) : undefined;
        destroy = () => test ? test.destroy() : prod!.destroy();
        if (test) await test.send({ type: 'start' }); else prod!.dispatch({ type: 'start' });
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(started).toBe(0);
        if (test) await test.destroyAndSettle();
    });
}

for (const adapter of ['production', 'test'] as const) {
    for (const outcome of ['resolve', 'reject'] as const) {
        it(`${adapter}: invalid async subscription setup is reported and observed (${outcome})`, async () => {
            let cleaned = 0;
            let callback!: Dispatch<{ type: 'start' | 'late' }>;
            const setup = (dispatch: Dispatch<{ type: 'start' | 'late' }>) => {
                callback = dispatch;
                return outcome === 'resolve' ? Promise.resolve(() => { cleaned++; }) : Promise.reject(new Error('invalid async setup rejection'));
            };
            const reducer: Reducer<number, { type: 'start' | 'late' }> = (state, action) => action.type === 'start'
                ? [state, Effect.subscription('invalid-setup', setup as unknown as (dispatch: Dispatch<{ type: 'start' | 'late' }>) => () => void)]
                : [state + 1, Effect.none()];
            if (adapter === 'production') {
                expectConsole('error', 1);
                const store = createStore({ initialState: 0, reducer, ssr: { deferEffects: false } });
                store.dispatch({ type: 'start' });
                await new Promise(resolve => setTimeout(resolve, 0));
                callback({ type: 'late' });
                expect(store.state).toBe(0);
                expect(String(slot.calls.error[0]![1])).toContain('setup must return a cleanup function synchronously');
                store.destroy();
            } else {
                const store = createTestStore({ initialState: 0, reducer });
                await store.send({ type: 'start' });
                await expect(store.finish(100)).rejects.toThrow('setup must return a cleanup function synchronously');
                await new Promise(resolve => setTimeout(resolve, 0));
                callback({ type: 'late' });
                expect(store.state).toBe(0);
                await store.destroyAndSettle();
            }
            expect(cleaned).toBe(outcome === 'resolve' ? 1 : 0);
        });
    }
}
