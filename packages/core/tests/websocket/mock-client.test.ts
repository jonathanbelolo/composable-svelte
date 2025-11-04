/**
 * Tests for Mock WebSocket Client
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockWebSocket } from '../../src/lib/websocket/testing/mock-client.js';
import type { WebSocketMessage, WebSocketEvent } from '../../src/lib/websocket/types.js';
import { WebSocketError, WS_ERROR_CODES } from '../../src/lib/websocket/types.js';

describe('Mock WebSocket Client', () => {
  describe('Connection Management', () => {
    it('should start in disconnected state', () => {
      const client = createMockWebSocket();

      expect(client.state.status).toBe('disconnected');
      expect(client.state.url).toBeNull();
      expect(client.state.connectedAt).toBeNull();
    });

    it('should transition to connected state on connect', async () => {
      const client = createMockWebSocket();

      await client.connect('wss://example.com');

      expect(client.state.status).toBe('connected');
      expect(client.state.url).toBe('wss://example.com');
      expect(client.state.connectedAt).toBeInstanceOf(Date);
    });

    it('should support protocols on connect', async () => {
      const client = createMockWebSocket();

      await client.connect('wss://example.com', ['protocol1', 'protocol2']);

      expect(client.state.protocols).toEqual(['protocol1', 'protocol2']);
    });

    it('should transition to disconnected state on disconnect', async () => {
      const client = createMockWebSocket();
      await client.connect('wss://example.com');

      await client.disconnect();

      expect(client.state.status).toBe('disconnected');
      expect(client.state.url).toBeNull();
      expect(client.state.connectedAt).toBeNull();
    });

    it('should reject connect when already connected', async () => {
      const client = createMockWebSocket();
      await client.connect('wss://example.com');

      await expect(client.connect('wss://other.com')).rejects.toThrow('Already connected');
    });

    it('should handle disconnect when not connected', async () => {
      const client = createMockWebSocket();

      await expect(client.disconnect()).resolves.not.toThrow();
    });
  });

  describe('Message Sending', () => {
    it('should send messages when connected', async () => {
      const client = createMockWebSocket();
      await client.connect('wss://example.com');

      const message = { type: 'ping', data: 'test' };
      await client.send(message);

      expect(client.sentMessages).toHaveLength(1);
      expect(client.sentMessages[0]).toEqual(message);
    });

    it('should track multiple sent messages', async () => {
      const client = createMockWebSocket();
      await client.connect('wss://example.com');

      await client.send({ type: 'msg1' });
      await client.send({ type: 'msg2' });
      await client.send({ type: 'msg3' });

      expect(client.sentMessages).toHaveLength(3);
      expect(client.sentMessages.map(m => m.type)).toEqual(['msg1', 'msg2', 'msg3']);
    });

    it('should reject send when not connected', async () => {
      const client = createMockWebSocket();

      await expect(client.send({ type: 'test' })).rejects.toThrow('Not connected');
    });

    it('should update stats when sending', async () => {
      const client = createMockWebSocket();
      await client.connect('wss://example.com');

      await client.send({ type: 'test', data: 'hello' });

      expect(client.stats.messagesSent).toBe(1);
      expect(client.stats.bytesSent).toBeGreaterThan(0);
    });
  });

  describe('Message Reception', () => {
    it('should notify message listeners', async () => {
      const client = createMockWebSocket();
      await client.connect('wss://example.com');

      const messages: WebSocketMessage<any>[] = [];
      client.subscribe((msg) => messages.push(msg));

      client.simulateMessage({ type: 'test', data: 'hello' });

      expect(messages).toHaveLength(1);
      expect(messages[0].data).toEqual({ type: 'test', data: 'hello' });
      expect(messages[0].timestamp).toBeGreaterThan(0);
    });

    it('should notify multiple message listeners', async () => {
      const client = createMockWebSocket();
      await client.connect('wss://example.com');

      const listener1 = vi.fn();
      const listener2 = vi.fn();
      client.subscribe(listener1);
      client.subscribe(listener2);

      client.simulateMessage({ type: 'test' });

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it('should update stats when receiving', async () => {
      const client = createMockWebSocket();
      await client.connect('wss://example.com');

      client.simulateMessage({ type: 'test', data: 'hello' });

      expect(client.stats.messagesReceived).toBe(1);
      expect(client.stats.bytesReceived).toBeGreaterThan(0);
    });

    it('should allow unsubscribing from messages', async () => {
      const client = createMockWebSocket();
      await client.connect('wss://example.com');

      const listener = vi.fn();
      const unsubscribe = client.subscribe(listener);

      client.simulateMessage({ type: 'msg1' });
      unsubscribe();
      client.simulateMessage({ type: 'msg2' });

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('Event Handling', () => {
    it('should emit connected event on connect', async () => {
      const client = createMockWebSocket();

      const events: WebSocketEvent[] = [];
      client.subscribeToEvents((event) => events.push(event));

      await client.connect('wss://example.com');

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('connected');
      expect((events[0] as any).url).toBe('wss://example.com');
    });

    it('should emit disconnected event on disconnect', async () => {
      const client = createMockWebSocket();
      await client.connect('wss://example.com');

      const events: WebSocketEvent[] = [];
      client.subscribeToEvents((event) => events.push(event));

      await client.disconnect(1000, 'Normal closure');

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('disconnected');
      expect((events[0] as any).code).toBe(1000);
      expect((events[0] as any).reason).toBe('Normal closure');
    });

    it('should support simulating custom events', async () => {
      const client = createMockWebSocket();
      await client.connect('wss://example.com');

      const events: WebSocketEvent[] = [];
      client.subscribeToEvents((event) => events.push(event));

      client.simulateEvent({
        type: 'reconnecting',
        attempt: 1,
        nextDelay: 1000
      });

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('reconnecting');
    });

    it('should allow unsubscribing from events', async () => {
      const client = createMockWebSocket();

      const listener = vi.fn();
      const unsubscribe = client.subscribeToEvents(listener);

      await client.connect('wss://example.com');
      unsubscribe();
      await client.disconnect();

      expect(listener).toHaveBeenCalledTimes(1); // Only connected event
    });
  });

  describe('Error Simulation', () => {
    it('should simulate errors', async () => {
      const client = createMockWebSocket();
      await client.connect('wss://example.com');

      const events: WebSocketEvent[] = [];
      client.subscribeToEvents((event) => events.push(event));

      const error = new WebSocketError(
        'Connection failed',
        WS_ERROR_CODES.CONNECTION_FAILED,
        true
      );
      client.simulateError(error);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('error');
      expect((events[0] as any).error).toBe(error);
      expect(client.state.lastError).toBe(error);
    });

    it('should update error stats', async () => {
      const client = createMockWebSocket();
      await client.connect('wss://example.com');

      const error = new WebSocketError('Test error', null, true);
      client.simulateError(error);

      expect(client.stats.errors).toBe(1);
    });
  });

  describe('Disconnect Simulation', () => {
    it('should simulate disconnection', async () => {
      const client = createMockWebSocket();
      await client.connect('wss://example.com');

      const events: WebSocketEvent[] = [];
      client.subscribeToEvents((event) => events.push(event));

      client.simulateDisconnect(1001, 'Going away');

      expect(client.state.status).toBe('disconnected');
      expect(events.some(e => e.type === 'disconnected')).toBe(true);
    });
  });

  describe('Reset Functionality', () => {
    it('should clear all sent messages', async () => {
      const client = createMockWebSocket();
      await client.connect('wss://example.com');

      await client.send({ type: 'msg1' });
      await client.send({ type: 'msg2' });

      client.reset();

      expect(client.sentMessages).toHaveLength(0);
    });

    it('should reset connection state', async () => {
      const client = createMockWebSocket();
      await client.connect('wss://example.com');

      client.reset();

      expect(client.state.status).toBe('disconnected');
      expect(client.state.url).toBeNull();
    });

    it('should reset statistics', async () => {
      const client = createMockWebSocket();
      await client.connect('wss://example.com');
      await client.send({ type: 'test' });
      client.simulateMessage({ type: 'response' });

      client.reset();

      expect(client.stats.messagesSent).toBe(0);
      expect(client.stats.messagesReceived).toBe(0);
      expect(client.stats.bytesSent).toBe(0);
      expect(client.stats.bytesReceived).toBe(0);
      expect(client.stats.errors).toBe(0);
    });
  });

  describe('Statistics Tracking', () => {
    it('should track connection statistics', async () => {
      const client = createMockWebSocket();

      await client.connect('wss://example.com');
      await client.send({ type: 'msg1' });
      await client.send({ type: 'msg2' });
      client.simulateMessage({ type: 'response1' });
      client.simulateMessage({ type: 'response2' });
      client.simulateMessage({ type: 'response3' });

      expect(client.stats.messagesSent).toBe(2);
      expect(client.stats.messagesReceived).toBe(3);
      expect(client.stats.bytesSent).toBeGreaterThan(0);
      expect(client.stats.bytesReceived).toBeGreaterThan(0);
    });

    it('should track uptime when connected', async () => {
      const client = createMockWebSocket();

      await client.connect('wss://example.com');
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(client.stats.uptime).toBeGreaterThan(0);
    });

    it('should reset uptime on disconnect', async () => {
      const client = createMockWebSocket();

      await client.connect('wss://example.com');
      await new Promise(resolve => setTimeout(resolve, 50));
      await client.disconnect();

      expect(client.stats.uptime).toBe(0);
    });
  });

  describe('Type Safety', () => {
    it('should support generic message types', async () => {
      interface ChatMessage {
        type: 'chat';
        user: string;
        text: string;
      }

      const client = createMockWebSocket<ChatMessage>();
      await client.connect('wss://example.com');

      const messages: ChatMessage[] = [];
      client.subscribe((msg) => messages.push(msg.data));

      client.simulateMessage({ type: 'chat', user: 'Alice', text: 'Hello' });

      expect(messages[0].user).toBe('Alice');
      expect(messages[0].text).toBe('Hello');
    });
  });
});
