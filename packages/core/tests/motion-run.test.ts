import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResourceScope } from '../src/lib/execution/resources.js';
import { MotionChannel, createMotionClock, type MotionRunContext } from '../src/lib/application/renderer/motion-run.js';
import { ProductionScheduler } from '../src/lib/execution/scheduler.js';
const pending = () => {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};
function fixture() {
  vi.useFakeTimers();
  const scope = new ResourceScope();
  const owner = scope.createRecord({kind:'subscription'});
  const diagnostic = vi.fn();
  const clock = createMotionClock(new ProductionScheduler());
  const channel = new MotionChannel(owner, clock, diagnostic);
  return {owner, scope, diagnostic, channel, clock};
}
afterEach(() => { vi.useRealTimers(); });
describe('finite renderer motion settlement', () => {
  it('stops resources before stable projection and preserves receipt authority after completion', async () => {
    const { channel, owner } = fixture();
    const events: string[] = [];
    const run = channel.start({ deadlineMs: 100, execute(ctx) {
      ctx.adopt(() => { events.push('stop'); });
    }, stable() { events.push('stable'); } });
    const receipt = await run.settled;
    expect(receipt.outcome.status).toBe('completed');
    expect(events).toEqual(['stop','stable']);
    expect(run.live).toBe(false);
    expect(receipt.current).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    owner.dispose();
    expect(receipt.current).toBe(false);
    expect(events).toEqual(['stop','stable']);
  });
  it('times out unresolved readiness without waiting for a driver and blocks late completion', async () => {
    const {channel} = fixture();
    const work = pending(), stable = vi.fn(), stop = vi.fn();
    let context!: MotionRunContext;
    const run = channel.start({deadlineMs:25,execute(ctx){context=ctx;ctx.adopt(stop);return work.promise;},stable});
    await vi.advanceTimersByTimeAsync(25);
    expect(run.live).toBe(false);
    expect((await run.settled).outcome.status).toBe('timedOut');
    expect(context.signal.aborted).toBe(true);
    expect(context.live).toBe(false);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(stable).toHaveBeenCalledTimes(1);
    work.resolve(); await Promise.resolve();
    expect((await run.settled).outcome.status).toBe('timedOut');
    expect(stable).toHaveBeenCalledTimes(1);
  });
  it('replacement transfers authority before old cleanup; old result cannot restore its styles', async () => {
    const {channel} = fixture();
    const old = pending(), fresh = pending();
    let rendered = '';
    const first = channel.start({deadlineMs:100, execute:()=>old.promise,stable:()=>{rendered='old';}});
    const second = channel.start({deadlineMs:100,execute:()=>fresh.promise,stable:()=>{rendered='new';}});
    const receipt = await first.settled;
    expect(receipt.outcome).toEqual({status:'superseded',reason:'replacement'});
    expect(receipt.current).toBe(false);
    old.resolve();await Promise.resolve();expect(rendered).toBe('');
    fresh.resolve();await second.settled;expect(rendered).toBe('new');
  });
  it('preference replacement distinguishes partially played supersession from skipped reduced plan', async () => {
    const {channel} = fixture();
    const old = channel.start({deadlineMs:100,execute:()=>new Promise(()=>{}),stable:vi.fn()});
    const execute = vi.fn(), stable = vi.fn();
    const next = channel.start({deadlineMs:100,skip:'reducedMotion',execute,stable},'preferenceChanged');
    expect((await old.settled).outcome).toEqual({status:'superseded',reason:'preferenceChanged'});
    expect((await next.settled).outcome).toEqual({status:'skipped',reason:'reducedMotion'});
    expect(execute).not.toHaveBeenCalled();expect(stable).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('settles disposal immediately without writes or retained timers when work never resolves', async () => {
    const {channel,owner} = fixture();const stable=vi.fn();
    const run=channel.start({deadlineMs:100,execute:()=>new Promise(()=>{}),stable});
    owner.dispose();
    expect((await run.settled).outcome.status).toBe('disposed');
    expect(stable).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
    expect(()=>channel.start({deadlineMs:1,execute(){},stable(){}})).toThrow('retired owner');
  });
  it('settles synchronous throw and asynchronous rejection as failed with fallback', async () => {
    for (const async of [false,true]) {
      const {channel}=fixture();const error=new Error('driver'),stable=vi.fn();
      const run=channel.start({deadlineMs:100,execute(){if(async)return Promise.reject(error);throw error;},stable});
      expect((await run.settled).outcome).toEqual({status:'failed',error});
      expect(stable).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);
    }
  });
  it('contains throwing resource cleanup and throwing fallback, with settled failure', async () => {
    const {channel,diagnostic}=fixture();const error=new Error('fallback');
    const run=channel.start({deadlineMs:100,execute(ctx){ctx.adopt(()=>{throw new Error('cleanup');});},stable(){throw error;}});
    expect((await run.settled).outcome).toEqual({status:'failed',error});
    expect(diagnostic).toHaveBeenCalledTimes(2);expect(vi.getTimerCount()).toBe(0);
  });
  it('immediately disposes late-acquired resources, observing late rejection', async () => {
    const {channel,owner,diagnostic}=fixture();let ctx!:MotionRunContext;const work=pending();
    const run=channel.start({deadlineMs:100,execute(c){ctx=c;return work.promise;},stable(){}});
    owner.dispose();await run.settled;const dispose=vi.fn();ctx.adopt(dispose);ctx.adopt(dispose);
    expect(dispose).toHaveBeenCalledTimes(1);
    work.reject(new Error('late failure'));await Promise.resolve();
    expect(diagnostic).toHaveBeenCalledWith(expect.objectContaining({message:'late failure'}));
  });
  it('preserves latest authority when predecessor cleanup starts a third run', async () => {
    const {channel}=fixture();const thirdWork=pending(),secondExecution=vi.fn(),writes:string[]=[];
    let third:ReturnType<MotionChannel['start']> | undefined;
    const first=channel.start({deadlineMs:100,execute(ctx){ctx.adopt(()=>{
      third=channel.start({deadlineMs:100,execute:()=>thirdWork.promise,stable:()=>{writes.push('third');}});
    });return new Promise(()=>{});},stable:()=>{writes.push('first');}});
    const second=channel.start({deadlineMs:100,execute:secondExecution,stable:()=>{writes.push('second');}});
    expect((await first.settled).outcome.status).toBe('superseded');
    expect((await second.settled).outcome.status).toBe('superseded');
    expect(secondExecution).not.toHaveBeenCalled();
    thirdWork.resolve();await third!.settled;expect(writes).toEqual(['third']);
  });
  it('revokes a completed outcome before delivery when a newer run starts', async () => {
    const {channel}=fixture();const first=channel.start({deadlineMs:100,execute(){},stable(){}});
    const receipt=await first.settled;expect(receipt.current).toBe(true);
    const second=channel.start({deadlineMs:100,skip:'disabled',execute(){},stable(){}});
    expect(receipt.current).toBe(false);expect((await second.settled).current).toBe(true);
  });
  it('rejects invalid deadlines without disturbing the current run', async () => {
    const {channel}=fixture();const work=pending();const run=channel.start({deadlineMs:100,execute:()=>work.promise,stable(){}});
    for(const deadlineMs of [-1,NaN,Infinity,2_147_483_648]) expect(()=>channel.start({deadlineMs,execute(){},stable(){}})).toThrow(RangeError);
    expect(run.live).toBe(true);work.resolve();expect((await run.settled).outcome.status).toBe('completed');
  });
  it('enrolls cleanup even if execution synchronously destroys its owner', async () => {
    const {channel,owner}=fixture();const stop=vi.fn(),stable=vi.fn();
    const run=channel.start({deadlineMs:100,execute(ctx){owner.dispose();ctx.adopt(stop);},stable});
    expect((await run.settled).outcome.status).toBe('disposed');
    expect(stop).toHaveBeenCalledTimes(1);expect(stable).not.toHaveBeenCalled();
  });
});

it('reports synchronous failure after owner disposal without changing disposed outcome', async () => {
  const {channel,owner,diagnostic}=fixture(); const error=new Error('late synchronous driver failure');
  const run=channel.start({deadlineMs:100,execute(){owner.dispose();throw error;},stable(){}});
  expect((await run.settled).outcome.status).toBe('disposed');
  expect(diagnostic).toHaveBeenCalledWith(error);
});

it('contains hostile late error accessors rather than creating unhandled rejections', async () => {
  const {channel,owner,diagnostic}=fixture();const work=pending();
  const error={get name(){throw new Error('hostile name');}};
  const run=channel.start({deadlineMs:100,execute:()=>work.promise,stable(){}});
  owner.dispose();await run.settled;work.reject(error);await Promise.resolve();await Promise.resolve();
  expect(diagnostic.mock.calls.length).toBe(1);
  expect(diagnostic.mock.calls[0]?.[0]).toBe(error);
});
it('rejects asynchronous fallback without waiting on it and observes its rejection', async () => {
  const {channel,diagnostic}=fixture();const error=new Error('async fallback');
  const run=channel.start({deadlineMs:100,execute(){},stable:()=>Promise.reject(error)});
  const result=await run.settled;
  expect(result.outcome.status).toBe('failed');
  if(result.outcome.status==='failed')expect(result.outcome.error).toEqual(new TypeError('Stable motion projection must be synchronous'));
  await Promise.resolve();expect(diagnostic).toHaveBeenCalledWith(error);
  expect(vi.getTimerCount()).toBe(0);
});

it('owner cleanup settlement waits for adopted nested cleanup resolution', async () => {
  const { channel, owner } = fixture();
  const work = pending();
  let executed = false;
  channel.start({
    deadlineMs: 100,
    execute(ctx) {
      ctx.adopt(() => {
        executed = true;
        return work.promise;
      });
    },
    stable() {}
  });
  let settled = false;
  void owner.cleanupSettlement.then(() => { settled = true; });
  owner.dispose();
  for (let i = 0; i < 10; i++) await Promise.resolve();
  expect(executed).toBe(true);
  expect(settled).toBe(false);
  work.resolve();
  await owner.cleanupSettlement;
  expect(settled).toBe(true);
});

it('late adopt after run settlement routes through injected observeCleanup exactly once', async () => {
  const scope = new ResourceScope();
  const owner = scope.createRecord({ kind: 'subscription' });
  const observed: string[] = [];
  const observeCleanup = vi.fn((cleanup: () => void) => {
    observed.push('observed');
    cleanup();
  });
  const channel = new MotionChannel(owner, createMotionClock(new ProductionScheduler()), undefined, observeCleanup);
  let ctx!: MotionRunContext;
  const run = channel.start({ deadlineMs: 100, execute(c) { ctx = c; }, stable() {} });
  await run.settled;
  expect(ctx.live).toBe(false);
  const lateDisposer = vi.fn(() => { observed.push('disposer'); });
  ctx.adopt(lateDisposer);
  ctx.adopt(lateDisposer);
  expect(observeCleanup).toHaveBeenCalledTimes(1);
  expect(lateDisposer).toHaveBeenCalledTimes(1);
  expect(observed).toEqual(['observed', 'disposer']);
});

it('rejecting cleanup routes through observeCleanup to report failure', async () => {
  const scope = new ResourceScope();
  const owner = scope.createRecord({ kind: 'subscription' });
  let reportedError: unknown;
  const observeCleanup = vi.fn((cleanup: () => void) => { try { cleanup(); } catch (error) { reportedError = error; } });
  const channel = new MotionChannel(owner, createMotionClock(new ProductionScheduler()), undefined, observeCleanup);
  const error = new Error('adopted failure');
  const run = channel.start({ deadlineMs: 100, execute(ctx) { ctx.adopt(() => { throw error; }); }, stable() {} });
  await run.settled;
  await channel.dispose();
  expect(observeCleanup).toHaveBeenCalled();
  expect(reportedError).toBe(error);
});
it('createMotionClock handles synchronous timer firing without leaking handle', () => {
  let cleared = 0;
  let clearedHandle: unknown;
  const syncScheduler = {
    now: () => 0,
    setTimer(_delay: number, callback: () => void) {
      callback();
      return { kind: 'timer', id: Symbol('sync') } as const;
    },
    clearTimer(handle: unknown) { cleared++; clearedHandle = handle; },
    requestFrame: () => ({ kind: 'frame', id: Symbol('frame') } as const),
    cancelFrame() {}
  };
  const clock = createMotionClock(syncScheduler);
  let fired = false;
  const cancel = clock.schedule(100, () => { fired = true; });
  expect(fired).toBe(true);
  expect(cleared).toBe(1);
  expect(clearedHandle).toBeDefined();
  cancel();
  expect(cleared).toBe(1);
});
it('rejects skip plus complete before disturbing incumbent, leaving it live and scheduled', async () => {
  const { channel } = fixture();
  const work = pending(), cleanup = vi.fn(), stable = vi.fn();
  const incumbent = channel.start({
    deadlineMs: 100,
    execute(ctx) { ctx.adopt(cleanup); return work.promise; },
    stable
  });
  expect(incumbent.live).toBe(true);

  expect(() => channel.start({
    deadlineMs: 100,
    skip: 'disabled',
    complete: true,
    execute() {},
    stable() {}
  })).toThrow(TypeError);

  expect(incumbent.live).toBe(true);
  expect(cleanup).not.toHaveBeenCalled();
  expect(stable).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(1);
  work.resolve();
  await incumbent.settled;
});

it('complete settles synchronously completed after supersession without new clock or execute', async () => {
  const { channel, clock } = fixture();
  const oldCleanup = vi.fn(), oldStable = vi.fn();
  let oldContext!: MotionRunContext;
  const incumbent = channel.start({
    deadlineMs: 200,
    execute(ctx) { oldContext = ctx; ctx.adopt(oldCleanup); return new Promise(() => {}); },
    stable: oldStable
  });
  expect(incumbent.live).toBe(true);
  expect(vi.getTimerCount()).toBe(1);

  const scheduleSpy = vi.spyOn(clock, 'schedule');
  const newExecute = vi.fn();
  const completeStable = vi.fn();

  const run = channel.start({
    deadlineMs: 100,
    complete: true,
    execute: newExecute,
    stable: completeStable
  });
  // These observations are deliberately before any microtask checkpoint.
  expect(run.live).toBe(false);
  expect(incumbent.live).toBe(false);
  expect(oldCleanup).toHaveBeenCalledTimes(1);
  expect(newExecute).not.toHaveBeenCalled();
  expect(scheduleSpy).not.toHaveBeenCalled();
  expect(completeStable).toHaveBeenCalledTimes(1);

  expect(incumbent.live).toBe(false);
  expect(oldContext.live).toBe(false);
  expect(oldCleanup).toHaveBeenCalledTimes(1);
  expect(oldStable).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);

  const completedReceipt = await run.settled;
  expect(completedReceipt.outcome).toEqual({ status: 'completed' });
  expect(completedReceipt.current).toBe(true);
  const incumbentReceipt = await incumbent.settled;
  expect(incumbentReceipt.outcome).toEqual({ status: 'superseded', reason: 'replacement' });
});

it('reads plan getters once in start and respects getter throw before supersession', () => {
  const { channel } = fixture();
  const incumbent = channel.start({
    deadlineMs: 100,
    execute: () => new Promise(() => {}),
    stable() {}
  });
  expect(incumbent.live).toBe(true);

  const reads = { deadlineMs: 0, execute: 0, stable: 0, skip: 0, complete: 0 };
  const hostile = {
    get deadlineMs() { reads.deadlineMs++; return 100; },
    get execute() { reads.execute++; return () => {}; },
    get stable() { reads.stable++; return () => {}; },
    get skip() { reads.skip++; return 'disabled' as const; },
    get complete(): never { reads.complete++; throw new Error('hostile getter'); }
  };

  expect(() => channel.start(hostile)).toThrow('hostile getter');
  expect(reads).toEqual({ deadlineMs: 1, execute: 1, stable: 1, skip: 1, complete: 1 });
  expect(incumbent.live).toBe(true);
});
