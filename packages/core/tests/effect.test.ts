import { describe, it, expect, vi } from 'vitest';
import { Effect, nestGroups } from '../src/lib/effect';
import { createStore } from '../src/lib/store.svelte';
import type { Effect as EffectType, EffectOfTag } from '../src/lib/types';

/**
 * Narrow an effect to one member of the union, or fail loudly.
 *
 * The constructors now return the member they build, so most of this file needs
 * nothing — but `Effect.batch()` collapses an empty batch to `None` and
 * `Effect.map()` returns whatever it was handed, so those genuinely produce a
 * union. Asserting `_tag` with `expect` does not narrow anything for the
 * compiler; this does, and it throws on the same condition `expect` would have
 * failed on, so no assertion gets weaker.
 */
function narrow<A, Tag extends EffectType<A>['_tag']>(
	effect: EffectType<A>,
	tag: Tag
): EffectOfTag<A, Tag> {
	if (effect._tag !== tag) {
		throw new Error(`expected a ${tag} effect, got ${effect._tag}`);
	}
	return effect as EffectOfTag<A, Tag>;
}

describe('Effect', () => {
  describe('none()', () => {
    it('creates a None effect', () => {
      const effect = Effect.none<string>();
      expect(effect._tag).toBe('None');
    });
  });

  describe('run()', () => {
    it('creates a Run effect', () => {
      const execute = vi.fn();
      const effect = Effect.run(execute);
      expect(effect._tag).toBe('Run');
      expect(effect.execute).toBe(execute);
    });
  });

  describe('fireAndForget()', () => {
    it('creates a FireAndForget effect', () => {
      const execute = vi.fn();
      const effect = Effect.fireAndForget(execute);
      expect(effect._tag).toBe('FireAndForget');
      expect(effect.execute).toBe(execute);
    });
  });

  describe('batch()', () => {
    it('creates a Batch effect with multiple effects', () => {
      const effect1 = Effect.run(async () => {});
      const effect2 = Effect.run(async () => {});
      const batchEffect = narrow(Effect.batch(effect1, effect2), 'Batch');

      expect(batchEffect._tag).toBe('Batch');
      expect(batchEffect.effects).toHaveLength(2);
      expect(batchEffect.effects[0]).toBe(effect1);
      expect(batchEffect.effects[1]).toBe(effect2);
    });

    it('optimizes empty batch to None', () => {
      const batchEffect = narrow(Effect.batch(), 'None');
      expect(batchEffect._tag).toBe('None');
    });

    it('optimizes single effect batch to the effect itself', () => {
      const effect = Effect.run(async () => {});
      const batchEffect = Effect.batch(effect);
      expect(batchEffect).toBe(effect);
    });

    it('filters out None effects from batch', () => {
      const effect1 = Effect.none();
      const effect2 = Effect.run(async () => {});
      const batchEffect = Effect.batch(effect1, effect2);
      // With None filtered out, only one effect remains, so returns that effect directly
      expect(batchEffect).toBe(effect2);
    });
  });

  describe('cancellable()', () => {
    it('creates a Cancellable effect with ID', () => {
      const execute = vi.fn();
      const effect = Effect.cancellable('test-id', execute);

      expect(effect._tag).toBe('Cancellable');
      expect(effect.id).toBe('test-id');
      expect(effect.execute).toBe(execute);
    });
  });

  describe('cancel() versus a cancellable whose body happens to contain {}', () => {
    // The store used to tell these apart by stringifying the executor and looking
    // for `{}` — so a real effect whose body contained an empty object literal was
    // silently classified as a bare cancel and never run. Nothing in the repo
    // tripped it, which is exactly why it needed a test rather than a reader.
    //
    // It was fragile in a second way too: the check had to accept both `{}` and
    // `{ }` because the build reformats the no-op it is looking for.
    it('runs a cancellable whose body contains an empty object literal', async () => {
      const store = createStore<{ n: number }, { type: 'inc' } | { type: 'go' }>({
        initialState: { n: 0 },
        reducer: (state, action) => {
          if (action.type === 'go') {
            return [
              state,
              Effect.cancellable('work', async (dispatch) => {
                const payload = {};
                void payload;
                dispatch({ type: 'inc' });
              })
            ];
          }
          return [{ n: state.n + 1 }, Effect.none()];
        }
      });

      store.dispatch({ type: 'go' });
      await new Promise((r) => setTimeout(r, 20));

      expect(store.state.n, 'the effect was swallowed as if it were Effect.cancel()').toBe(1);
      store.destroy?.();
    });

    it('still treats Effect.cancel() as a bare cancellation', async () => {
      let started = 0;
      const store = createStore<{ n: number }, { type: 'go' } | { type: 'stop' } | { type: 'inc' }>({
        initialState: { n: 0 },
        reducer: (state, action) => {
          if (action.type === 'go') {
            return [
              state,
              Effect.cancellable('work', async (dispatch) => {
                started += 1;
                await new Promise((r) => setTimeout(r, 50));
                dispatch({ type: 'inc' });
              })
            ];
          }
          if (action.type === 'stop') return [state, Effect.cancel('work')];
          return [{ n: state.n + 1 }, Effect.none()];
        }
      });

      store.dispatch({ type: 'go' });
      store.dispatch({ type: 'stop' });
      await new Promise((r) => setTimeout(r, 80));

      expect(started, 'the control failed — the work never started').toBe(1);
      expect(store.state.n, 'Effect.cancel did not cancel').toBe(0);
      store.destroy?.();
    });
  });

  describe('the cancelOnly marker', () => {
    // A review found that the two tests above did not pin this at all: deleting
    // the `cancelOnly` check from the store left both green, because the second
    // passed via the *dispatch gate* rather than the marker. These assert the
    // marker directly, in the one place it can be lost.
    it('is set by cancel() and not by cancellable()', () => {
      expect(Effect.cancel('x')).toMatchObject({ _tag: 'Cancellable', cancelOnly: true });
      expect(Effect.cancellable('x', async () => {}).cancelOnly).toBeUndefined();
    });

    it('survives Effect.map', () => {
      // `Effect.map` rebuilt a Cancellable through `Effect.cancellable`, which
      // does not set the marker — so a cancel returned by a scoped child reducer
      // came out looking like real work and registered a phantom AbortController
      // under that id.
      const mapped = Effect.map(Effect.cancel<{ type: 'a' }>('x'), (a) => a);
      expect(mapped).toMatchObject({ _tag: 'Cancellable', id: 'x', cancelOnly: true });
    });
  });

  describe('debounced()', () => {
    it('creates a Debounced effect with ID and delay', () => {
      const execute = vi.fn();
      const effect = Effect.debounced('test-id', 300, execute);

      expect(effect._tag).toBe('Debounced');
      expect(effect.id).toBe('test-id');
      expect(effect.ms).toBe(300);
      expect(effect.execute).toBe(execute);
    });
  });

  describe('throttled()', () => {
    it('creates a Throttled effect with ID and interval', () => {
      const execute = vi.fn();
      const effect = Effect.throttled('test-id', 100, execute);

      expect(effect._tag).toBe('Throttled');
      expect(effect.id).toBe('test-id');
      expect(effect.ms).toBe(100);
      expect(effect.execute).toBe(execute);
    });
  });

  describe('afterDelay()', () => {
    it('creates an AfterDelay effect with delay', () => {
      const execute = vi.fn();
      const effect = Effect.afterDelay(500, execute);

      expect(effect._tag).toBe('AfterDelay');
      expect(effect.ms).toBe(500);
      expect(effect.execute).toBe(execute);
    });
  });

  describe('map()', () => {
    it('maps None effect', () => {
      const effect = Effect.none<number>();
      const mapped = narrow(Effect.map(effect, (n) => String(n)), 'None');

      expect(mapped._tag).toBe('None');
    });

    it('maps Run effect actions', async () => {
      const actions: string[] = [];
      const effect = Effect.run<number>((dispatch) => {
        dispatch(42);
      });
      const mapped = narrow(Effect.map(effect, (n) => `num:${n}`), 'Run');

      expect(mapped._tag).toBe('Run');

      // Execute and verify transformation
      await mapped.execute((s) => actions.push(s));
      expect(actions).toEqual(['num:42']);
    });

    it('maps FireAndForget effect without transformation', () => {
      const execute = vi.fn();
      const effect = Effect.fireAndForget(execute);
      const mapped = narrow(Effect.map(effect, (n: number) => String(n)), 'FireAndForget');

      expect(mapped._tag).toBe('FireAndForget');
      expect(mapped.execute).toBe(execute);
    });

    it('maps Batch effect recursively', () => {
      const effect1 = Effect.run<number>((d) => d(1));
      const effect2 = Effect.run<number>((d) => d(2));
      const batch = Effect.batch(effect1, effect2);
      const mapped = narrow(Effect.map(batch, (n) => String(n)), 'Batch');

      expect(mapped._tag).toBe('Batch');
      expect(mapped.effects).toHaveLength(2);
      expect(mapped.effects[0]!._tag).toBe('Run');
      expect(mapped.effects[1]!._tag).toBe('Run');
    });

    it('maps Cancellable effect preserving ID', async () => {
      const actions: string[] = [];
      const effect = Effect.cancellable<number>('my-id', (d) => d(42));
      const mapped = narrow(Effect.map(effect, (n) => `num:${n}`), 'Cancellable');

      expect(mapped._tag).toBe('Cancellable');
      expect(mapped.id).toBe('my-id');

      await mapped.execute((s) => actions.push(s));
      expect(actions).toEqual(['num:42']);
    });

    it('maps Debounced effect preserving ID and delay, and forwards the signal', async () => {
      const actions: string[] = [];
      let seen: AbortSignal | undefined;
      const effect = Effect.debounced<number>('my-id', 300, (d, signal) => {
        seen = signal;
        d(42);
      });
      const mapped = narrow(Effect.map(effect, (n) => `num:${n}`), 'Debounced');

      expect(mapped._tag).toBe('Debounced');
      expect(mapped.id).toBe('my-id');
      expect(mapped.ms).toBe(300);

      const signal = new AbortController().signal;
      await mapped.execute((s) => actions.push(s), signal);
      expect(actions).toEqual(['num:42']);
      expect(seen).toBe(signal);
    });

    it('maps Throttled effect preserving ID and interval, and forwards the signal', async () => {
      const actions: string[] = [];
      let seen: AbortSignal | undefined;
      const effect = Effect.throttled<number>('my-id', 100, (d, signal) => {
        seen = signal;
        d(42);
      });
      const mapped = narrow(Effect.map(effect, (n) => `num:${n}`), 'Throttled');

      expect(mapped._tag).toBe('Throttled');
      expect(mapped.id).toBe('my-id');
      expect(mapped.ms).toBe(100);

      const signal = new AbortController().signal;
      await mapped.execute((s) => actions.push(s), signal);
      expect(actions).toEqual(['num:42']);
      expect(seen).toBe(signal);
    });

    it("maps AfterDelay effect preserving delay, forwards the signal, and returns the executor's promise", async () => {
      const actions: string[] = [];
      let seen: AbortSignal | undefined;
      const effect = Effect.afterDelay<number>(500, (d, signal) => {
        seen = signal;
        d(42);
      });
      const mapped = narrow(Effect.map(effect, (n) => `num:${n}`), 'AfterDelay');

      expect(mapped._tag).toBe('AfterDelay');
      expect(mapped.ms).toBe(500);

      const signal = new AbortController().signal;
      const result = mapped.execute((s) => actions.push(s), signal);
      expect(result).toBeInstanceOf(Promise);
      await result;
      expect(actions).toEqual(['num:42']);
      expect(seen).toBe(signal);
    });

    it('a rejecting AfterDelay executor rejects through map, rather than being unhandled', async () => {
      // The AfterDelay arm called the executor and dropped its promise, so a
      // delayed effect that rejected after a lift was an unhandled rejection
      // the store's guard never saw (R1-REVIEW 1.5).
      const effect = Effect.afterDelay<number>(5, async () => {
        throw new Error('late');
      });
      const mapped = narrow(Effect.map(effect, (n) => `num:${n}`), 'AfterDelay');

      await expect(mapped.execute(() => {})).rejects.toThrow('late');
    });
  });
});

describe('cancellation groups (C6)', () => {
  const groupsOf = (effect: unknown) => (effect as { groups?: readonly string[] }).groups;

  it('cancelGroup names a group and carries no action', () => {
    expect(Effect.cancelGroup('g')).toEqual({ _tag: 'CancelGroup', group: 'g' });
  });

  it('inGroup adds a group to every executor-bearing member, once, and leaves the rest as they are', () => {
    const run = Effect.run<number>(() => {});
    const ff = Effect.fireAndForget<number>(() => {});
    const cancel = Effect.cancel<number>('id');
    const cg = Effect.cancelGroup<number>('x');
    const batch = Effect.batch<number>(
      run,
      ff,
      cancel,
      cg,
      Effect.cancellable('c', () => {}),
      Effect.debounced('d', 1, () => {}),
      Effect.throttled('t', 1, () => {}),
      Effect.afterDelay(1, () => {}),
      Effect.subscription('s', () => () => {})
    );
    const grouped = narrow(Effect.inGroup(batch, 'g'), 'Batch');

    expect(grouped.effects.map(groupsOf)).toEqual([['g'], undefined, undefined, undefined, ['g'], ['g'], ['g'], ['g'], ['g']]);
    expect(grouped.effects[1]).toBe(ff);
    expect(grouped.effects[2]).toBe(cancel);
    expect(grouped.effects[3]).toBe(cg);
    // Already a member: the same reference, all the way up.
    expect(Effect.inGroup(grouped, 'g')).toBe(grouped);
    expect(Effect.inGroup(Effect.none<number>(), 'g')).toEqual(Effect.none());
  });

  it('prefixGroups prefixes every group and a CancelGroup, and returns an ungrouped effect as it is', () => {
    const run = Effect.run<number>(() => {});
    expect(Effect.prefixGroups(run, 'p')).toBe(run);
    expect(groupsOf(Effect.prefixGroups(Effect.inGroup(run, 'g'), 'p'))).toEqual(['p/g']);
    expect(Effect.prefixGroups(Effect.cancelGroup<number>('g'), 'p')).toEqual({ _tag: 'CancelGroup', group: 'p/g' });
  });

  it("nestGroups prefixes the child's groups and joins the name, so the subtree and one branch are both cancellable", () => {
    const inner = Effect.inGroup(Effect.run<number>(() => {}), 'addItem');
    expect(groupsOf(nestGroups(inner, 'destination'))).toEqual(['destination/addItem', 'destination']);
    expect(groupsOf(nestGroups(Effect.run<number>(() => {}), 'destination'))).toEqual(['destination']);
    expect(nestGroups(Effect.cancelGroup<number>('addItem'), 'destination')).toEqual({ _tag: 'CancelGroup', group: 'destination/addItem' });
  });

  it('map carries groups on every executor-bearing kind and passes a CancelGroup through', () => {
    const makers: (() => EffectType<number>)[] = [
      () => Effect.run(() => {}),
      () => Effect.cancellable('c', () => {}),
      () => Effect.debounced('d', 1, () => {}),
      () => Effect.throttled('t', 1, () => {}),
      () => Effect.afterDelay(1, () => {}),
      () => Effect.subscription('s', () => () => {})
    ];
    for (const make of makers) {
      expect(groupsOf(Effect.map(Effect.inGroup(make(), 'g'), String))).toEqual(['g']);
      expect(groupsOf(Effect.map(make(), String))).toBeUndefined();
    }
    const cg = Effect.cancelGroup<number>('g');
    expect(Effect.map(cg, String)).toBe(cg);
    expect(Effect.map(Effect.cancel<number>('id'), String)).toMatchObject({ _tag: 'Cancellable', id: 'id', cancelOnly: true });
  });
});
