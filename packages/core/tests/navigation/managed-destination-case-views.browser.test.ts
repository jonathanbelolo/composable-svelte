import { it, expect } from 'vitest';
import { mount, unmount, tick, type Component, type Snippet } from 'svelte';
import { createStore } from '../../src/lib/store.svelte.js';
import { Effect } from '../../src/lib/effect.js';
import type { Reducer } from '../../src/lib/types.js';
import {
    destinationSlot,
    optionalSlot,
    nestedSlot,
    ManagedIntegrationBuilder
} from '../../src/lib/navigation/managed-integration.js';
import { capturedView } from '../../src/lib/execution/store-access.js';
import type { PresentationAction } from '../../src/lib/navigation/types.js';
import { createDestination } from '../../src/lib/navigation/destination.js';
import { defineViews, type FeatureViewProps } from '../../src/lib/application/view-definition.js';
import { bindViewDefinition, resolveView, placementDeclarations } from '../../src/lib/application/view-binding.js';
import type { ApplicationInstance } from '../../src/lib/application/index.js';
import { bindManagedProjection } from '../../src/lib/execution/store-access.js';
import { PlacementScope } from '../../src/lib/application/renderer/placement.svelte.js';
import ManagedDestinationCaseHarness from '../fixtures/ManagedDestinationCaseHarness.svelte';
import {
    hostedPlan,
    hostedSlot,
    type HostedState,
    type HostedAction
} from '../fixtures/ManagedDestinationCaseModel.js';

interface CounterState { count: number; }
type CounterAction = { type: 'inc' };
const counterReducer: Reducer<CounterState, CounterAction, any> = (state, action) => [
    action.type === 'inc' ? { count: state.count + 1 } : state,
    Effect.none()
];

interface EditorState { text: string; }
type EditorAction = { type: 'write'; text: string };
const editorReducer: Reducer<EditorState, EditorAction, any> = (state, action) => [
    action.type === 'write' ? { text: action.text } : state,
    Effect.none()
];

const destination = createDestination({
    counter: counterReducer,
    editor: editorReducer
});

interface RootState {
    tick: number;
    dest: { type: 'counter'; state: CounterState } | { type: 'editor'; state: EditorState } | null;
}
type RootAction =
    | { type: 'tick' }
    | { type: 'openCounter'; count: number }
    | { type: 'openEditor'; text: string }
    | { type: 'close' }
    | { type: 'dest'; action: PresentationAction<
          | { type: 'counter'; action: CounterAction }
          | { type: 'editor'; action: EditorAction }
      > };

const rootReducer: Reducer<RootState, RootAction, any> = (state, action) => {
    if (action.type === 'tick') return [{ ...state, tick: state.tick + 1 }, Effect.none()];
    if (action.type === 'openCounter') return [{ ...state, dest: destination.initial('counter', { count: action.count }) }, Effect.none()];
    if (action.type === 'openEditor') return [{ ...state, dest: destination.initial('editor', { text: action.text }) }, Effect.none()];
    if (action.type === 'close') return [{ ...state, dest: null }, Effect.none()];
    return [state, Effect.none()];
};

const destSlot = destinationSlot<RootState, RootAction>()('dest', destination);
const composition = new ManagedIntegrationBuilder(rootReducer)
    .with(destSlot, { replaceOn: action => action.type === 'openCounter' })
    .build();

const CounterComponent = ((() => null) as unknown) as Component<FeatureViewProps<CounterState, CounterAction>>;
const EditorSnippet = ((() => null) as unknown) as Snippet<[FeatureViewProps<EditorState, EditorAction>]>;
const RootComponent = ((() => null) as unknown) as Component<FeatureViewProps<RootState, RootAction>>;

it('rejects missing, extra, prototype keys and forbidden modes before startup', () => {
    const forged = (dec: unknown) => Reflect.apply(defineViews, undefined, [composition, dec]);
    expect(() => forged({ dest: { cases: { counter: { render: CounterComponent } } } })).toThrow('Destination slot \'dest\' requires cases: counter, editor');
    expect(() => forged({ dest: { cases: { counter: { render: CounterComponent }, editor: { content: EditorSnippet }, extra: { headless: true } } } })).toThrow('Destination slot \'dest\' requires cases: counter, editor');
    const protoCases = Object.create({ editor: { content: EditorSnippet } });
    protoCases.counter = { render: CounterComponent };
    expect(() => forged({ dest: { cases: protoCases } })).toThrow('Destination slot \'dest\' requires cases: counter, editor');
    expect(() => forged({ dest: { render: CounterComponent } })).toThrow("Destination slot 'dest' declares views per case");
    expect(() => forged({ dest: { content: EditorSnippet } })).toThrow("Destination slot 'dest' declares views per case");
    expect(() => forged({ dest: { children: {} as any } })).toThrow("Destination slot 'dest' declares views per case");
    expect(() => forged({ dest: { headless: true, cases: { counter: { render: CounterComponent }, editor: { content: EditorSnippet } } } })).toThrow("Slot 'dest' requires exactly one rendering mode");
    expect(() => forged({ dest: { cases: { counter: { render: CounterComponent, children: {} as any }, editor: { content: EditorSnippet } } } })).toThrow("cannot declare children or cases");
    expect(() => forged({ dest: { cases: { counter: { render: CounterComponent, cases: {} as any }, editor: { content: EditorSnippet } } } })).toThrow("cannot declare children or cases");
    expect(() => forged({ dest: { cases: { counter: { render: CounterComponent, headless: true }, editor: { content: EditorSnippet } } } })).toThrow("requires exactly one rendering mode");
    expect(() => forged({ dest: { cases: { counter: { headless: false }, editor: { content: EditorSnippet } } } })).toThrow("requires exactly one rendering mode");
});

it('rejects cases declaration on a non-destination slot', () => {
    interface OptState { opt: { value: number } | null; }
    type OptAction = { type: 'opt'; action: PresentationAction<{ type: 'set' }> };
    const optReducer: Reducer<OptState, OptAction, any> = s => [s, Effect.none()];
    const opt = optionalSlot<OptState, OptAction>()('opt');
    const child: Reducer<{ value: number }, { type: 'set' }, any> = s => [s, Effect.none()];
    const comp = new ManagedIntegrationBuilder(optReducer).with(opt, child).build();
    expect(() => defineViews(comp, { opt: { cases: { x: { headless: true } } } as any })).toThrow("Slot 'opt' cannot declare cases");
});

it('resolves active case, preserves stable same-case view identity, remounts on case change, and retires stale handles', () => {
    const plan = defineViews(composition, {
        dest: {
            cases: {
                counter: { render: CounterComponent },
                editor: { content: EditorSnippet }
            }
        }
    });
    const store = createStore({
        initialState: { tick: 0, dest: { type: 'counter', state: { count: 10 } } },
        ...composition,
        dependencies: {}
    });
    const views = bindViewDefinition(store, plan);
    const first = resolveView(views.dest);
    expect(first).toHaveLength(1);
    expect(first[0]!.render).toBe(CounterComponent);
    expect(first[0]!.content).toBeUndefined();
    expect(first[0]!.views).toEqual({});
    expect(Object.isFrozen(first[0]!.views)).toBe(true);
    expect(first[0]!.store.state).toEqual({ count: 10 });

    store.dispatch({ type: 'tick' });
    const second = resolveView(views.dest);
    expect(second[0]).toBe(first[0]);
    expect(second[0]!.key).toBe(first[0]!.key);

    store.dispatch({ type: 'openCounter', count: 20 });
    const replacement = resolveView(views.dest);
    expect(replacement).toHaveLength(1);
    expect(replacement[0]).not.toBe(second[0]);
    expect(replacement[0]!.key).not.toBe(second[0]!.key);
    second[0]!.store.dispatch({ type: 'inc' });
    expect(store.state.dest).toEqual({ type: 'counter', state: { count: 20 } });
    replacement[0]!.store.dispatch({ type: 'inc' });
    expect(store.state.dest).toEqual({ type: 'counter', state: { count: 21 } });

    store.dispatch({ type: 'openEditor', text: 'hello' });
    const third = resolveView(views.dest);
    expect(third).toHaveLength(1);
    expect(third[0]).not.toBe(first[0]);
    expect(third[0]!.key).not.toBe(first[0]!.key);
    expect(third[0]!.content).toBe(EditorSnippet);
    expect(third[0]!.render).toBeUndefined();
    expect(third[0]!.store.state).toEqual({ text: 'hello' });

    first[0]!.store.dispatch({ type: 'inc' });
    expect(store.state.dest?.type).toBe('editor');

    store.dispatch({ type: 'close' });
    expect(resolveView(views.dest)).toEqual([]);
    store.destroy();
});

it('produces no instance for headless case but maintains correct placement requirements', () => {
    const mixedPlan = defineViews(composition, {
        dest: {
            cases: {
                counter: { render: CounterComponent },
                editor: { headless: true }
            }
        }
    });
    const store = createStore({
        initialState: { tick: 0, dest: { type: 'editor', state: { text: 'headless' } } },
        ...composition,
        dependencies: {}
    });
    const views = bindViewDefinition(store, mixedPlan);
    expect(resolveView(views.dest)).toEqual([]);
    const mixedDecl = placementDeclarations(views);
    expect(mixedDecl.get(views.dest)?.required).toBe(true);

    const scope = new PlacementScope(views, undefined);
    expect(() => scope.verify()).toThrow();
    const release = scope.claim(views.dest);
    expect(() => scope.verify()).not.toThrow();
    release();
    scope.dispose();

    const allHeadlessPlan = defineViews(composition, {
        dest: {
            cases: {
                counter: { headless: true },
                editor: { headless: true }
            }
        }
    });
    const allHeadlessViews = bindViewDefinition(store, allHeadlessPlan);
    expect(placementDeclarations(allHeadlessViews).get(allHeadlessViews.dest)?.required).toBe(false);
    const allHeadlessScope = new PlacementScope(allHeadlessViews, undefined);
    expect(() => allHeadlessScope.verify()).not.toThrow();
    allHeadlessScope.dispose();

    const whollyHeadlessPlan = defineViews(composition, {
        dest: { headless: true }
    });
    const whollyHeadlessViews = bindViewDefinition(store, whollyHeadlessPlan);
    expect(placementDeclarations(whollyHeadlessViews).get(whollyHeadlessViews.dest)?.required).toBe(false);
    expect(resolveView(whollyHeadlessViews.dest)).toEqual([]);
    store.destroy();
});

it('reuses direct store binding and FeatureViews unprefixed case view', () => {
    const plan = defineViews(composition, {
        dest: {
            cases: {
                counter: { render: CounterComponent },
                editor: { content: EditorSnippet }
            }
        }
    });
    const store = createStore({
        initialState: { tick: 0, dest: { type: 'counter', state: { count: 42 } } },
        ...composition,
        dependencies: {}
    });
    const direct = composition.bind(store, destSlot.case('counter'));
    const views = bindViewDefinition(store, plan);
    const feat = resolveView(views.dest)[0]!;
    expect(feat.store).toBe(direct);
    store.destroy();
});

it('binds a destination through a real nested managed composition and retires every parent-scoped handle', () => {
    interface ShellState { root: RootState | null; }
    type ShellAction =
        | { type: 'root'; action: PresentationAction<RootAction> }
        | { type: 'removeRoot' };
    const rootSlot = optionalSlot<ShellState, ShellAction>()('root');
    const shellReducer: Reducer<ShellState, ShellAction, any> = (state, action) =>
        action.type === 'removeRoot' ? [{ root: null }, Effect.none()] : [state, Effect.none()];
    const shell = new ManagedIntegrationBuilder(shellReducer)
        .with(rootSlot, composition)
        .build();
    const innerPlan = defineViews(composition, {
        dest: { cases: { counter: { render: CounterComponent }, editor: { content: EditorSnippet } } }
    });
    const shellPlan = defineViews(shell, {
        root: { render: RootComponent, children: innerPlan }
    });
    const store = createStore({
        initialState: { root: { tick: 0, dest: { type: 'counter', state: { count: 7 } } } },
        ...shell,
        dependencies: {}
    });
    try {
        const shellViews = bindViewDefinition(store, shellPlan);
        const parent = resolveView(shellViews.root)[0]!;
        const nested = resolveView(parent.views.dest!)[0]!;
        const directSlot = nestedSlot(rootSlot, destSlot.case('counter'));
        const direct = shell.bind(store, directSlot)!;

        expect(nested.store.state).toEqual({ count: 7 });
        expect(direct.state).toEqual({ count: 7 });
        expect(capturedView(nested.store).origin).toBe(capturedView(direct).origin);
        nested.store.dispatch({ type: 'inc' });
        direct.dispatch({ type: 'inc' });
        expect(store.state.root?.dest).toEqual({ type: 'counter', state: { count: 9 } });

        store.dispatch({ type: 'removeRoot' });
        expect(resolveView(shellViews.root)).toEqual([]);
        expect(resolveView(parent.views.dest!)).toEqual([]);
        expect(nested.store.state).toBeUndefined();
        expect(direct.state).toBeUndefined();
        nested.store.dispatch({ type: 'inc' });
        direct.dispatch({ type: 'inc' });
        expect(store.state.root).toBeNull();
    } finally {
        store.destroy();
    }
});

it('renders and remounts destination cases through a hosted application projection', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    let app!: ApplicationInstance<HostedState, HostedAction>;
    const component = mount(ManagedDestinationCaseHarness, {
        target,
        props: {
            input: 4,
            onApp: (value: ApplicationInstance<HostedState, HostedAction>) => { app = value; }
        }
    });
    try {
        await tick();
        const firstNode = target.querySelector('[data-destination-case="counter"]')!;
        expect(firstNode.textContent).toBe('4');

        const projectionViews = bindViewDefinition(app.store, hostedPlan);
        const projected = resolveView(projectionViews.dest!)[0]!;
        const direct = bindManagedProjection(app.store, hostedSlot.case('counter'))!;
        expect(projected.store).toBe(direct);
        expect(projected.store.state).toEqual({ count: 4 });

        app.store.dispatch({ type: 'openCounter', count: 10 });
        await tick();
        const replacementNode = target.querySelector('[data-destination-case="counter"]')!;
        expect(replacementNode).not.toBe(firstNode);
        expect(replacementNode.textContent).toBe('10');
        projected.store.dispatch({ type: 'inc' });
        expect(app.store.state.dest).toEqual({ type: 'counter', state: { count: 10 } });

        app.store.dispatch({ type: 'openEditor', text: 'draft' });
        await tick();
        expect(target.querySelector('[data-destination-case="counter"]')).toBeNull();
        expect(target.querySelector('[data-destination-case="editor"]')?.textContent).toBe('draft');
    } finally {
        await unmount(component);
        target.remove();
    }
});
