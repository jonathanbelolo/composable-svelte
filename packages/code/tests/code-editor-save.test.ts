import { describe, it, expect, vi } from 'vitest';
import { createStore } from '@composable-svelte/core';
import { codeEditorReducer } from '../src/lib/code-editor/code-editor.reducer.js';
import { createInitialState, type CodeEditorState, type CodeEditorAction } from '../src/lib/code-editor/code-editor.types.js';
function deferred() {
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<void>((a, b) => { resolve = a; reject = b; });
    return { promise, resolve, reject };
}
function fixture(initialState: CodeEditorState = createInitialState({ value: 'initial' })) {
    const pending: Array<ReturnType<typeof deferred>> = [];
    const writes: string[] = [];
    const signals: Array<AbortSignal | undefined> = [];
    const store = createStore({ initialState, reducer: codeEditorReducer, ssr: { deferEffects: false }, dependencies: { onSave(value: string, signal?: AbortSignal) { signals.push(signal); writes.push(value); const next = deferred(); pending.push(next); return next.promise; } } });
    const edit = (value: string) => store.dispatch({ type: 'valueChanged', value });
    const save = () => store.dispatch({ type: 'save' });
    const complete = async (index: number, error?: Error) => { const task = pending[index]!; if (error)
        task.reject(error);
    else
        task.resolve(); await task.promise.catch(() => { }); await Promise.resolve(); };
    return { store, pending, writes, signals, edit, save, complete };
}
describe('editor explicit save snapshot ordering', () => {
    it('keeps edits made during a save dirty without automatically saving them', async () => {
        const f = fixture();
        try {
            f.edit('A');
            f.save();
            f.edit('B');
            await f.complete(0);
            expect(f.writes).toEqual(['A']);
            expect(f.store.state.lastSavedValue).toBe('A');
            expect(f.store.state.hasUnsavedChanges).toBe(true);
            expect(f.store.state.isSaving).toBe(false);
            f.save();
            expect(f.writes).toEqual(['A', 'B']);
            await f.complete(1);
            expect(f.store.state.hasUnsavedChanges).toBe(false);
        }
        finally {
            f.store.destroy();
        }
    });
    it('serializes and coalesces three explicit save requests, never substituting unrequested edits', async () => {
        const f = fixture();
        try {
            f.edit('A');
            f.save();
            f.edit('B');
            f.save();
            f.edit('C');
            f.save();
            f.edit('D');
            expect(f.writes).toEqual(['A']);
            await f.complete(0);
            expect(f.writes).toEqual(['A', 'C']);
            expect(f.store.state.lastSavedValue).toBe('A');
            await f.complete(1);
            expect(f.store.state.lastSavedValue).toBe('C');
            expect(f.store.state.value).toBe('D');
            expect(f.store.state.hasUnsavedChanges).toBe(true);
            expect(f.store.state.isSaving).toBe(false);
        }
        finally {
            f.store.destroy();
        }
    });
    it('starts queued save after earlier failure and clears the obsolete error immediately', async () => {
        const f = fixture();
        try {
            f.edit('A');
            f.save();
            f.edit('B');
            f.save();
            await f.complete(0, new Error('first failed'));
            expect(f.writes).toEqual(['A', 'B']);
            expect(f.store.state.saveError).toBeNull();
            expect(f.store.state.isSaving).toBe(true);
            await f.complete(1);
            expect(f.store.state.lastSavedValue).toBe('B');
            expect(f.store.state.hasUnsavedChanges).toBe(false);
        }
        finally {
            f.store.destroy();
        }
    });
    it('allows retry after failure without a queue', async () => {
        const f = fixture();
        try {
            f.edit('A');
            f.save();
            await f.complete(0, new Error('failed'));
            expect(f.store.state.saveError).toBe('failed');
            expect(f.store.state.isSaving).toBe(false);
            f.save();
            expect(f.store.state.saveError).toBeNull();
            await f.complete(1);
            expect(f.writes).toEqual(['A', 'A']);
            expect(f.store.state.hasUnsavedChanges).toBe(false);
        }
        finally {
            f.store.destroy();
        }
    });
    it('drops stale and duplicate correlated success/failure after settlement', async () => {
        const f = fixture();
        try {
            f.edit('A');
            f.save();
            f.edit('B');
            f.save();
            await f.complete(0);
            const active = f.store.state;
            f.store.dispatch({ type: 'saved', value: 'obsolete', attemptId: 1 });
            f.store.dispatch({ type: 'saveFailed', error: 'obsolete', attemptId: 1 });
            expect(f.store.state).toBe(active);
            await f.complete(1);
            const settled = f.store.state;
            f.store.dispatch({ type: 'saved', value: 'duplicate', attemptId: 2 });
            f.store.dispatch({ type: 'saveFailed', error: 'duplicate', attemptId: 2 });
            expect(f.store.state).toBe(settled);
        }
        finally {
            f.store.destroy();
        }
    });
    it('supports legacy structural state with missing optional save metadata', async () => {
        const { isSaving, saveAttempt, queuedSaveValue, ...legacy } = createInitialState({ value: 'initial' });
        const compatible: CodeEditorState = legacy;
        const f = fixture(compatible);
        try {
            f.edit('A');
            f.save();
            expect(f.store.state.saveAttempt).toBe(1);
            await f.complete(0);
            expect(f.writes).toEqual(['A']);
            expect(f.store.state.isSaving).toBe(false);
        }
        finally {
            f.store.destroy();
        }
    });
    it('treats empty-string queued saves as real requests', async () => {
        const f = fixture();
        try {
            f.edit('A');
            f.save();
            f.edit('');
            f.save();
            await f.complete(0);
            expect(f.writes).toEqual(['A', '']);
            await f.complete(1);
            expect(f.store.state.lastSavedValue).toBe('');
            expect(f.store.state.hasUnsavedChanges).toBe(false);
        }
        finally {
            f.store.destroy();
        }
    });
    it('queues an explicit reversion to the prior saved value while another write is in flight', async () => {
        const f = fixture({ ...createInitialState({ value: 'initial' }), lastSavedValue: 'initial' });
        try {
            f.edit('A');
            f.save();
            f.edit('initial');
            expect(f.store.state.hasUnsavedChanges).toBe(false);
            f.save();
            await f.complete(0);
            expect(f.writes).toEqual(['A', 'initial']);
            await f.complete(1);
            expect(f.store.state.hasUnsavedChanges).toBe(false);
        }
        finally {
            f.store.destroy();
        }
    });
    it('preserves explicitly requested persistence when readOnly changes during a save', async () => {
        const f = fixture();
        try {
            f.edit('A');
            f.save();
            f.edit('B');
            f.save();
            f.store.dispatch({ type: 'setReadOnly', readOnly: true });
            await f.complete(0);
            expect(f.writes).toEqual(['A', 'B']);
            await f.complete(1);
            expect(f.store.state.readOnly).toBe(true);
            expect(f.store.state.lastSavedValue).toBe('B');
            expect(f.store.state.hasUnsavedChanges).toBe(false);
        }
        finally {
            f.store.destroy();
        }
    });
    it('does not launch queued writes or dispatch late results after destruction', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => { });
        const f = fixture();
        try {
            f.edit('A');
            f.save();
            f.edit('B');
            f.save();
            expect(f.signals[0]).toBeInstanceOf(AbortSignal);
            expect(f.signals[0]!.aborted).toBe(false);
            f.store.destroy();
            expect(f.signals[0]!.aborted).toBe(true);
            const state = f.store.state;
            await f.complete(0);
            expect(f.writes).toEqual(['A']);
            expect(f.store.state).toBe(state);
            expect(warn).not.toHaveBeenCalled();
        }
        finally {
            f.store.destroy();
            warn.mockRestore();
        }
    });
    it('does not begin persistence if a synchronous state observer destroys the store before effect start', () => {
        const f = fixture();
        const unsubscribe = f.store.subscribe(state => { if (state.isSaving)
            f.store.destroy(); });
        try {
            f.edit('A');
            f.save();
            expect(f.writes).toEqual([]);
        }
        finally {
            unsubscribe();
            f.store.destroy();
        }
    });
    it('coalesces a duplicate request for the active snapshot on success, but retries it after failure', async () => {
        for (const fail of [false, true]) {
            const f = fixture();
            try {
                f.edit('A');
                f.save();
                f.save();
                await f.complete(0, fail ? new Error('failed') : undefined);
                expect(f.writes).toEqual(fail ? ['A', 'A'] : ['A']);
                if (fail)
                    await f.complete(1);
                expect(f.store.state.hasUnsavedChanges).toBe(false);
            }
            finally {
                f.store.destroy();
            }
        }
    });
    it('keeps uncorrelated legacy completion compatibility only outside an active correlated save', () => {
        const state = createInitialState({ value: 'newer' });
        const [next] = codeEditorReducer(state, { type: 'saved', value: 'older' }, {});
        expect(next.lastSavedValue).toBe('older');
        expect(next.hasUnsavedChanges).toBe(true);
        const [active] = codeEditorReducer({ ...state, hasUnsavedChanges: true }, { type: 'save' }, {});
        expect(codeEditorReducer(active, { type: 'saved', value: 'unidentified' }, {})[0]).toBe(active);
    });
});
describe('save failure and dependency edge paths', () => {
    for (const mode of ['missing', 'throw', 'reject'] as const) {
        it(`settles ${mode} handler through the actual store`, async () => {
            let done!: () => void;
            const terminal = new Promise<void>(resolve => { done = resolve; });
            const dependencies = mode === 'missing' ? {} : { onSave: mode === 'throw' ? () => { throw new Error('sync failure'); } : async () => { throw 'opaque failure'; } };
            const store = createStore({ initialState: { ...createInitialState({ value: 'A' }), hasUnsavedChanges: true }, reducer: codeEditorReducer, dependencies, ssr: { deferEffects: false } });
            const stop = store.subscribeToActions!(a => { if (a.type === 'saved' || a.type === 'saveFailed')
                done(); });
            try {
                store.dispatch({ type: 'save' });
                await terminal;
                expect(store.state.isSaving).toBe(false);
                expect(store.state.saveError).toBe(mode === 'missing' ? null : mode === 'throw' ? 'sync failure' : 'Save failed');
                expect(store.state.hasUnsavedChanges).toBe(mode !== 'missing');
            }
            finally {
                stop();
                store.destroy();
            }
        });
    }
    it('retains the last successful baseline if the latest queued request fails', async () => {
        const f = fixture();
        try {
            f.edit('A');
            f.save();
            f.edit('B');
            f.save();
            f.edit('C');
            f.save();
            await f.complete(0);
            await f.complete(1, new Error('latest failed'));
            expect(f.writes).toEqual(['A', 'C']);
            expect(f.store.state.lastSavedValue).toBe('A');
            expect(f.store.state.hasUnsavedChanges).toBe(true);
            expect(f.store.state.saveError).toBe('latest failed');
            expect(f.store.state.isSaving).toBe(false);
            f.save();
            await f.complete(2);
            expect(f.writes).toEqual(['A', 'C', 'C']);
            expect(f.store.state.hasUnsavedChanges).toBe(false);
        }
        finally {
            f.store.destroy();
        }
    });
});
describe('save executor error boundaries', () => {
    it('does not convert a throwing completion dispatcher into a persistence failure', async () => {
        const [, effect] = codeEditorReducer({ ...createInitialState({ value: 'A' }), hasUnsavedChanges: true }, { type: 'save' }, { onSave: async () => { } });
        expect(effect._tag).toBe('Run');
        if (effect._tag !== 'Run')
            throw new Error('Expected save executor');
        const observed: CodeEditorAction[] = [];
        const error = new Error('application reducer failed');
        await expect(effect.execute(action => { observed.push(action); throw error; })).rejects.toBe(error);
        expect(observed).toEqual([{ type: 'saved', value: 'A', attemptId: 1 }]);
    });
    it('normalizes absent legacy attempt to zero without accepting arbitrary generations', () => {
        const { saveAttempt, ...legacy } = createInitialState({ value: 'A' });
        const state = { ...legacy, isSaving: true };
        expect(codeEditorReducer(state, { type: 'saved', value: 'A', attemptId: 1 }, {})[0]).toBe(state);
        expect(codeEditorReducer(state, { type: 'saved', value: 'A', attemptId: 0 }, {})[0].isSaving).toBe(false);
    });
});
