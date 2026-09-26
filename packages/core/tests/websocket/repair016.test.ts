import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTreeHelpers } from '../../src/lib/utils/tree.js';
import { createHeartbeat } from '../../src/lib/websocket/heartbeat.js';
import { createMockWebSocket } from '../../src/lib/websocket/testing/mock-client.js';
import { createSpyWebSocket } from '../../src/lib/websocket/testing/spy-client.js';
import { createLiveWebSocket } from '../../src/lib/websocket/live-client.js';
import { WebSocketError, WS_ERROR_CODES } from '../../src/lib/websocket/types.js';
import { ScriptedWebSocket, installScriptedWebSocket } from '../helpers/scripted-websocket.js';

let originalWebSocket: typeof WebSocket;

beforeEach(() => {
  originalWebSocket = globalThis.WebSocket;
  ScriptedWebSocket.instances.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (globalThis.WebSocket !== originalWebSocket) {
    globalThis.WebSocket = originalWebSocket;
  }
  ScriptedWebSocket.instances.length = 0;
});

describe('candidate 016 verified regressions', () => {
  it('tree helpers skip sparse nested nodes and null entries without skipping valid falsy nodes', () => {
    type Node = { id: string; children?: Node[] };
    const helpers = createTreeHelpers<Node>({
      getId: (n) => n.id,
      getChildren: (n) => n.children ?? [],
      setChildren: (n, children) => ({ ...n, children })
    });

    const children: Node[] = [];
    children[2] = { id: 'target' };
    const roots: Node[] = [];
    roots[1] = { id: 'root', children };

    expect(helpers.findNode(roots, 'target')).toBe(children[2]);
    expect(helpers.findNode(roots, 'absent')).toBeNull();

    // Null entry tolerance
    const withNull = [null as unknown as Node, { id: 'valid' }];
    expect(helpers.findNode(withNull, 'valid')).toBe(withNull[1]);

    // Numeric falsy node validation
    const numbers = createTreeHelpers<number>({
      getId: String,
      getChildren: () => [],
      setChildren: (n) => n
    });
    expect(numbers.findNode([0], '0')).toBe(0);
    expect(numbers.updateNode([0], '0', (n) => n + 1)).toEqual([1]);
    expect(numbers.deleteNode([0], '0')).toEqual([]);
  });

  it('spy client records a message once for multiple subscribers and preserves unsubscribe window', async () => {
    vi.useFakeTimers();
    const mock = createMockWebSocket();
    const spy = createSpyWebSocket(mock);
    const opening = spy.connect('wss://test');
    await vi.advanceTimersByTimeAsync(10);
    await opening;

    const deliveredOrder: number[] = [];
    const one = vi.fn((_msg) => {
      // Assert spy.receivedMessages already holds the message when consumer receives it
      deliveredOrder.push(spy.receivedMessages.length);
    });
    const two = vi.fn();

    const stopOne = spy.subscribe(one);
    const stopTwo = spy.subscribe(two);

    mock.simulateMessage('a');
    expect(spy.receivedMessages).toHaveLength(1);
    expect(one).toHaveBeenCalledTimes(1);
    expect(two).toHaveBeenCalledTimes(1);
    expect(deliveredOrder).toEqual([1]);

    // Idempotent unsubscribe check
    stopOne();
    stopOne();
    mock.simulateMessage('b');
    expect(spy.receivedMessages).toHaveLength(2);

    stopTwo();
    mock.simulateMessage('unobserved');
    expect(spy.receivedMessages).toHaveLength(2);

    // Resubscribing re-establishes recording
    const stopThree = spy.subscribe(one);
    mock.simulateMessage('c');
    expect(spy.receivedMessages).toHaveLength(3);
    stopThree();
    await spy.disconnect();
  });

  it('spy client handles self-unsubscribing listener during dispatch cleanly', async () => {
    vi.useFakeTimers();
    const mock = createMockWebSocket();
    const spy = createSpyWebSocket(mock);
    const opening = spy.connect('wss://test');
    await vi.advanceTimersByTimeAsync(10);
    await opening;

    let unsub!: () => void;
    const listener = vi.fn(() => {
      unsub();
    });
    unsub = spy.subscribe(listener);
    expect(() => mock.simulateMessage('hello')).not.toThrow();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(spy.receivedMessages).toHaveLength(1);
    await spy.disconnect();
  });

  it('spy client forwards reconnect causes and omits cause key when not supplied', async () => {
    vi.useFakeTimers();
    const mock = createMockWebSocket();
    const spy = createSpyWebSocket(mock);
    const opening = spy.connect('wss://test');
    await vi.advanceTimersByTimeAsync(10);
    await opening;

    const cause = new WebSocketError('timeout', WS_ERROR_CODES.HEARTBEAT_TIMEOUT, true);
    spy.reconnect('retry', cause);
    expect(mock.state.lastError).toBe(cause);
    expect(mock.stats.errors).toBe(1);
    expect(spy.reconnections[0]?.cause).toBe(cause);

    // Reconnect without cause omits the 'cause' property entirely
    spy.reconnect('plain');
    expect('cause' in spy.reconnections[1]!).toBe(false);

    await vi.advanceTimersByTimeAsync(10);
    await spy.disconnect();
  });

  it('mock connectionTimeout enforces ceiling semantics', async () => {
    vi.useFakeTimers();

    // Ceiling >= latency: connects at 10ms, still connecting at 9ms
    const mockHigh = createMockWebSocket({ connectionTimeout: 5000 });
    const connectHigh = mockHigh.connect('wss://test');
    await vi.advanceTimersByTimeAsync(9);
    expect(mockHigh.state.status).toBe('connecting');
    await vi.advanceTimersByTimeAsync(1);
    expect(mockHigh.state.status).toBe('connected');
    await connectHigh;
    await mockHigh.disconnect();

    // Ceiling < latency: times out at ceiling threshold
    const mockLow = createMockWebSocket({ connectionTimeout: 5 });
    let rejectedError: any = null;
    const connectLow = mockLow.connect('wss://test').catch((err) => {
      rejectedError = err;
    });
    await vi.advanceTimersByTimeAsync(5);
    await connectLow;
    expect(rejectedError).toBeInstanceOf(WebSocketError);
    expect(rejectedError.code).toBe(WS_ERROR_CODES.CONNECTION_TIMEOUT);
    expect(mockLow.state.status).toBe('failed');
  });

  it('failed heartbeat ping enters recovery once and isolates throwing reconnect', async () => {
    vi.useFakeTimers();
    const mock = createMockWebSocket();
    vi.spyOn(mock, 'send').mockRejectedValue(new Error('send failed'));
    const reconnect = vi.spyOn(mock, 'reconnect').mockImplementation(() => {
      throw new Error('reconnect sync failure');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const heartbeat = createHeartbeat(mock, { interval: 10, timeout: 20 });
    heartbeat.start();
    await vi.advanceTimersByTimeAsync(10);

    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(heartbeat.isRunning).toBe(false);
    await vi.advanceTimersByTimeAsync(100);
    expect(reconnect).toHaveBeenCalledTimes(1);
    heartbeat.stop();
  });

  for (const restart of [false, true]) {
    it(`late failed ping cannot resurrect or stop a newer run (restart=${restart})`, async () => {
      vi.useFakeTimers();
      let reject!: (error: Error) => void;
      const pending = new Promise<void>((_, no) => {
        reject = no;
      });
      const mock = createMockWebSocket();
      vi.spyOn(mock, 'send').mockReturnValue(pending);
      const reconnect = vi.spyOn(mock, 'reconnect').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const heartbeat = createHeartbeat(mock, { interval: 10, timeout: 20 });
      heartbeat.start();
      await vi.advanceTimersByTimeAsync(10);
      heartbeat.stop();
      if (restart) heartbeat.start();

      reject(new Error('old failure'));
      await pending.catch(() => {});

      expect(reconnect).not.toHaveBeenCalled();
      expect(heartbeat.isRunning).toBe(restart);
      heartbeat.stop();
      expect(vi.getTimerCount()).toBe(0);
    });
  }

  it('closing old live socket cannot corrupt a replacement', async () => {
    vi.useFakeTimers();
    installScriptedWebSocket();
    const client = createLiveWebSocket();
    const first = client.connect('wss://old');
    expect(ScriptedWebSocket.instances).toHaveLength(1);
    const old = ScriptedWebSocket.instances[0]!;
    old.open();
    await first;
    old.close();
    const second = client.connect('wss://new');
    old.closed();
    expect(client.state.status).toBe('connecting');
    expect(ScriptedWebSocket.instances).toHaveLength(2);
    ScriptedWebSocket.instances[1]!.open();
    await second;
    expect(client.state.url).toBe('wss://new');
    await client.disconnect();
  });

  it('replacement settles a never-opened closing handshake and cancels its timer', async () => {
    vi.useFakeTimers();
    installScriptedWebSocket();
    const client = createLiveWebSocket({ connectionTimeout: 100 });
    const first = client.connect('wss://old');
    let failed = false;
    const observed = first.catch(() => {
      failed = true;
    });
    expect(ScriptedWebSocket.instances).toHaveLength(1);
    const old = ScriptedWebSocket.instances[0]!;
    old.close();
    const second = client.connect('wss://new');
    expect(ScriptedWebSocket.instances).toHaveLength(2);
    ScriptedWebSocket.instances[1]!.open();
    await second;
    await Promise.resolve();
    expect(failed).toBe(true);
    await observed;
    await vi.advanceTimersByTimeAsync(100);
    expect(client.state.status).toBe('connected');
    await client.disconnect();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('mock handshake retirement', () => {
 it.each(['disconnect','reset','simulateDisconnect'] as const)('does not revive after %s', async (mode) => {
  vi.useFakeTimers();const client=createMockWebSocket();const pending=client.connect('wss://old');const rejected=expect(pending).rejects.toMatchObject({code:WS_ERROR_CODES.CONNECTION_FAILED});
  if(mode==='disconnect') await client.disconnect();else if(mode==='reset')client.reset();else client.simulateDisconnect(1000,'done');
  await vi.runAllTimersAsync();await rejected;expect(client.state.status).toBe('disconnected');expect(vi.getTimerCount()).toBe(0);
 });
 it('overlapping connect rejects the newcomer and preserves the first deadline', async () => {
  vi.useFakeTimers();
  const client = createMockWebSocket();
  const first = client.connect('wss://first');
  await vi.advanceTimersByTimeAsync(5);
  await expect(client.connect('wss://second')).rejects.toMatchObject({code: WS_ERROR_CODES.CONNECTION_FAILED});
  await vi.advanceTimersByTimeAsync(5);
  await first;
  expect(client.state.url).toBe('wss://first');
  expect(client.state.status).toBe('connected');
 });
 it('reconnect restart cannot finish on an obsolete timer',async()=>{
  vi.useFakeTimers();const client=createMockWebSocket();const opening=client.connect('wss://server');await vi.advanceTimersByTimeAsync(10);await opening;
  client.reconnect();await vi.advanceTimersByTimeAsync(5);client.reconnect();await vi.advanceTimersByTimeAsync(5);expect(client.state.status).toBe('reconnecting');await vi.advanceTimersByTimeAsync(5);expect(client.state.status).toBe('connected');expect(client.stats.reconnects).toBe(1);
 });
});
