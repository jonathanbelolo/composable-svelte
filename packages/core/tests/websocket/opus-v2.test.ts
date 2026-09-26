import { createQueuedWebSocket } from '../../src/lib/websocket/message-queue.js';
import { afterEach, expect, it, vi } from 'vitest';
import { createLiveWebSocket } from '../../src/lib/websocket/live-client.js';
import { createMockWebSocket } from '../../src/lib/websocket/testing/mock-client.js';
import { createSpyWebSocket } from '../../src/lib/websocket/testing/spy-client.js';
import { createHeartbeat } from '../../src/lib/websocket/heartbeat.js';
import { createTreeHelpers } from '../../src/lib/utils/tree.js';
import { WebSocketError, WS_ERROR_CODES } from '../../src/lib/websocket/types.js';
import type { WebSocketClient } from '../../src/lib/websocket/types.js';
import { installScriptedWebSocket, ScriptedWebSocket } from '../helpers/scripted-websocket.js';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
const settings = { reconnect: { initialDelay: 10, maxDelay: 10, jitter: false, maxAttempts: 3 }, connectionTimeout: 100 };
async function opened() {
  vi.useFakeTimers(); installScriptedWebSocket();
  const client = createLiveWebSocket(settings);
  const promise = client.connect('wss://original');
  ScriptedWebSocket.instances[0]!.open(); await promise;
  return client;
}

it('F1 a disconnected listener owns exactly one requested reconnect ladder', async () => {
  const client = await opened(); const attempts: number[] = [];
  client.subscribeToEvents(event => {
    if (event.type === 'disconnected') client.reconnect('listener');
    if (event.type === 'reconnecting') attempts.push(event.attempt);
  });
  try {
    ScriptedWebSocket.instances[0]!.closed(1006);
    await vi.advanceTimersByTimeAsync(10);
    expect(attempts).toEqual([1]);
    expect(ScriptedWebSocket.instances).toHaveLength(2);
    ScriptedWebSocket.instances[1]!.open();
  } finally { await client.disconnect(); }
});

it('F2 a disconnected listener can replace the URL without an obsolete ladder or orphan socket', async () => {
  const client = await opened(); let fallback: Promise<void> | undefined;
  const messages: unknown[] = [];
  const stop = client.subscribeToEvents(event => { if (event.type === 'disconnected') fallback = client.connect('wss://fallback'); });
  client.subscribe(message => messages.push(message.data));
  try {
    ScriptedWebSocket.instances[0]!.closed(1006);
    expect(client.state.status).toBe('connecting');
    ScriptedWebSocket.instances[1]!.open(); await fallback;
    await vi.advanceTimersByTimeAsync(20);
    expect(ScriptedWebSocket.instances).toHaveLength(2);
    expect(client.state.url).toBe('wss://fallback');
    ScriptedWebSocket.instances[1]!.message(JSON.stringify('once'));
    expect(messages).toEqual(['once']);
  } finally { stop(); await client.disconnect(); }
  expect(ScriptedWebSocket.instances[1]!.closeCalls).toHaveLength(1);
});

for (const notification of ['disconnected', 'reconnecting', 'error'] as const) {
  it(`listener disconnect during ${notification} notification leaves no reconnect timer`, async () => {
    const client = await opened();
    client.subscribeToEvents(event => { if (event.type === notification) void client.disconnect(); });
    client.reconnect('requested', notification === 'error' ? new WebSocketError('cause', 'cause', true) : undefined);
    expect(client.state.status).toBe('disconnected');
    expect(client.state.url).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(ScriptedWebSocket.instances).toHaveLength(1);
  });
}

it('an error listener replacing a failed handshake preserves the new pending connection', async () => {
  vi.useFakeTimers(); installScriptedWebSocket();
  const client = createLiveWebSocket(settings); let fallback: Promise<void> | undefined;
  const stop = client.subscribeToEvents(event => { if (event.type === 'error') fallback = client.connect('wss://fallback'); });
  const failed = client.connect('wss://original').catch(error => error);
  ScriptedWebSocket.instances[0]!.error(); await failed;
  expect(client.state.status).toBe('connecting');
  const fallbackRejected = fallback!.catch(error => error);
  stop(); await client.disconnect();
  expect(await fallbackRejected).toBeInstanceOf(WebSocketError);
  expect(vi.getTimerCount()).toBe(0);
});

it('a connected listener replacing the socket cannot erase the replacement pending reject', async () => {
  vi.useFakeTimers(); installScriptedWebSocket();
  const client = createLiveWebSocket(settings); let replacement: Promise<void> | undefined;
  const stop = client.subscribeToEvents(event => {
    if (event.type === 'connected') { void client.disconnect(); replacement = client.connect('wss://new'); }
  });
  const first = client.connect('wss://old'); ScriptedWebSocket.instances[0]!.open(); await first;
  stop(); const rejected = replacement!.catch(error => error); await client.disconnect();
  expect(await rejected).toBeInstanceOf(WebSocketError);
  expect(vi.getTimerCount()).toBe(0);
});

it('F3 mock rejects overlapping connect and preserves the first handshake', async () => {
  vi.useFakeTimers(); const mock = createMockWebSocket();
  const first = mock.connect('wss://first').catch(error => error);
  const second = mock.connect('wss://second').catch(error => error);
  await vi.advanceTimersByTimeAsync(10);
  expect(await first).toBeUndefined();
  expect(await second).toBeInstanceOf(WebSocketError);
  expect(mock.state.url).toBe('wss://first');
});

it('F4 mock rejects script-invalid close codes without retiring the connection', async () => {
  vi.useFakeTimers(); const mock = createMockWebSocket();
  const pending = mock.connect('wss://test'); await vi.advanceTimersByTimeAsync(10); await pending;
  await expect(mock.disconnect(1001)).rejects.toBeInstanceOf(TypeError);
  expect(mock.state.status).toBe('connected');
  await mock.disconnect(3001); expect(mock.state.status).toBe('disconnected');
});

it('F5 spy records once when its last listener replaces itself during delivery', () => {
  const mock = createMockWebSocket();
  let upstream = 0;
  const wrapped: WebSocketClient = { ...mock, get state() { return mock.state; }, get stats() { return mock.stats; }, subscribe: listener => { upstream++; const stop = mock.subscribe(listener); return () => { upstream--; stop(); }; } };
  const spy = createSpyWebSocket(wrapped); const second = vi.fn();
  let stop = () => {}; let stopSecond = () => {};
  stop = spy.subscribe(() => { stop(); stopSecond = spy.subscribe(second); });
  mock.simulateMessage('first');
  expect(spy.receivedMessages.map(message => message.data)).toEqual(['first']);
  expect(second).not.toHaveBeenCalled();
  expect(upstream).toBe(1);
  mock.simulateMessage('second'); expect(second).toHaveBeenCalledTimes(1);
  stopSecond(); expect(upstream).toBe(0); mock.simulateMessage('unobserved');
  expect(spy.receivedMessages.map(message => message.data)).toEqual(['first', 'second']);
});

it('F6 recursive tree lookup retains a nested falsy node', () => {
  const tree = createTreeHelpers<number>({ getId: String, getChildren: node => node === 1 ? [0] : [], setChildren: node => node });
  expect(tree.findNode([1], '0')).toBe(0);
});

it('F9 mock successful connection clears previous errors and attempt count', async () => {
  vi.useFakeTimers(); const mock = createMockWebSocket();
  mock.simulateError(new WebSocketError('old', 'old', false));
  const pending = mock.connect('wss://test'); await vi.advanceTimersByTimeAsync(10); await pending;
  expect(mock.state.lastError).toBeNull(); expect(mock.state.reconnectAttempts).toBe(0);
});
it('F9 mock initial timeout has the same failed status as live', async () => {
  vi.useFakeTimers(); const mock = createMockWebSocket({ connectionTimeout: 1 });
  const pending = mock.connect('wss://test').catch(error => error); await vi.advanceTimersByTimeAsync(1); await pending;
  expect(mock.state.status).toBe('failed');
});

it('F11 synchronous send failure is observed and retires the heartbeat immediately', async () => {
  vi.useFakeTimers(); vi.spyOn(console, 'error').mockImplementation(() => {});
  const mock = createMockWebSocket(); const reconnect = vi.fn();
  const client: WebSocketClient = { ...mock, get state() { return mock.state; }, get stats() { return mock.stats; }, send: () => { throw new Error('sync failure'); }, reconnect };
  const heartbeat = createHeartbeat(client, { interval: 10, timeout: 5 }); heartbeat.start();
  try {
    await vi.advanceTimersByTimeAsync(10);
    expect(reconnect).toHaveBeenCalledTimes(1); expect(heartbeat.isRunning).toBe(false); expect(vi.getTimerCount()).toBe(0);
  } finally { heartbeat.stop(); }
});
it('F11 distinct non-serializable primitive pongs do not acknowledge each other', async () => {
  vi.useFakeTimers(); vi.spyOn(console, 'warn').mockImplementation(() => {});
  const mock = createMockWebSocket(); const reconnect = vi.fn(); const pong = () => {};
  const client: WebSocketClient = { ...mock, get state() { return mock.state; }, get stats() { return mock.stats; }, send: async () => {}, reconnect };
  const heartbeat = createHeartbeat(client, { interval: 10, timeout: 5, pongMessage: pong }); heartbeat.start();
  try {
    await vi.advanceTimersByTimeAsync(10); mock.simulateMessage(() => {}); await vi.advanceTimersByTimeAsync(5);
    expect(reconnect).toHaveBeenCalledTimes(1);
  } finally { heartbeat.stop(); }
});

for (const kind of ['mock', 'live'] as const) {
 it(`V3-1 ${kind} queued messages survive invalid disconnect and flush on connect`, async () => {
  vi.useFakeTimers(); if (kind === 'live') installScriptedWebSocket();
  const base = kind === 'mock' ? createMockWebSocket() : createLiveWebSocket(settings);
  const queued = createQueuedWebSocket(base);
  await queued.send({ n: 1 });
  await expect(queued.disconnect(1001)).rejects.toBeInstanceOf(TypeError);
  expect(queued.stats.messagesQueued).toBe(1);
  const pending = queued.connect('wss://next');
  if (kind === 'mock') await vi.advanceTimersByTimeAsync(10); else ScriptedWebSocket.instances[0]!.open();
  await pending;
  expect(queued.stats.messagesQueued).toBe(0);
  if (kind === 'live') expect(ScriptedWebSocket.instances[0]!.sent).toEqual([JSON.stringify({ n: 1 })]);
  else expect((base as ReturnType<typeof createMockWebSocket>).sentMessages).toEqual([{ n: 1 }]);
  await queued.disconnect();
 });
}
it('V3-1 accepted disconnect retains messages enqueued by its loss notification', async () => {
 const base=await opened(); const queued=createQueuedWebSocket(base);
 base.subscribeToEvents(event=>{if(event.type==='disconnected')void queued.send('new owner');});
 await queued.disconnect();expect(queued.stats.messagesQueued).toBe(1);
});
it('V3-2 replacing a failed established connection reports its loss exactly once', async () => {
 const client=await opened();const old=ScriptedWebSocket.instances[0]!;const events:string[]=[];
 let replacement:Promise<void>|undefined;
 client.subscribeToEvents(event=>{events.push(event.type);if(event.type==='error')replacement=client.connect('wss://new');});
 old.error();old.closed(1006);
 expect(events).toEqual(['error','disconnected']);
 expect(client.state.url).toBe('wss://new');
 ScriptedWebSocket.instances[1]!.open();await replacement;
 expect(events).toEqual(['error','disconnected','connected']);await client.disconnect();
});
for(const action of ['disconnect','reconnect','connect'] as const){
 it(`V3-2 replacement loss listener ${action} retires outer connect without orphan socket`,async()=>{
  const client=await opened();const old=ScriptedWebSocket.instances[0]!;old.error();let losses=0;let nested:Promise<void>|undefined;
  const stop=client.subscribeToEvents(event=>{if(event.type!=='disconnected')return;losses++;if(action==='disconnect')void client.disconnect();else if(action==='reconnect')client.reconnect();else nested=client.connect('wss://nested');});
  const retired=client.connect('wss://outer').catch(error=>error);old.closed(1006);
  try {
  expect(losses).toBe(1);
  const error=await retired;expect(error).toBeInstanceOf(WebSocketError);expect(error.code).toBe(WS_ERROR_CODES.CONNECTION_FAILED);expect(losses).toBe(1);
  if(action==='reconnect')await vi.advanceTimersByTimeAsync(10);
  if(action!=='disconnect'){expect(ScriptedWebSocket.instances).toHaveLength(2);ScriptedWebSocket.instances[1]!.open();await nested;}else{expect(ScriptedWebSocket.instances).toHaveLength(1);expect(client.state.status).toBe('disconnected');}
  } finally {stop();await client.disconnect();}
  expect(vi.getTimerCount()).toBe(0);
 });
}
it('V3-3 mock retirement matches live handshake rejection details',async()=>{
 vi.useFakeTimers();const mock=createMockWebSocket();const pending=mock.connect('wss://test').catch(error=>error);await mock.disconnect();const error=await pending;
 expect(error).toMatchObject({message:'Disconnected before the connection opened',code:WS_ERROR_CODES.CONNECTION_FAILED,recoverable:false});
});
