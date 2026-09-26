/**
 * DEF-021 lift/request substrate, first slice: the private request identity,
 * the branded lift in `effect.ts` and the managed requester, run by hand with a
 * raw dispatch standing in for a legacy store's. No store, runtime or queue is
 * involved, and nothing here shows a dismissal closing a presentation: no
 * production lift claims a request yet.
 */
import { describe, it, expect, vi } from 'vitest';
import { Effect, liftEffect } from '../../src/lib/effect';
import type { LiftPolicy } from '../../src/lib/effect';
import { managedDismissDependency } from '../../src/lib/navigation/dismiss-dependency';
import {
  claimDismissRequest,
  isDismissRequest,
  isLiftedDispatch,
  mintDismissRequest,
  wasDismissRequestClaimed
} from '../../src/lib/execution/dismiss-request';
import type { Dispatch, Effect as EffectType, EffectExecutor } from '../../src/lib/types';
import type { OwnerToken } from '../../src/lib/execution/identity';

type ChildAction = { readonly type: 'ping'; readonly n: number };
type SlotAction =
  | { readonly type: 'child'; readonly action: ChildAction }
  | { readonly type: 'slot'; readonly action: { readonly type: 'dismiss' } };
type RootAction = { readonly type: 'root'; readonly action: SlotAction };

const ping: ChildAction = { type: 'ping', n: 1 };
const dismissal: SlotAction = { type: 'slot', action: { type: 'dismiss' } };
const rootDismissal: RootAction = { type: 'root', action: dismissal };
const origin = Object.freeze({ id: 7 }) as unknown as OwnerToken;
const dismiss = managedDismissDependency();

/** What a legacy store does with whatever reaches its raw dispatch. */
function rawSinks() {
  const history: unknown[] = [];
  const reduced: unknown[] = [];
  const notified: unknown[] = [];
  const dispatch: Dispatch<unknown> = (action) => {
    history.push(action);
    reduced.push(action);
    notified.push(action);
  };
  return { history, reduced, notified, dispatch, seen: () => [...history, ...reduced, ...notified] };
}

function fixture() {
  const wrap = vi.fn((action: ChildAction): SlotAction => ({ type: 'child', action }));
  const outer = vi.fn((action: SlotAction): RootAction => ({ type: 'root', action }));
  const supply = vi.fn((): SlotAction => dismissal);
  const rootSupply = vi.fn((): RootAction => rootDismissal);
  const claim: LiftPolicy<SlotAction> = { kind: 'claim', dismissal: supply };
  const rootClaim: LiftPolicy<RootAction> = { kind: 'claim', dismissal: rootSupply };
  const pass: LiftPolicy<SlotAction> = { kind: 'pass' };
  return { wrap, outer, supply, rootSupply, claim, rootClaim, pass, sinks: rawSinks() };
}

function expectRefusal(error: unknown): void {
  expect(error).toBeInstanceOf(TypeError);
  expect((error as TypeError).message).toMatch(/no enclosing managed presentation/);
}

function expectRefused(errors: readonly unknown[]): void {
  expect(errors).toHaveLength(1);
  expectRefusal(errors[0]);
}

/** A setup is synchronous; what its executor returned is parked here for `run`. */
const subscriptionWork: Promise<void>[] = [];

interface Arm {
  readonly tag: 'Run' | 'Cancellable' | 'Debounced' | 'Throttled' | 'AfterDelay' | 'Subscription';
  readonly shape: Readonly<Record<string, unknown>>;
  readonly forwardsSignal: boolean;
  make<A>(execute: EffectExecutor<A>): EffectType<A>;
}

/** The six executor-bearing arms. */
const arms: readonly Arm[] = [
  { tag: 'Run', shape: {}, forwardsSignal: true, make: (execute) => Effect.run(execute) },
  { tag: 'Cancellable', shape: { id: 'c' }, forwardsSignal: true, make: (execute) => Effect.cancellable('c', execute) },
  { tag: 'Debounced', shape: { id: 'd', ms: 5 }, forwardsSignal: true, make: (execute) => Effect.debounced('d', 5, execute) },
  { tag: 'Throttled', shape: { id: 't', ms: 5 }, forwardsSignal: true, make: (execute) => Effect.throttled('t', 5, execute) },
  { tag: 'AfterDelay', shape: { ms: 5 }, forwardsSignal: true, make: (execute) => Effect.afterDelay(5, execute) },
  {
    tag: 'Subscription',
    shape: { id: 's' },
    forwardsSignal: false,
    make: <A>(execute: EffectExecutor<A>) =>
      Effect.subscription<A>('s', (dispatch) => {
        let work: Promise<void>;
        try {
          work = Promise.resolve(execute(dispatch, new AbortController().signal));
        } catch (error) {
          work = Promise.reject(error);
        }
        work.catch(() => {});
        subscriptionWork.push(work);
        return () => {};
      })
  }
];

/** Run an effect by hand as a store would, collecting what each executor threw or rejected with. */
async function run<A>(
  effect: EffectType<A>,
  dispatch: Dispatch<A>,
  signal: AbortSignal = new AbortController().signal
): Promise<unknown[]> {
  const errors: unknown[] = [];
  const attempt = async (body: () => void | Promise<void>): Promise<void> => {
    try {
      await body();
    } catch (error) {
      errors.push(error);
    }
  };
  const visit = async (member: EffectType<A>): Promise<void> => {
    switch (member._tag) {
      case 'Batch':
        for (const inner of member.effects) await visit(inner);
        break;
      case 'Cancellable':
      case 'Run':
      case 'Debounced':
      case 'Throttled':
      case 'AfterDelay': {
        if (member._tag === 'Cancellable' && member.cancelOnly) break;
        const { execute } = member;
        await attempt(() => execute(dispatch, signal));
        break;
      }
      case 'Subscription': {
        const { setup } = member;
        await attempt(async () => {
          const cleanup = setup(dispatch);
          for (const work of subscriptionWork.splice(0)) await attempt(() => work);
          await cleanup();
        });
        break;
      }
      default:
        break;
    }
  };
  await visit(effect);
  return errors;
}

/** The requester's own executor, to place in each arm. */
function requesterExecute(): EffectExecutor<ChildAction> {
  const effect = dismiss();
  if (effect._tag !== 'Run') throw new Error(`expected the requester to be a Run effect, got ${effect._tag}`);
  return effect.execute;
}

describe('dismiss request identity', () => {
  it('mints an opaque frozen request that no application value imitates', () => {
    const request = mintDismissRequest();
    expect(isDismissRequest(request)).toBe(true);
    expect(Object.isFrozen(request)).toBe(true);
    expect(Object.getPrototypeOf(request)).toBeNull();
    expect(Reflect.ownKeys(request)).toEqual([]);
    expect(mintDismissRequest()).not.toBe(request);

    const forged: unknown[] = [
      undefined,
      null,
      0,
      'request',
      () => {},
      {},
      Object.freeze(Object.create(null)),
      { ...request },
      JSON.parse(JSON.stringify(request))
    ];
    for (const value of forged) expect(isDismissRequest(value)).toBe(false);
  });

  it('claims a minted request exactly once, and nothing else', () => {
    const request = mintDismissRequest();
    expect(wasDismissRequestClaimed(request)).toBe(false);
    claimDismissRequest(request);
    expect(wasDismissRequestClaimed(request)).toBe(true);
    expect(() => claimDismissRequest(request)).toThrow(TypeError);
    expect(() => claimDismissRequest({})).toThrow(TypeError);
    expect(wasDismissRequestClaimed({})).toBe(false);
  });

  for (const arm of arms) {
    it(`${arm.tag}: brands the dispatch the lift creates, and nothing else`, async () => {
      const held: { dispatch?: Dispatch<number> } = {};
      const raw: Dispatch<string> = () => {};
      const source = arm.make<number>((dispatch) => {
        held.dispatch = dispatch;
      });
      expect(await run(Effect.map(source, String), raw)).toEqual([]);
      const inner = held.dispatch;
      expect(inner).toBeTypeOf('function');
      expect(isLiftedDispatch(inner)).toBe(true);
      expect(isLiftedDispatch(raw)).toBe(false);
      expect(isLiftedDispatch((n: number) => inner?.(n))).toBe(false);
    });
  }
});

describe('ordinary actions lift as Effect.map always mapped them', () => {
  const label = (n: number): string => `num:${n}`;
  const lifts: readonly (readonly [
    string,
    (effect: EffectType<number>, dismissal: () => string) => EffectType<string>
  ])[] = [
    ['Effect.map', (effect) => Effect.map(effect, label)],
    ['the reject policy', (effect) => liftEffect(effect, label, { kind: 'reject' })],
    ['the pass policy', (effect) => liftEffect(effect, label, { kind: 'pass' })],
    ['the claim policy', (effect, dismissal) => liftEffect(effect, label, { kind: 'claim', dismissal })]
  ];

  for (const arm of arms) {
    for (const [name, lift] of lifts) {
      it(`${arm.tag} through ${name}: maps the action, forwards the signal, keeps the metadata`, async () => {
        const supply = vi.fn(() => 'dismissed');
        let seen: AbortSignal | undefined;
        const source = arm.make<number>((dispatch, signal) => {
          seen = signal;
          dispatch(42);
        });
        const lifted = lift({ ...Effect.inGroup(source, 'g'), origin }, supply);

        expect(lifted).toMatchObject({ _tag: arm.tag, ...arm.shape, groups: ['g'] });
        expect(lifted.origin).toBe(origin);

        const received: string[] = [];
        const signal = new AbortController().signal;
        expect(await run(lifted, (action: string) => received.push(action), signal)).toEqual([]);
        expect(received).toEqual(['num:42']);
        if (arm.forwardsSignal) expect(seen).toBe(signal);
        expect(supply).not.toHaveBeenCalled();
      });
    }

    it(`${arm.tag}: a rejecting executor rejects through the lift`, async () => {
      const source = arm.make<number>(async () => {
        throw new Error('late');
      });
      const errors = await run(Effect.map(source, label), () => {});
      expect(errors).toHaveLength(1);
      expect((errors[0] as Error).message).toBe('late');
    });
  }

  it('keeps a subscription cleanup, the cancel-only marker and action-free effects as they are', () => {
    const claim: LiftPolicy<string> = { kind: 'claim', dismissal: () => 'dismissed' };
    const cleanup = (): void => {};
    const subscription = liftEffect(Effect.subscription<number>('s', () => cleanup), label, claim);
    if (subscription._tag !== 'Subscription') throw new Error(`expected a Subscription, got ${subscription._tag}`);
    expect(subscription.setup(() => {})).toBe(cleanup);

    const cancel = liftEffect({ ...Effect.cancel<number>('x'), origin }, label, claim);
    expect(cancel).toMatchObject({ _tag: 'Cancellable', id: 'x', cancelOnly: true });
    expect(cancel.origin).toBe(origin);

    const inert: EffectType<number>[] = [Effect.none(), Effect.fireAndForget(() => {}), Effect.cancelGroup('g')];
    for (const effect of inert) {
      expect(Effect.map(effect, label)).toBe(effect);
      expect(liftEffect(effect, label, claim)).toBe(effect);
    }
  });

  it('maps a look-alike of a request like any other action', async () => {
    const lookalike: object = Object.freeze(Object.create(null));
    const mapper = vi.fn((value: object) => ({ wrapped: value }));
    const supply = vi.fn(() => ({ wrapped: lookalike }));
    const sinks = rawSinks();
    const source = Effect.run<object>((dispatch) => dispatch(lookalike));
    const lifted = liftEffect(source, mapper, { kind: 'claim', dismissal: supply });

    expect(await run(lifted, sinks.dispatch)).toEqual([]);
    expect(mapper).toHaveBeenCalledTimes(1);
    expect(mapper.mock.calls[0]?.[0]).toBe(lookalike);
    expect(supply).not.toHaveBeenCalled();
    expect(sinks.history).toHaveLength(1);
  });
});

describe('the managed requester under each lift policy', () => {
  it('refuses a raw dispatch before a request exists', async () => {
    const { sinks } = fixture();
    expectRefused(await run(dismiss(), sinks.dispatch));
    expect(sinks.seen()).toEqual([]);
  });

  it('refuses a hand-written wrapper around a lifted dispatch', async () => {
    const { wrap, supply, claim, sinks } = fixture();
    const execute = requesterExecute();
    const rewrapped = Effect.run<ChildAction>((dispatch, signal) => execute((action) => dispatch(action), signal));
    expectRefused(await run(liftEffect(rewrapped, wrap, claim), sinks.dispatch));
    expect(sinks.seen()).toEqual([]);
    expect(supply).not.toHaveBeenCalled();
    expect(wrap).not.toHaveBeenCalled();
  });

  for (const arm of arms) {
    it(`${arm.tag}: a claiming lift emits only the supplied dismissal`, async () => {
      const { wrap, supply, claim, sinks } = fixture();
      expect(await run(liftEffect(arm.make(requesterExecute()), wrap, claim), sinks.dispatch)).toEqual([]);
      expect(sinks.history).toHaveLength(1);
      expect(sinks.seen().every((action) => action === dismissal)).toBe(true);
      expect(supply).toHaveBeenCalledTimes(1);
      expect(wrap).not.toHaveBeenCalled();
    });

    it(`${arm.tag}: public Effect.map rejects without calling the mapper`, async () => {
      const { wrap, sinks } = fixture();
      expectRefused(await run(Effect.map(arm.make(requesterExecute()), wrap), sinks.dispatch));
      expect(sinks.seen()).toEqual([]);
      expect(wrap).not.toHaveBeenCalled();
    });

    it(`${arm.tag}: pass refuses an outer dispatch that is not a lift`, async () => {
      const { wrap, pass, sinks } = fixture();
      expectRefused(await run(liftEffect(arm.make(requesterExecute()), wrap, pass), sinks.dispatch));
      expect(sinks.seen()).toEqual([]);
      expect(wrap).not.toHaveBeenCalled();
    });

    it(`${arm.tag}: unlifted, the requester refuses the raw dispatch`, async () => {
      const { sinks } = fixture();
      expectRefused(await run(arm.make(requesterExecute()), sinks.dispatch));
      expect(sinks.seen()).toEqual([]);
    });
  }

  it('claims once, and before the dismissal is delivered', async () => {
    const { wrap, supply, claim } = fixture();
    const held: { dispatch?: Dispatch<ChildAction> } = {};
    const request = mintDismissRequest();
    const delivered: { action: unknown; claimed: boolean }[] = [];
    const source = Effect.run<ChildAction>((dispatch) => {
      held.dispatch = dispatch;
    });
    const deliver: Dispatch<SlotAction> = (action) => {
      delivered.push({ action, claimed: wasDismissRequestClaimed(request) });
    };
    expect(await run(liftEffect(source, wrap, claim), deliver)).toEqual([]);

    const inner = held.dispatch as Dispatch<unknown>;
    inner(request);
    expect(delivered).toHaveLength(1);
    expect(delivered[0]?.action).toBe(dismissal);
    expect(delivered[0]?.claimed).toBe(true);
    expect(() => inner(request)).toThrow(TypeError);
    expect(delivered).toHaveLength(1);
    expect(supply).toHaveBeenCalledTimes(1);
    expect(wrap).not.toHaveBeenCalled();
  });

  it('treats an unknown policy as reject', async () => {
    const { wrap, sinks } = fixture();
    const unknownPolicy = { kind: 'adopt' } as unknown as LiftPolicy<SlotAction>;
    expectRefused(await run(liftEffect(dismiss(), wrap, unknownPolicy), sinks.dispatch));
    expect(sinks.seen()).toEqual([]);
    expect(wrap).not.toHaveBeenCalled();
  });

  it('pass forwards to an enclosing claim, which emits its dismissal unmapped', async () => {
    const { wrap, outer, rootSupply, rootClaim, pass, sinks } = fixture();
    const lifted = liftEffect(liftEffect(dismiss(), wrap, pass), outer, rootClaim);
    expect(await run(lifted, sinks.dispatch)).toEqual([]);
    expect(sinks.history).toHaveLength(1);
    expect(sinks.history[0]).toBe(rootDismissal);
    expect(rootSupply).toHaveBeenCalledTimes(1);
    expect(wrap).not.toHaveBeenCalled();
    expect(outer).not.toHaveBeenCalled();
  });

  it('an outer public map wraps a claimed dismissal like any other action', async () => {
    const { wrap, outer, claim, sinks } = fixture();
    expect(await run(Effect.map(liftEffect(dismiss(), wrap, claim), outer), sinks.dispatch)).toEqual([]);
    expect(sinks.history).toEqual([{ type: 'root', action: dismissal }]);
    expect(outer.mock.calls).toEqual([[dismissal]]);
    expect(wrap).not.toHaveBeenCalled();
  });

  describe('batches and nested lifts keep the policy', () => {
    const child = (): EffectType<ChildAction> =>
      Effect.batch<ChildAction>(
        Effect.run<ChildAction>((dispatch) => dispatch(ping)),
        Effect.batch<ChildAction>(dismiss(), Effect.cancellable<ChildAction>('later', (dispatch) => dispatch(ping))),
        Effect.cancel<ChildAction>('stale')
      );

    it('claim: every member maps, the requester is claimed in place', async () => {
      const { wrap, claim, sinks } = fixture();
      const lifted = liftEffect(child(), wrap, claim);
      expect(lifted).toMatchObject({ _tag: 'Batch', effects: [{ _tag: 'Run' }, { _tag: 'Batch' }, { cancelOnly: true }] });
      expect(await run(lifted, sinks.dispatch)).toEqual([]);
      expect(sinks.history).toEqual([{ type: 'child', action: ping }, dismissal, { type: 'child', action: ping }]);
    });

    it('public Effect.map: ordinary members still map, the requester is refused', async () => {
      const { wrap, sinks } = fixture();
      expectRefused(await run(Effect.map(child(), wrap), sinks.dispatch));
      expect(sinks.history).toEqual([{ type: 'child', action: ping }, { type: 'child', action: ping }]);
      expect(wrap.mock.calls).toEqual([[ping], [ping]]);
    });

    it('pass beneath claim: ordinary members map twice, the dismissal not at all', async () => {
      const { wrap, outer, rootClaim, pass, sinks } = fixture();
      const lifted = liftEffect(liftEffect(child(), wrap, pass), outer, rootClaim);
      const mapped: RootAction = { type: 'root', action: { type: 'child', action: ping } };
      expect(await run(lifted, sinks.dispatch)).toEqual([]);
      expect(sinks.history).toEqual([mapped, rootDismissal, mapped]);
    });

    it('pass beneath public Effect.map: refused by the outer lift, neither mapper called with a request', async () => {
      const { wrap, outer, pass, sinks } = fixture();
      expectRefused(await run(Effect.map(liftEffect(dismiss(), wrap, pass), outer), sinks.dispatch));
      expect(sinks.seen()).toEqual([]);
      expect(wrap).not.toHaveBeenCalled();
      expect(outer).not.toHaveBeenCalled();
    });
  });

  describe('no request and no wrapped stray reaches a raw sink', () => {
    const rows: readonly (readonly [string, (f: ReturnType<typeof fixture>) => EffectType<unknown>])[] = [
      ['the bare requester', () => dismiss()],
      ['public Effect.map', ({ wrap }) => Effect.map(dismiss(), wrap)],
      ['nested public maps', ({ wrap, outer }) => Effect.map(Effect.map(dismiss(), wrap), outer)],
      ['pass with no enclosing lift', ({ wrap, pass }) => liftEffect(dismiss(), wrap, pass)],
      ['nested pass with no enclosing claim', ({ wrap, outer, pass }) => liftEffect(liftEffect(dismiss(), wrap, pass), outer, { kind: 'pass' })],
      ['pass beneath public Effect.map', ({ wrap, outer, pass }) => Effect.map(liftEffect(dismiss(), wrap, pass), outer)],
      ['a batch of requesters beneath public Effect.map', ({ wrap }) => Effect.map(Effect.batch(dismiss(), dismiss()), wrap)]
    ];

    for (const [name, build] of rows) {
      it(name, async () => {
        const f = fixture();
        const errors = await run(build(f), f.sinks.dispatch);
        expect(errors.length).toBeGreaterThan(0);
        for (const error of errors) expectRefusal(error);
        expect(f.sinks.seen()).toEqual([]);
        for (const mapper of [f.wrap, f.outer, f.supply, f.rootSupply]) expect(mapper).not.toHaveBeenCalled();
      });
    }
  });
});

describe('the managed requester: cleanup and abort ordering', () => {
  it('dispatches in the synchronous part of the executor when cleanup returns no thenable', async () => {
    const { wrap, claim } = fixture();
    const order: string[] = [];
    const effect = managedDismissDependency(() => {
      order.push('cleanup');
    })();
    const running = run(liftEffect(effect, wrap, claim), () => order.push('dismissal'));
    order.push('executor returned');
    expect(await running).toEqual([]);
    expect(order).toEqual(['cleanup', 'dismissal', 'executor returned']);
  });

  it('awaits a thenable cleanup, handing it the signal, before it dispatches', async () => {
    const { wrap, claim } = fixture();
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const cleanup = vi.fn(async () => {
      order.push('cleanup started');
      await gate;
      order.push('cleanup finished');
    });
    const signal = new AbortController().signal;
    const running = run(liftEffect(managedDismissDependency(cleanup)(), wrap, claim), () => order.push('dismissal'), signal);
    order.push('executor returned');
    release();
    expect(await running).toEqual([]);
    expect(order).toEqual(['cleanup started', 'executor returned', 'cleanup finished', 'dismissal']);
    expect(cleanup).toHaveBeenCalledWith(signal);
  });

  it('drops the dismissal, with no refusal, once the signal is aborted during cleanup or before it', async () => {
    const { wrap, supply, claim, sinks } = fixture();
    const controller = new AbortController();
    const cleanup = vi.fn(async () => {
      await Promise.resolve();
      controller.abort();
    });
    const effect = managedDismissDependency(cleanup)();

    expect(await run(effect, sinks.dispatch, controller.signal)).toEqual([]);
    expect(await run(liftEffect(effect, wrap, claim), sinks.dispatch, controller.signal)).toEqual([]);
    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(supply).not.toHaveBeenCalled();
    expect(sinks.seen()).toEqual([]);
  });

  it('propagates a cleanup failure and dispatches nothing', async () => {
    const { wrap, supply, claim, sinks } = fixture();
    const rejecting = managedDismissDependency(() => Promise.reject(new Error('cleanup rejected')))();
    const throwing = managedDismissDependency(() => {
      throw new Error('cleanup threw');
    })();

    const errors = [
      ...(await run(liftEffect(rejecting, wrap, claim), sinks.dispatch)),
      ...(await run(liftEffect(throwing, wrap, claim), sinks.dispatch))
    ];
    expect(errors.map((error) => (error as Error).message)).toEqual(['cleanup rejected', 'cleanup threw']);
    expect(supply).not.toHaveBeenCalled();
    expect(sinks.seen()).toEqual([]);
  });

  it('mints a fresh request for every dismissal', async () => {
    const { wrap, supply, claim, sinks } = fixture();
    expect(await run(liftEffect(Effect.batch(dismiss(), dismiss()), wrap, claim), sinks.dispatch)).toEqual([]);
    expect(sinks.history).toEqual([dismissal, dismissal]);
    expect(supply).toHaveBeenCalledTimes(2);
  });
});
