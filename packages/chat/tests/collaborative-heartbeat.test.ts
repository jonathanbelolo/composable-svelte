import { describe, it, expect } from 'vitest';
import { createStore } from '@composable-svelte/core';
import { collaborativeReducer } from '../src/lib/streaming-chat/collaborative-reducer.js';
import { createInitialCollaborativeState, type CollaborativeDependencies, type CollaborativeUser } from '../src/lib/streaming-chat/collaborative-types.js';

// DEF-018: exercise the subscribed transport callback, not a direct reducer action.
describe('collaborative heartbeat transport delivery', () => {
  it('updates a known peer, preserves neighboring frames, and drops obsolete socket delivery', () => {
    const callbacks: Array<(message: unknown) => void> = [];
    let closed = 0;
    let now = 10;
    const lifecycle: string[] = [];
    const sent: unknown[] = [];
    const dependencies: CollaborativeDependencies = {
      connectWebSocket: (_conversation, _user, onMessage, onConnection) => {
        lifecycle.push('open');
        callbacks.push(onMessage);
        onConnection({ status: 'connected', connectedAt: 10 });
        return () => { lifecycle.push('close'); closed++; };
      },
      sendWebSocketMessage: async (message) => { sent.push(message); },
      getTimestamp: () => now
    };
    const store = createStore({initialState:createInitialCollaborativeState(), reducer:collaborativeReducer, dependencies, ssr:{deferEffects:false}});
    const peer: CollaborativeUser = {id:'peer',name:'Peer',color:'#456',presence:'active',typing:null,cursor:null,lastSeen:1};
    try {
      store.dispatch({type:'connectToConversation',conversationId:'demo',userId:'self'});
      const first = callbacks[0]!;
      first({type:'user_joined',user:peer});
      expect(store.state.users.get('peer')?.lastSeen).toBe(1);
      now = 20;
      first({type:'heartbeat',userId:'peer',timestamp:200000});
      expect(store.state.users.get('peer')?.lastSeen).toBe(20);
      first({type:'heartbeat',userId:'unknown',timestamp:30});
      expect(store.state.users.has('unknown')).toBe(false);
      first({type:'heartbeat',userId:'peer',timestamp:'bad'});
      first({type:'heartbeat',userId:'peer',timestamp:NaN});
      first(null);
      expect(store.state.users.get('peer')?.lastSeen).toBe(20);
      first({type:'presence_changed',userId:'peer',presence:'away'});
      expect(store.state.users.get('peer')?.presence).toBe('away');
      store.dispatch({type:'reconnectRequested'});
      expect(callbacks).toHaveLength(2);
      expect(closed).toBe(1);
      expect(lifecycle).toEqual(['open','close','open']);
      first({type:'heartbeat',userId:'peer',timestamp:999});
      expect(store.state.users.get('peer')?.lastSeen).toBe(20);
      now = 40;
      callbacks[1]!({type:'heartbeat',userId:'peer',timestamp:400000});
      expect(store.state.users.get('peer')?.lastSeen).toBe(40);
      callbacks[1]!({type:'user_joined',user:{...peer,id:'self'}});
      store.dispatch({type:'sendHeartbeat'});
      const frame = sent[sent.length - 1];
      expect(frame).toEqual({type:'heartbeat',userId:'self',timestamp:40});
      now = 50;
      callbacks[1]!(frame);
      expect(store.state.users.get('self')?.lastSeen).toBe(50);
      const frameCount = sent.length;
      callbacks[1]!(frame);
      expect(sent).toHaveLength(frameCount);
      store.destroy();
      store.destroy();
      callbacks[1]!({type:'heartbeat',userId:'peer',timestamp:1000});
      expect(store.state.users.get('peer')?.lastSeen).toBe(40);
      expect(closed).toBe(2);
    } finally { store.destroy(); }
  });
});
