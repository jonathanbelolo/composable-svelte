import assert from 'node:assert/strict';
import { render, App } from '../ssr/ssr-entry.js';

let streamCallCount = 0;
let serviceCallCount = 0;
const dependencies = {
  streamMessage: () => {
    streamCallCount++;
    throw new Error('SSR must not invoke network streamMessage');
  },
  generateId: () => 'ssr-id',
  getTimestamp: () => 1700000000000,
  transcribeAudio: async () => {
    serviceCallCount++;
    return 'ssr transcript';
  },
  createAudioManager: () => {
    serviceCallCount++;
    return {};
  },
  getAudioManager: () => {
    serviceCallCount++;
    return {};
  },
  deleteAudioManager: () => {
    serviceCallCount++;
  },
  uploadFile: async () => {
    serviceCallCount++;
    return 'ssr-upload';
  }
};

console.log('Running SSR verification...');

// 1. Deterministic rendering
const res1 = render(App, { props: { dependencies } });
const res2 = render(App, { props: { dependencies } });

assert.equal(res1.body, res2.body, 'SSR rendering must be deterministic');
assert.match(res1.body, /Support Conversation Workspace/, 'Must render workspace title');
assert.match(res1.body, /Issue #101: Authentication Handler Bug/, 'Must render active conversation title');
assert.match(res1.body, /Conversation Chat/, 'Must render chat feature outlet');
assert.match(res1.body, /Support Draft Editor/, 'Must render editor feature outlet');
assert.match(res1.body, /Voice &amp; Media Tools/, 'Must render voice & media panel');
assert.match(res1.body, /Deterministic Simulation/, 'Must render qualification notice');

// 2. Empty state rendering
const emptyRes = render(App, {
  props: {
    dependencies,
    initialState: { activeConversationId: null }
  }
});
assert.match(emptyRes.body, /No Active Conversation/, 'Must render empty state when activeConversationId is null');
assert.doesNotMatch(emptyRes.body, /Support Draft Editor/, 'Must not mount draft editor when no conversation is active');

// 3. Independent conversation rendering
const conv2Res = render(App, {
  props: {
    dependencies,
    initialState: { activeConversationId: 'conv-2' }
  }
});
assert.match(conv2Res.body, /Issue #102: Audio Stream Buffer Tuning/, 'Must render Conv-2 title');
assert.match(conv2Res.body, /data-testid="active-id"[^>]*>conv-2</, 'Conv-2 request renders conv-2 as active');

// 4. Independent request roots: a later default request is unaffected by earlier requests
const res3 = render(App, { props: { dependencies } });
assert.equal(res3.body, res1.body, 'A later default request must not observe earlier request state');
assert.match(res3.body, /data-testid="active-id"[^>]*>conv-1</, 'Default request renders conv-1 as active');

// 5. Ensure no async background side-effects or device work ran during SSR
await new Promise((resolve) => setTimeout(resolve, 50));
assert.equal(streamCallCount, 0, 'SSR must not execute streaming services');
assert.equal(serviceCallCount, 0, 'SSR must not touch audio devices, transcription or uploads');

console.log('SSR verification passed: deterministic rendering, request isolation, and no server-side service execution.');
