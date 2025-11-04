/**
 * Tests for WebSocket Message Queue
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createMessageQueue, createQueuedWebSocket } from '../../src/lib/websocket/message-queue.js';
import { createMockWebSocket } from '../../src/lib/websocket/testing/mock-client.js';

describe('Message Queue', () => {
  describe('Basic Queue Operations', () => {
    it('should start with size 0', () => {
      const queue = createMessageQueue(100);

      expect(queue.size).toBe(0);
    });

    it('should enqueue messages', () => {
      const queue = createMessageQueue<string>(100);

      queue.enqueue('message1');
      queue.enqueue('message2');
      queue.enqueue('message3');

      expect(queue.size).toBe(3);
    });

    it('should flush messages in order', () => {
      const queue = createMessageQueue<string>(100);

      queue.enqueue('first');
      queue.enqueue('second');
      queue.enqueue('third');

      const messages = queue.flush();

      expect(messages).toEqual(['first', 'second', 'third']);
    });

    it('should clear queue after flush', () => {
      const queue = createMessageQueue<string>(100);

      queue.enqueue('msg1');
      queue.enqueue('msg2');
      queue.flush();

      expect(queue.size).toBe(0);
    });

    it('should clear all messages', () => {
      const queue = createMessageQueue<string>(100);

      queue.enqueue('msg1');
      queue.enqueue('msg2');
      queue.enqueue('msg3');

      queue.clear();

      expect(queue.size).toBe(0);
    });

    it('should return empty array on flush of empty queue', () => {
      const queue = createMessageQueue<string>(100);

      const messages = queue.flush();

      expect(messages).toEqual([]);
    });
  });

  describe('Max Size Behavior', () => {
    it('should respect maxSize', () => {
      const queue = createMessageQueue<string>(100);

      expect(queue.maxSize).toBe(100);
    });

    it('should use default maxSize', () => {
      const queue = createMessageQueue<string>();

      expect(queue.maxSize).toBe(100);
    });

    it('should drop oldest message when exceeding maxSize', () => {
      const queue = createMessageQueue<string>(3);

      queue.enqueue('msg1');
      queue.enqueue('msg2');
      queue.enqueue('msg3');
      queue.enqueue('msg4'); // Should drop msg1

      const messages = queue.flush();

      expect(messages).toEqual(['msg2', 'msg3', 'msg4']);
      expect(messages.length).toBe(3);
    });

    it('should handle continuous overflow', () => {
      const queue = createMessageQueue<number>(2);

      queue.enqueue(1);
      queue.enqueue(2);
      queue.enqueue(3); // Drop 1
      queue.enqueue(4); // Drop 2
      queue.enqueue(5); // Drop 3

      const messages = queue.flush();

      expect(messages).toEqual([4, 5]);
    });

    it('should handle maxSize of 1', () => {
      const queue = createMessageQueue<string>(1);

      queue.enqueue('first');
      queue.enqueue('second'); // Should replace first

      const messages = queue.flush();

      expect(messages).toEqual(['second']);
      expect(messages.length).toBe(1);
    });
  });

  describe('Type Safety', () => {
    it('should support generic message types', () => {
      interface ChatMessage {
        type: 'chat';
        user: string;
        text: string;
      }

      const queue = createMessageQueue<ChatMessage>(10);

      queue.enqueue({ type: 'chat', user: 'Alice', text: 'Hello' });
      queue.enqueue({ type: 'chat', user: 'Bob', text: 'Hi' });

      const messages = queue.flush();

      expect(messages[0].user).toBe('Alice');
      expect(messages[1].user).toBe('Bob');
    });

    it('should work with complex object types', () => {
      interface ComplexMessage {
        id: string;
        timestamp: number;
        data: {
          nested: {
            value: string;
          };
        };
      }

      const queue = createMessageQueue<ComplexMessage>(10);

      const msg: ComplexMessage = {
        id: '123',
        timestamp: Date.now(),
        data: { nested: { value: 'test' } }
      };

      queue.enqueue(msg);

      const messages = queue.flush();
      expect(messages[0].data.nested.value).toBe('test');
    });
  });

  describe('Multiple Flush Operations', () => {
    it('should allow multiple enqueue/flush cycles', () => {
      const queue = createMessageQueue<string>(100);

      // First cycle
      queue.enqueue('msg1');
      queue.enqueue('msg2');
      const first = queue.flush();

      // Second cycle
      queue.enqueue('msg3');
      queue.enqueue('msg4');
      const second = queue.flush();

      expect(first).toEqual(['msg1', 'msg2']);
      expect(second).toEqual(['msg3', 'msg4']);
    });

    it('should maintain independence between cycles', () => {
      const queue = createMessageQueue<string>(100);

      queue.enqueue('a');
      queue.flush();

      queue.enqueue('b');

      expect(queue.size).toBe(1);

      const messages = queue.flush();
      expect(messages).toEqual(['b']);
    });
  });
});

describe('Queued WebSocket Client', () => {
  describe('Integration with WebSocket Client', () => {
    it('should send messages when connected', async () => {
      const baseClient = createMockWebSocket();
      const queuedClient = createQueuedWebSocket(baseClient, 100);

      await queuedClient.connect('wss://example.com');
      await queuedClient.send({ type: 'test', data: 'hello' });

      expect(baseClient.sentMessages).toHaveLength(1);
      expect(baseClient.sentMessages[0]).toEqual({ type: 'test', data: 'hello' });
    });

    it('should queue messages when disconnected', async () => {
      const baseClient = createMockWebSocket();
      const queuedClient = createQueuedWebSocket(baseClient, 100);

      // Send without connecting
      await queuedClient.send({ type: 'queued', data: 'offline' });

      expect(baseClient.sentMessages).toHaveLength(0);
    });

    it('should flush queued messages on connect', async () => {
      const baseClient = createMockWebSocket();
      const queuedClient = createQueuedWebSocket(baseClient, 100);

      // Queue messages while offline
      await queuedClient.send({ type: 'msg1' });
      await queuedClient.send({ type: 'msg2' });
      await queuedClient.send({ type: 'msg3' });

      expect(baseClient.sentMessages).toHaveLength(0);

      // Connect - should flush queue
      await queuedClient.connect('wss://example.com');

      // Give event handlers time to process
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(baseClient.sentMessages).toHaveLength(3);
      expect(baseClient.sentMessages.map((m: any) => m.type)).toEqual(['msg1', 'msg2', 'msg3']);
    });

    it('should send directly when already connected', async () => {
      const baseClient = createMockWebSocket();
      const queuedClient = createQueuedWebSocket(baseClient, 100);

      await queuedClient.connect('wss://example.com');

      await queuedClient.send({ type: 'msg1' });
      await queuedClient.send({ type: 'msg2' });

      expect(baseClient.sentMessages).toHaveLength(2);
    });

    it('should handle reconnection scenarios', async () => {
      const baseClient = createMockWebSocket();
      const queuedClient = createQueuedWebSocket(baseClient, 100);

      // Initial connection
      await queuedClient.connect('wss://example.com');
      await queuedClient.send({ type: 'connected1' });

      expect(baseClient.sentMessages).toHaveLength(1);

      // Disconnect
      await queuedClient.disconnect();

      // Queue while offline
      await queuedClient.send({ type: 'offline1' });
      await queuedClient.send({ type: 'offline2' });

      expect(baseClient.sentMessages).toHaveLength(1); // Still just the first message

      // Reconnect (without reset to preserve event listeners)
      await queuedClient.connect('wss://example.com');

      // Give event handlers time to process
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(baseClient.sentMessages).toHaveLength(3); // All messages sent
      expect(baseClient.sentMessages.map((m: any) => m.type)).toEqual(['connected1', 'offline1', 'offline2']);
    });
  });

  describe('Queue Size Management', () => {
    it('should respect custom queue size', async () => {
      const baseClient = createMockWebSocket();
      const queuedClient = createQueuedWebSocket(baseClient, 2);

      // Queue 4 messages (exceeds size 2)
      await queuedClient.send({ type: 'msg1' });
      await queuedClient.send({ type: 'msg2' });
      await queuedClient.send({ type: 'msg3' }); // Should drop msg1
      await queuedClient.send({ type: 'msg4' }); // Should drop msg2

      // Connect - should only flush last 2
      await queuedClient.connect('wss://example.com');

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(baseClient.sentMessages).toHaveLength(2);
      expect(baseClient.sentMessages.map((m: any) => m.type)).toEqual(['msg3', 'msg4']);
    });

    it('should use default queue size', async () => {
      const baseClient = createMockWebSocket();
      const queuedClient = createQueuedWebSocket(baseClient);

      // Queue many messages
      for (let i = 0; i < 150; i++) {
        await queuedClient.send({ type: `msg${i}` });
      }

      await queuedClient.connect('wss://example.com');

      await new Promise(resolve => setTimeout(resolve, 10));

      // Should only have last 100 (default queue size)
      expect(baseClient.sentMessages).toHaveLength(100);

      const firstMessage = (baseClient.sentMessages[0] as any).type;
      expect(firstMessage).toBe('msg50'); // Messages 0-49 were dropped
    });
  });

  describe('State Preservation', () => {
    it('should preserve client state', async () => {
      const baseClient = createMockWebSocket();
      const queuedClient = createQueuedWebSocket(baseClient, 100);

      await queuedClient.connect('wss://example.com');

      expect(queuedClient.state.status).toBe('connected');
      expect(queuedClient.state.url).toBe('wss://example.com');
    });

    it('should preserve client stats', async () => {
      const baseClient = createMockWebSocket();
      const queuedClient = createQueuedWebSocket(baseClient, 100);

      await queuedClient.connect('wss://example.com');
      await queuedClient.send({ type: 'test' });

      expect(queuedClient.stats.messagesSent).toBe(1);
    });

    it('should delegate connect and disconnect', async () => {
      const baseClient = createMockWebSocket();
      const queuedClient = createQueuedWebSocket(baseClient, 100);

      await queuedClient.connect('wss://example.com', ['proto1']);

      expect(baseClient.state.status).toBe('connected');
      expect(baseClient.state.protocols).toEqual(['proto1']);

      await queuedClient.disconnect(1000, 'Done');

      expect(baseClient.state.status).toBe('disconnected');
    });

    it('should delegate subscribe', async () => {
      const baseClient = createMockWebSocket();
      const queuedClient = createQueuedWebSocket(baseClient, 100);

      await queuedClient.connect('wss://example.com');

      const messages: any[] = [];
      queuedClient.subscribe((msg) => messages.push(msg.data));

      baseClient.simulateMessage({ type: 'test', data: 'hello' });

      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({ type: 'test', data: 'hello' });
    });

    it('should delegate subscribeToEvents', async () => {
      const baseClient = createMockWebSocket();
      const queuedClient = createQueuedWebSocket(baseClient, 100);

      const events: string[] = [];
      queuedClient.subscribeToEvents((event) => events.push(event.type));

      await queuedClient.connect('wss://example.com');
      await queuedClient.disconnect();

      expect(events).toContain('connected');
      expect(events).toContain('disconnected');
    });
  });

  describe('Error Handling', () => {
    it('should handle flush errors gracefully', async () => {
      const baseClient = createMockWebSocket();
      const queuedClient = createQueuedWebSocket(baseClient, 100);

      // Queue message
      await queuedClient.send({ type: 'test' });

      // Connect
      await queuedClient.connect('wss://example.com');

      // Immediately disconnect before flush completes
      await queuedClient.disconnect();

      // Should not throw
      expect(baseClient.state.status).toBe('disconnected');
    });
  });

  describe('Type Safety', () => {
    it('should support generic message types', async () => {
      interface ChatMessage {
        type: 'chat';
        user: string;
        text: string;
      }

      const baseClient = createMockWebSocket<ChatMessage>();
      const queuedClient = createQueuedWebSocket(baseClient, 100);

      await queuedClient.send({ type: 'chat', user: 'Alice', text: 'Hello' });

      await queuedClient.connect('wss://example.com');

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(baseClient.sentMessages[0].user).toBe('Alice');
      expect(baseClient.sentMessages[0].text).toBe('Hello');
    });
  });

  describe('Edge Cases', () => {
    it('should handle multiple rapid connects/disconnects', async () => {
      const baseClient = createMockWebSocket();
      const queuedClient = createQueuedWebSocket(baseClient, 100);

      await queuedClient.send({ type: 'msg1' });

      await queuedClient.connect('wss://example.com');

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(baseClient.sentMessages.length).toBe(1);
      expect((baseClient.sentMessages[0] as any).type).toBe('msg1');

      await queuedClient.disconnect();

      await queuedClient.send({ type: 'msg2' });

      await queuedClient.connect('wss://example.com');

      await new Promise(resolve => setTimeout(resolve, 10));

      // Should have both messages (msg1 from first connect, msg2 from second connect)
      expect(baseClient.sentMessages.length).toBe(2);
      expect((baseClient.sentMessages[1] as any).type).toBe('msg2');
    });

    it('should handle connect while already connected', async () => {
      const baseClient = createMockWebSocket();
      const queuedClient = createQueuedWebSocket(baseClient, 100);

      await queuedClient.connect('wss://example.com');

      // Try to connect again (should throw from base client)
      await expect(queuedClient.connect('wss://other.com')).rejects.toThrow();
    });

    it('should handle send during connect', async () => {
      const baseClient = createMockWebSocket();
      const queuedClient = createQueuedWebSocket(baseClient, 100);

      // Queue message
      await queuedClient.send({ type: 'queued' });

      // Start connecting (don't await)
      const connectPromise = queuedClient.connect('wss://example.com');

      // Send during connect (should queue)
      await queuedClient.send({ type: 'during' });

      // Wait for connect to complete
      await connectPromise;

      await new Promise(resolve => setTimeout(resolve, 10));

      // Both should be sent
      expect(baseClient.sentMessages.length).toBe(2);
    });
  });
});
