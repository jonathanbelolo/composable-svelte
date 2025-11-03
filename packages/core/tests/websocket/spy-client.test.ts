/**
 * Tests for Spy WebSocket Client
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSpyWebSocket } from '../../src/websocket/testing/spy-client.js';
import { createMockWebSocket } from '../../src/websocket/testing/mock-client.js';
import type { WebSocketMessage } from '../../src/websocket/types.js';

describe('Spy WebSocket Client', () => {
  describe('Connection Recording', () => {
    it('should record connection attempts', async () => {
      const mockClient = createMockWebSocket();
      const spyClient = createSpyWebSocket(mockClient);

      await spyClient.connect('wss://example.com', ['protocol1']);

      expect(spyClient.connections).toHaveLength(1);
      expect(spyClient.connections[0].url).toBe('wss://example.com');
      expect(spyClient.connections[0].protocols).toEqual(['protocol1']);
      expect(spyClient.connections[0].timestamp).toBeGreaterThan(0);
    });

    it('should record multiple connection attempts', async () => {
      const mockClient = createMockWebSocket();
      const spyClient = createSpyWebSocket(mockClient);

      await spyClient.connect('wss://example.com');
      await spyClient.disconnect();
      await spyClient.connect('wss://other.com');

      expect(spyClient.connections).toHaveLength(2);
      expect(spyClient.connections[0].url).toBe('wss://example.com');
      expect(spyClient.connections[1].url).toBe('wss://other.com');
    });

    it('should count connections to specific URL', async () => {
      const mockClient = createMockWebSocket();
      const spyClient = createSpyWebSocket(mockClient);

      await spyClient.connect('wss://example.com');
      await spyClient.disconnect();
      await spyClient.connect('wss://example.com');
      await spyClient.disconnect();
      await spyClient.connect('wss://other.com');

      expect(spyClient.connectionsTo('wss://example.com')).toBe(2);
      expect(spyClient.connectionsTo('wss://other.com')).toBe(1);
      expect(spyClient.connectionsTo('wss://unknown.com')).toBe(0);
    });
  });

  describe('Disconnection Recording', () => {
    it('should record disconnections', async () => {
      const mockClient = createMockWebSocket();
      const spyClient = createSpyWebSocket(mockClient);

      await spyClient.connect('wss://example.com');
      await spyClient.disconnect(1000, 'Normal closure');

      expect(spyClient.disconnections).toHaveLength(1);
      expect(spyClient.disconnections[0].code).toBe(1000);
      expect(spyClient.disconnections[0].reason).toBe('Normal closure');
      expect(spyClient.disconnections[0].timestamp).toBeGreaterThan(0);
    });

    it('should record multiple disconnections', async () => {
      const mockClient = createMockWebSocket();
      const spyClient = createSpyWebSocket(mockClient);

      await spyClient.connect('wss://example.com');
      await spyClient.disconnect(1000, 'First');

      await spyClient.connect('wss://example.com');
      await spyClient.disconnect(1001, 'Second');

      expect(spyClient.disconnections).toHaveLength(2);
      expect(spyClient.disconnections[0].reason).toBe('First');
      expect(spyClient.disconnections[1].reason).toBe('Second');
    });
  });

  describe('Message Sending Recording', () => {
    it('should record sent messages', async () => {
      const mockClient = createMockWebSocket();
      const spyClient = createSpyWebSocket(mockClient);

      await spyClient.connect('wss://example.com');
      await spyClient.send({ type: 'test', data: 'hello' });

      expect(spyClient.sentMessages).toHaveLength(1);
      expect(spyClient.sentMessages[0]).toEqual({ type: 'test', data: 'hello' });
    });

    it('should record multiple sent messages', async () => {
      const mockClient = createMockWebSocket();
      const spyClient = createSpyWebSocket(mockClient);

      await spyClient.connect('wss://example.com');
      await spyClient.send({ type: 'msg1' });
      await spyClient.send({ type: 'msg2' });
      await spyClient.send({ type: 'msg3' });

      expect(spyClient.sentMessages).toHaveLength(3);
      expect(spyClient.sentMessages.map(m => m.type)).toEqual(['msg1', 'msg2', 'msg3']);
    });

    it('should delegate send to real client', async () => {
      const mockClient = createMockWebSocket();
      const spyClient = createSpyWebSocket(mockClient);

      await spyClient.connect('wss://example.com');
      await spyClient.send({ type: 'test' });

      // Verify mock client also recorded the message
      expect(mockClient.sentMessages).toHaveLength(1);
      expect(mockClient.sentMessages[0]).toEqual({ type: 'test' });
    });
  });

  describe('Message Reception Recording', () => {
    it('should record received messages', async () => {
      const mockClient = createMockWebSocket();
      const spyClient = createSpyWebSocket(mockClient);

      await spyClient.connect('wss://example.com');

      const messages: WebSocketMessage<any>[] = [];
      spyClient.subscribe((msg) => messages.push(msg));

      mockClient.simulateMessage({ type: 'test', data: 'hello' });

      expect(spyClient.receivedMessages).toHaveLength(1);
      expect(spyClient.receivedMessages[0].data).toEqual({ type: 'test', data: 'hello' });
    });

    it('should record multiple received messages', async () => {
      const mockClient = createMockWebSocket();
      const spyClient = createSpyWebSocket(mockClient);

      await spyClient.connect('wss://example.com');
      spyClient.subscribe(() => {}); // Need at least one subscriber

      mockClient.simulateMessage({ type: 'msg1' });
      mockClient.simulateMessage({ type: 'msg2' });
      mockClient.simulateMessage({ type: 'msg3' });

      expect(spyClient.receivedMessages).toHaveLength(3);
      expect(spyClient.receivedMessages.map(m => m.data.type)).toEqual(['msg1', 'msg2', 'msg3']);
    });

    it('should notify original listeners', async () => {
      const mockClient = createMockWebSocket();
      const spyClient = createSpyWebSocket(mockClient);

      await spyClient.connect('wss://example.com');

      const messages: WebSocketMessage<any>[] = [];
      spyClient.subscribe((msg) => messages.push(msg));

      mockClient.simulateMessage({ type: 'test' });

      expect(messages).toHaveLength(1);
      expect(messages[0].data.type).toBe('test');
    });
  });

  describe('State Delegation', () => {
    it('should delegate state to real client', async () => {
      const mockClient = createMockWebSocket();
      const spyClient = createSpyWebSocket(mockClient);

      expect(spyClient.state.status).toBe('disconnected');

      await spyClient.connect('wss://example.com');

      expect(spyClient.state.status).toBe('connected');
      expect(spyClient.state.url).toBe('wss://example.com');
    });
  });

  describe('Stats Delegation', () => {
    it('should delegate stats to real client', async () => {
      const mockClient = createMockWebSocket();
      const spyClient = createSpyWebSocket(mockClient);

      await spyClient.connect('wss://example.com');
      await spyClient.send({ type: 'test1' });
      await spyClient.send({ type: 'test2' });

      mockClient.simulateMessage({ type: 'response1' });
      mockClient.simulateMessage({ type: 'response2' });
      mockClient.simulateMessage({ type: 'response3' });

      expect(spyClient.stats.messagesSent).toBe(2);
      expect(spyClient.stats.messagesReceived).toBe(3);
    });
  });

  describe('Event Subscription', () => {
    it('should delegate event subscriptions to real client', async () => {
      const mockClient = createMockWebSocket();
      const spyClient = createSpyWebSocket(mockClient);

      const events: string[] = [];
      spyClient.subscribeToEvents((event) => events.push(event.type));

      await spyClient.connect('wss://example.com');
      await spyClient.disconnect();

      expect(events).toContain('connected');
      expect(events).toContain('disconnected');
    });
  });

  describe('Reset Functionality', () => {
    it('should clear all recorded connections', async () => {
      const mockClient = createMockWebSocket();
      const spyClient = createSpyWebSocket(mockClient);

      await spyClient.connect('wss://example.com');
      await spyClient.disconnect();
      await spyClient.connect('wss://other.com');

      expect(spyClient.connections).toHaveLength(2);

      spyClient.reset();

      expect(spyClient.connections).toHaveLength(0);
    });

    it('should clear all recorded disconnections', async () => {
      const mockClient = createMockWebSocket();
      const spyClient = createSpyWebSocket(mockClient);

      await spyClient.connect('wss://example.com');
      await spyClient.disconnect(1000, 'First');
      await spyClient.connect('wss://example.com');
      await spyClient.disconnect(1001, 'Second');

      expect(spyClient.disconnections).toHaveLength(2);

      spyClient.reset();

      expect(spyClient.disconnections).toHaveLength(0);
    });

    it('should clear all recorded sent messages', async () => {
      const mockClient = createMockWebSocket();
      const spyClient = createSpyWebSocket(mockClient);

      await spyClient.connect('wss://example.com');
      await spyClient.send({ type: 'msg1' });
      await spyClient.send({ type: 'msg2' });

      expect(spyClient.sentMessages).toHaveLength(2);

      spyClient.reset();

      expect(spyClient.sentMessages).toHaveLength(0);
    });

    it('should clear all recorded received messages', async () => {
      const mockClient = createMockWebSocket();
      const spyClient = createSpyWebSocket(mockClient);

      await spyClient.connect('wss://example.com');
      spyClient.subscribe(() => {}); // Need subscriber

      mockClient.simulateMessage({ type: 'msg1' });
      mockClient.simulateMessage({ type: 'msg2' });

      expect(spyClient.receivedMessages).toHaveLength(2);

      spyClient.reset();

      expect(spyClient.receivedMessages).toHaveLength(0);
    });
  });

  describe('Type Safety', () => {
    it('should support generic message types', async () => {
      interface ChatMessage {
        type: 'chat';
        user: string;
        text: string;
      }

      const mockClient = createMockWebSocket<ChatMessage>();
      const spyClient = createSpyWebSocket(mockClient);

      await spyClient.connect('wss://example.com');
      await spyClient.send({ type: 'chat', user: 'Alice', text: 'Hello' });

      expect(spyClient.sentMessages[0].user).toBe('Alice');
      expect(spyClient.sentMessages[0].text).toBe('Hello');
    });

    it('should preserve message types through reception', async () => {
      interface ChatMessage {
        type: 'chat';
        user: string;
        text: string;
      }

      const mockClient = createMockWebSocket<ChatMessage>();
      const spyClient = createSpyWebSocket(mockClient);

      await spyClient.connect('wss://example.com');
      spyClient.subscribe(() => {});

      mockClient.simulateMessage({ type: 'chat', user: 'Bob', text: 'Hi' });

      expect(spyClient.receivedMessages[0].data.user).toBe('Bob');
      expect(spyClient.receivedMessages[0].data.text).toBe('Hi');
    });
  });

  describe('Integration with Real Client', () => {
    it('should work seamlessly with mock client', async () => {
      const mockClient = createMockWebSocket();
      const spyClient = createSpyWebSocket(mockClient);

      // Connect
      await spyClient.connect('wss://example.com', ['proto1']);

      // Send messages
      await spyClient.send({ type: 'ping' });

      // Receive messages
      spyClient.subscribe(() => {});
      mockClient.simulateMessage({ type: 'pong' });

      // Disconnect
      await spyClient.disconnect(1000, 'Done');

      // Verify spy recorded everything
      expect(spyClient.connections).toHaveLength(1);
      expect(spyClient.connections[0].url).toBe('wss://example.com');
      expect(spyClient.connections[0].protocols).toEqual(['proto1']);

      expect(spyClient.sentMessages).toHaveLength(1);
      expect(spyClient.sentMessages[0]).toEqual({ type: 'ping' });

      expect(spyClient.receivedMessages).toHaveLength(1);
      expect(spyClient.receivedMessages[0].data).toEqual({ type: 'pong' });

      expect(spyClient.disconnections).toHaveLength(1);
      expect(spyClient.disconnections[0].code).toBe(1000);
      expect(spyClient.disconnections[0].reason).toBe('Done');

      // Verify mock client state
      expect(mockClient.state.status).toBe('disconnected');
      expect(mockClient.sentMessages).toHaveLength(1);
    });
  });

  describe('Unsubscribe Support', () => {
    it('should support unsubscribing from messages', async () => {
      const mockClient = createMockWebSocket();
      const spyClient = createSpyWebSocket(mockClient);

      await spyClient.connect('wss://example.com');

      const messages: WebSocketMessage<any>[] = [];
      const unsubscribe = spyClient.subscribe((msg) => messages.push(msg));

      mockClient.simulateMessage({ type: 'msg1' });
      unsubscribe();
      mockClient.simulateMessage({ type: 'msg2' });

      expect(messages).toHaveLength(1); // Only received msg1
      expect(spyClient.receivedMessages).toHaveLength(1); // Spy only records when listener is active
    });

    it('should support unsubscribing from events', async () => {
      const mockClient = createMockWebSocket();
      const spyClient = createSpyWebSocket(mockClient);

      const events: string[] = [];
      const unsubscribe = spyClient.subscribeToEvents((event) => events.push(event.type));

      await spyClient.connect('wss://example.com');
      unsubscribe();
      await spyClient.disconnect();

      expect(events).toHaveLength(1); // Only connected event
    });
  });
});
