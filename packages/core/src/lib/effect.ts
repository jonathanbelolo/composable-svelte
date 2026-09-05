/**
 * Effect system for Composable Svelte.
 *
 * Effects are declarative, type-safe descriptions of side effects.
 * They are VALUES, not executions - the Store executes them.
 *
 * Key principle: Effects describe WHAT to do, not HOW or WHEN.
 */

import type { Effect as EffectType, EffectGroups, EffectOfTag, EffectExecutor, Dispatch } from './types.js';

/**
 * Extensions other modules attach to the `Effect` namespace at import time.
 *
 * Empty here on purpose: `api/effect-api.ts` and `websocket/effect-websocket.ts`
 * fill it by declaration merging, and they are the modules that also perform the
 * runtime attachment. Keeping the seam here is what makes `Effect.api(…)` and
 * `Effect.websocket.connect(…)` typecheck at all.
 *
 * They did not, until now. Both modules augmented a name that has no declaration
 * to merge with — one wrote `interface Effect`, the other `interface
 * EffectNamespace` — while `Effect` below is a `const`. Merging an interface
 * contributes nothing to a const of the same name, so both augmentations were
 * inert and the runtime attachments were cast through `any`. The result was a
 * documented public namespace (`docs/backend/api-client.md`,
 * `docs/backend/websocket.md`) that a consumer could not use without a type
 * error, and nothing noticed because core's test typecheck resolved no files.
 */
export interface EffectExtensions {}

/**
 * Effect namespace containing all effect constructors.
 */
const EffectImpl = {
  /**
   * No side effects.
   *
   * @example
   * ```typescript
   * case 'reset':
   *   return [initialState, Effect.none()];
   * ```
   */
  none<A>(): EffectOfTag<A, 'None'> {
    return { _tag: 'None' };
  },

  /**
   * Execute async work and dispatch actions.
   *
   * Use this for API calls, timers, or any async operation that needs
   * to dispatch actions back to the store.
   *
   * @param execute - Function that performs async work and dispatches actions
   *
   * @example
   * ```typescript
   * Effect.run(async (dispatch) => {
   *   const data = await api.fetch();
   *   dispatch({ type: 'dataLoaded', data });
   * })
   * ```
   */
  run<A>(execute: EffectExecutor<A>): EffectOfTag<A, 'Run'> {
    return { _tag: 'Run', execute };
  },

  /**
   * Execute effect without waiting for completion.
   * No actions can be dispatched.
   *
   * Use this for fire-and-forget operations like analytics tracking
   * or logging where you don't care about the result.
   *
   * @param execute - Function that performs work without dispatching
   *
   * @example
   * ```typescript
   * Effect.fireAndForget(() => {
   *   analytics.track('button_clicked');
   * })
   * ```
   */
  fireAndForget<A>(execute: () => void | Promise<void>): EffectOfTag<A, 'FireAndForget'> {
    return { _tag: 'FireAndForget', execute };
  },

  /**
   * Execute multiple effects in parallel.
   *
   * All effects in the batch are started simultaneously.
   * Use this when you have multiple independent effects.
   *
   * Optimizations:
   * - Returns Effect.none() for empty batches
   * - Returns single effect directly if batch has only one effect
   * - Filters out Effect.none() from batch to reduce overhead
   *
   * @param effects - Effects to execute in parallel
   *
   * @example
   * ```typescript
   * Effect.batch(
   *   Effect.run(async (d) => { ... }),
   *   Effect.run(async (d) => { ... }),
   *   Effect.fireAndForget(() => { ... })
   * )
   * ```
   */
  batch<A>(...effects: EffectType<A>[]): EffectType<A> {
    // Filter out None effects
    const nonNoneEffects = effects.filter(e => e._tag !== 'None');

    // Optimization: empty batch
    if (nonNoneEffects.length === 0) {
      return Effect.none();
    }

    // Optimization: single effect
    if (nonNoneEffects.length === 1) {
      return nonNoneEffects[0]!;
    }

    return { _tag: 'Batch', effects: nonNoneEffects };
  },

  /**
   * Execute effect that can be cancelled by ID.
   * Cancels any in-flight effect with the same ID.
   *
   * Use this for operations that should be cancelled when superseded,
   * like API requests that may become stale.
   *
   * @param id - Unique identifier for cancellation
   * @param execute - Function that performs async work
   *
   * @example
   * ```typescript
   * Effect.cancellable('fetch-user', async (dispatch) => {
   *   const user = await api.fetchUser();
   *   dispatch({ type: 'userLoaded', user });
   * })
   * ```
   */
  cancellable<A>(id: string, execute: EffectExecutor<A>): EffectOfTag<A, 'Cancellable'> {
    return { _tag: 'Cancellable', id, execute };
  },

  /**
   * Execute effect after debounce delay.
   * Resets timer if called again with same ID.
   *
   * Use this for search-as-you-type, autosave, or other operations
   * where you want to wait until the user stops performing an action.
   *
   * @param id - Unique identifier for debouncing
   * @param ms - Delay in milliseconds (must be non-negative)
   * @param execute - Function that performs async work
   * @throws {TypeError} If ms is negative
   *
   * @example
   * ```typescript
   * Effect.debounced('search', 300, async (dispatch) => {
   *   const results = await api.search(query);
   *   dispatch({ type: 'resultsLoaded', results });
   * })
   * ```
   */
  debounced<A>(id: string, ms: number, execute: EffectExecutor<A>): EffectOfTag<A, 'Debounced'> {
    if (ms < 0) {
      throw new TypeError(`debounced: ms must be non-negative, got ${ms}`);
    }
    return { _tag: 'Debounced', id, ms, execute };
  },

  /**
   * Execute effect at most once per time period.
   *
   * Use this for scroll handlers, resize handlers, or other high-frequency
   * events where you want to limit execution rate.
   *
   * @param id - Unique identifier for throttling
   * @param ms - Minimum interval between executions in milliseconds (must be non-negative)
   * @param execute - Function that performs async work
   * @throws {TypeError} If ms is negative
   *
   * @example
   * ```typescript
   * Effect.throttled('scroll', 100, async (dispatch) => {
   *   dispatch({ type: 'scrolled', y: window.scrollY });
   * })
   * ```
   */
  throttled<A>(id: string, ms: number, execute: EffectExecutor<A>): EffectOfTag<A, 'Throttled'> {
    if (ms < 0) {
      throw new TypeError(`throttled: ms must be non-negative, got ${ms}`);
    }
    return { _tag: 'Throttled', id, ms, execute };
  },

  /**
   * Execute effect after a delay.
   * Useful for animations and timed transitions.
   *
   * @param ms - Delay in milliseconds (must be non-negative)
   * @param create - Function that creates the dispatch call after delay
   * @throws {TypeError} If ms is negative
   *
   * @example
   * ```typescript
   * Effect.afterDelay(300, (dispatch) => {
   *   dispatch({ type: 'animationCompleted' });
   * })
   * ```
   */
  afterDelay<A>(ms: number, create: EffectExecutor<A>): EffectOfTag<A, 'AfterDelay'> {
    if (ms < 0) {
      throw new TypeError(`afterDelay: ms must be non-negative, got ${ms}`);
    }
    return { _tag: 'AfterDelay', ms, execute: create };
  },

  /**
   * Create a long-running subscription with automatic cleanup.
   *
   * Use this for subscriptions that need to be maintained over time and properly
   * cleaned up when cancelled or when the store is destroyed. This is essential
   * for WebSocket connections, event listeners, and other persistent resources.
   *
   * The subscription is identified by ID and can be cancelled with Effect.cancel().
   * When cancelled, the cleanup function returned by setup() is called automatically.
   *
   * @param id - Unique identifier for subscription (used for cancellation)
   * @param setup - Function that sets up the subscription and returns cleanup
   *
   * @example
   * ```typescript
   * // WebSocket subscription
   * Effect.subscription('websocket-connection', (dispatch) => {
   *   const socket = new WebSocket('wss://example.com');
   *
   *   socket.onmessage = (event) => {
   *     dispatch({ type: 'messageReceived', data: event.data });
   *   };
   *
   *   socket.onerror = (error) => {
   *     dispatch({ type: 'connectionError', error });
   *   };
   *
   *   // Return cleanup function
   *   return () => {
   *     socket.close();
   *   };
   * })
   * ```
   *
   * @example
   * ```typescript
   * // Event listener subscription
   * Effect.subscription('window-resize', (dispatch) => {
   *   const handler = () => {
   *     dispatch({ type: 'windowResized', width: window.innerWidth });
   *   };
   *
   *   window.addEventListener('resize', handler);
   *
   *   return () => {
   *     window.removeEventListener('resize', handler);
   *   };
   * })
   * ```
   *
   * @example
   * ```typescript
   * // Cancelling a subscription
   * case 'disconnect':
   *   return [
   *     state,
   *     Effect.cancel('websocket-connection')
   *   ];
   * ```
   */
  subscription<A>(id: string, setup: (dispatch: Dispatch<A>) => (() => void | Promise<void>)): EffectOfTag<A, 'Subscription'> {
    return { _tag: 'Subscription', id, setup };
  },

  /**
   * Cancel all in-flight effects with the given ID.
   *
   * This cancels effects created with:
   * - Effect.cancellable()
   * - Effect.subscription()
   * - Effect.debounced()
   * - Effect.throttled()
   *
   * For subscriptions, this triggers the cleanup function returned by setup().
   *
   * @param id - The ID of the effect(s) to cancel
   *
   * @example
   * ```typescript
   * case 'disconnect':
   *   return [
   *     state,
   *     Effect.batch(
   *       Effect.cancel('websocket-connection'),
   *       Effect.cancel('websocket-messages')
   *     )
   *   ];
   * ```
   */
  cancel<A>(id: string): EffectOfTag<A, 'Cancellable'> {
    return { _tag: 'Cancellable', id, execute: () => {}, cancelOnly: true };
  },

  /**
   * Cancel every effect in a group: abort its signal, disarm its timer, run
   * its subscription's cleanup, drop its later dispatches. A group is what
   * the navigation operators set on a presentation's effects — the field
   * (`'destination'`), the case beneath it (`'destination/addItem'`), a
   * screen (`'stack/2'`) — and what `Effect.inGroup` adds by hand. The
   * operators emit this themselves on dismiss, a parent null, a case change,
   * a pop and a shrinking `setPath`; call it directly to cancel a group from
   * elsewhere.
   * @param group - The group to cancel
   * @example
   * ```typescript
   * case 'closeEverything':
   *   return [{ ...state, destination: null }, Effect.cancelGroup('destination')];
   * ```
   */
  cancelGroup<A>(group: string): EffectOfTag<A, 'CancelGroup'> {
    return { _tag: 'CancelGroup', group };
  },

  /**
   * The effect, a member of `group` as well: every executor-bearing member of
   * a batch joins; `None`, `FireAndForget`, `Effect.cancel` and
   * `Effect.cancelGroup` are returned as they are. A group already present is
   * not repeated.
   * @param effect - The effect
   * @param group - The group to join
   * @example
   * ```typescript
   * Effect.inGroup(Effect.run(load), 'search')  // later: Effect.cancelGroup('search')
   * ```
   */
  inGroup<A>(effect: EffectType<A>, group: string): EffectType<A> {
    return mapGroups(effect, (groups) => (groups?.includes(group) ? groups : [...(groups ?? []), group]));
  },

  /**
   * Every group of the effect — and the group a `CancelGroup` names —
   * prefixed with `prefix/`, so a child's groups sit beneath the parent's
   * name. Used by the lifts; an effect with no groups is returned as it is.
   * @param effect - The effect
   * @param prefix - The parent's name
   */
  prefixGroups<A>(effect: EffectType<A>, prefix: string): EffectType<A> {
    if (effect._tag === 'CancelGroup') return { _tag: 'CancelGroup', group: `${prefix}/${effect.group}` };
    return mapGroups(effect, (groups) => (groups ? groups.map((g) => `${prefix}/${g}`) : groups));
  },



  /**
   * Map effect actions to parent actions (for composition).
   *
   * This is the key function that enables reducer composition.
   * It transforms all actions dispatched by a child effect into
   * parent actions.
   *
   * @param effect - The child effect
   * @param f - Function to transform child action to parent action
   *
   * @example
   * ```typescript
   * const childEffect: Effect<ChildAction> = ...;
   * const parentEffect: Effect<ParentAction> = Effect.map(
   *   childEffect,
   *   (childAction) => ({ type: 'child', action: childAction })
   * );
   * ```
   */
  map<A, B>(effect: EffectType<A>, f: (a: A) => B): EffectType<B> {
    switch (effect._tag) {
      case 'None':
        return Effect.none();

      case 'Run':
        return withGroups(
          Effect.run<B>(async (dispatch, signal) => {
            await effect.execute((a) => dispatch(f(a)), signal);
          }),
          effect.groups
        );

      case 'FireAndForget':
        return Effect.fireAndForget(effect.execute);

      case 'Batch':
        return Effect.batch(...effect.effects.map(e => Effect.map(e, f)));

      case 'Cancellable':
        // `Effect.cancel(id)` is a Cancellable carrying no work. Mapping it
        // through `Effect.cancellable` would drop the marker, so a cancel
        // returned by a scoped child reducer came out the other side looking like
        // real work and registered a phantom AbortController under that id.
        if (effect.cancelOnly) return Effect.cancel(effect.id);
        return withGroups(
          Effect.cancellable<B>(effect.id, async (dispatch, signal) => {
            await effect.execute((a) => dispatch(f(a)), signal);
          }),
          effect.groups
        );

      // Every executor-bearing arm forwards the signal, carries the groups,
      // and returns the executor's promise. The AfterDelay arm used to call
      // the executor and drop what it returned, so a delayed effect that
      // rejected after a lift was an unhandled rejection the store's guard
      // never saw, and TestStore never tracked (R1-REVIEW 1.5).
      case 'Debounced':
        return withGroups(
          Effect.debounced<B>(effect.id, effect.ms, async (dispatch, signal) => {
            await effect.execute((a) => dispatch(f(a)), signal);
          }),
          effect.groups
        );

      case 'Throttled':
        return withGroups(
          Effect.throttled<B>(effect.id, effect.ms, async (dispatch, signal) => {
            await effect.execute((a) => dispatch(f(a)), signal);
          }),
          effect.groups
        );

      case 'AfterDelay':
        return withGroups(
          Effect.afterDelay<B>(effect.ms, async (dispatch, signal) => {
            await effect.execute((a) => dispatch(f(a)), signal);
          }),
          effect.groups
        );

      case 'Subscription':
        return withGroups(
          EffectImpl.subscription<B>(effect.id, (dispatch) => {
            const cleanup = effect.setup((a) => dispatch(f(a)));
            return cleanup;
          }),
          effect.groups
        );

      case 'CancelGroup':
        // Names a group, carries no action: the same value in either type.
        return effect;

      default:
        // Exhaustiveness check
        const _exhaustive: never = effect;
        throw new Error(`Unhandled effect type: ${(_exhaustive as any)._tag}`);
    }
  }
};

/** `effect` with `groups` set, or `effect` itself when there is nothing to set. */
function withGroups<E extends EffectType<any>>(effect: E, groups: EffectGroups): E {
  return groups && groups.length > 0 ? { ...effect, groups } : effect;
}

/**
 * Apply `f` to the groups of every executor-bearing member, recursively
 * through a batch; the members it cannot cancel are returned as they are, and
 * a member whose groups are unchanged keeps its reference. A cancel-only
 * `Cancellable` (`Effect.cancel`) joins nothing: it is a cancellation.
 */
function mapGroups<A>(effect: EffectType<A>, f: (groups: EffectGroups) => EffectGroups): EffectType<A> {
  switch (effect._tag) {
    case 'None':
    case 'FireAndForget':
    case 'CancelGroup':
      return effect;
    case 'Batch': {
      const members = effect.effects.map((member) => mapGroups(member, f));
      return members.every((member, i) => member === effect.effects[i]) ? effect : { _tag: 'Batch', effects: members };
    }
    case 'Cancellable':
      if (effect.cancelOnly) return effect;
      return regroup(effect, f);
    case 'Run':
    case 'Debounced':
    case 'Throttled':
    case 'AfterDelay':
    case 'Subscription':
      return regroup(effect, f);
    default: {
      const _exhaustive: never = effect;
      throw new Error(`Unhandled effect type: ${(_exhaustive as any)._tag}`);
    }
  }
}

function regroup<E extends { readonly groups?: EffectGroups }>(effect: E, f: (groups: EffectGroups) => EffectGroups): E {
  const next = f(effect.groups);
  if (next === effect.groups) return effect;
  return next && next.length > 0 ? { ...effect, groups: next } : effect;
}

/**
 * A child's effect lifted under `name`: its groups prefixed with `name/`, and
 * `name` itself joined, so `Effect.cancelGroup(name)` cancels the whole
 * subtree and `Effect.cancelGroup('name/case')` one branch of it. The lifts
 * — `ifLetPresentation`, `createDestination`, `scopeAction`,
 * `forEachElement`, `handleStackAction` — call this; it is not on the
 * namespace because a consumer composes it from `prefixGroups` and `inGroup`.
 */
export function nestGroups<A>(effect: EffectType<A>, name: string): EffectType<A> {
  return EffectImpl.inGroup(EffectImpl.prefixGroups(effect, name), name);
}

/**
 * The namespace as consumers see it: the constructors above, plus whatever the
 * extension modules have attached.
 *
 * The members in `EffectExtensions` are on this object once
 * `api/effect-api.ts` and `websocket/effect-websocket.ts` have executed. They
 * execute for any consumer of the root entry, of `./api` or of `./websocket`:
 * those barrels import them for that purpose, and package.json "sideEffects"
 * lists every module on the chain, so a bundler keeps the import even when
 * nothing uses the binding (measured by tests/repo/bundle-probe.test.ts; the
 * api chain was unlisted and `Effect.api` was `undefined` in every bundled
 * consumer, AUDIT-2026-09-03-FINDINGS P1). Reached by a path that imports
 * neither module, the type says function and the runtime says `undefined`.
 *
 * It cannot be an annotation instead, because those modules import `Effect`
 * from here and assigning an object that does not yet have their members
 * would not typecheck.
 */
export const Effect = EffectImpl as typeof EffectImpl & EffectExtensions;

/**
 * The effect type, under the name every consumer reaches for.
 *
 * A value and a type may share a name when they are declared in the **same
 * module** — and only then. `index.ts` carried a comment saying the type had to
 * be aliased "to avoid name conflict with Effect namespace", which is true of
 * the shape it tried: two `export … from` statements naming `Effect` from two
 * different modules is `TS2300: Duplicate identifier`. Declaring both here and
 * re-exporting once is not, and it carries both meanings through the barrel.
 *
 * That alias was not a cosmetic problem. `Effect<Action>` is what the
 * documentation has always written — roughly fifty times across ten live
 * documents including the repo README, the core README and the getting-started
 * tutorial — and every one of them was `TS2749: 'Effect' refers to a value, but
 * is being used as a type here`. The library's own first example did not
 * compile. Renaming the export is the one-line fix for all of them; bending
 * fifty documents to an awkward API would have been the other way round.
 *
 * `EffectType` remains exported and is not deprecated: it is what the reducers
 * in this repo and in `examples/` already import, and it is still the clearer
 * name inside a file that also uses the `Effect` constructors.
 */
export type Effect<Action> = EffectType<Action>;
