/**
 * Tests for WebSocket Channel Router
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createChannelRouter, createChannelWebSocket } from '../../src/websocket/channel-router.js';
import { createMockWebSocket } from '../../src/websocket/testing/mock-client.js';
import type { WebSocketMessage } from '../../src/websocket/types.js';

interface ChannelMessage {
  channel: string;
  data: any;
}

describe('Channel Router', () => {
  describe('Basic Channel Routing', () => {
    it('should route messages to correct channel', async () => {
      const client = createMockWebSocket<ChannelMessage>();
      await client.connect('wss://example.com');

      const router = createChannelRouter(
        client,
        (msg) => msg.channel
      );

      const chatMessages: any[] = [];
      router.subscribe('chat', (msg) => chatMessages.push(msg.data));

      client.simulateMessage({ channel: 'chat', data: 'Hello' });

      expect(chatMessages).toHaveLength(1);
      expect(chatMessages[0].data).toBe('Hello');
    });

    it('should route to multiple channels independently', async () => {
      const client = createMockWebSocket<ChannelMessage>();
      await client.connect('wss://example.com');

      const router = createChannelRouter(
        client,
        (msg) => msg.channel
      );

      const chatMessages: any[] = [];
      const notificationMessages: any[] = [];

      router.subscribe('chat', (msg) => chatMessages.push(msg.data));
      router.subscribe('notifications', (msg) => notificationMessages.push(msg.data));

      client.simulateMessage({ channel: 'chat', data: 'Chat message' });
      client.simulateMessage({ channel: 'notifications', data: 'Notification' });
      client.simulateMessage({ channel: 'chat', data: 'Another chat' });

      expect(chatMessages).toHaveLength(2);
      expect(notificationMessages).toHaveLength(1);
      expect(chatMessages[0].data).toBe('Chat message');
      expect(notificationMessages[0].data).toBe('Notification');
    });

    it('should not route to unsubscribed channels', async () => {
      const client = createMockWebSocket<ChannelMessage>();
      await client.connect('wss://example.com');

      const router = createChannelRouter(
        client,
        (msg) => msg.channel
      );

      const chatMessages: any[] = [];
      router.subscribe('chat', (msg) => chatMessages.push(msg.data));

      // Send to different channel
      client.simulateMessage({ channel: 'other', data: 'Other message' });

      expect(chatMessages).toHaveLength(0);
    });

    it('should ignore messages with no channel', async () => {
      const client = createMockWebSocket<ChannelMessage>();
      await client.connect('wss://example.com');

      const router = createChannelRouter(
        client,
        (msg) => msg.channel || null
      );

      const chatMessages: any[] = [];
      router.subscribe('chat', (msg) => chatMessages.push(msg.data));

      // Send message without channel
      client.simulateMessage({ channel: '', data: 'No channel' } as any);

      expect(chatMessages).toHaveLength(0);
    });
  });

  describe('Multiple Listeners Per Channel', () => {
    it('should support multiple listeners on same channel', async () => {
      const client = createMockWebSocket<ChannelMessage>();
      await client.connect('wss://example.com');

      const router = createChannelRouter(
        client,
        (msg) => msg.channel
      );

      const listener1Messages: any[] = [];
      const listener2Messages: any[] = [];

      router.subscribe('chat', (msg) => listener1Messages.push(msg.data));
      router.subscribe('chat', (msg) => listener2Messages.push(msg.data));

      client.simulateMessage({ channel: 'chat', data: 'Message' });

      expect(listener1Messages).toHaveLength(1);
      expect(listener2Messages).toHaveLength(1);
      expect(listener1Messages[0].data).toBe('Message');
      expect(listener2Messages[0].data).toBe('Message');
    });

    it('should notify all listeners in order', async () => {
      const client = createMockWebSocket<ChannelMessage>();
      await client.connect('wss://example.com');

      const router = createChannelRouter(
        client,
        (msg) => msg.channel
      );

      const order: number[] = [];

      router.subscribe('chat', () => order.push(1));
      router.subscribe('chat', () => order.push(2));
      router.subscribe('chat', () => order.push(3));

      client.simulateMessage({ channel: 'chat', data: 'Test' });

      expect(order).toEqual([1, 2, 3]);
    });
  });

  describe('Unsubscribe Functionality', () => {
    it('should stop receiving messages after unsubscribe', async () => {
      const client = createMockWebSocket<ChannelMessage>();
      await client.connect('wss://example.com');

      const router = createChannelRouter(
        client,
        (msg) => msg.channel
      );

      const messages: any[] = [];
      const unsubscribe = router.subscribe('chat', (msg) => messages.push(msg.data));

      client.simulateMessage({ channel: 'chat', data: 'First' });
      unsubscribe();
      client.simulateMessage({ channel: 'chat', data: 'Second' });

      expect(messages).toHaveLength(1);
      expect(messages[0].data).toBe('First');
    });

    it('should only unsubscribe specific listener', async () => {
      const client = createMockWebSocket<ChannelMessage>();
      await client.connect('wss://example.com');

      const router = createChannelRouter(
        client,
        (msg) => msg.channel
      );

      const listener1Messages: any[] = [];
      const listener2Messages: any[] = [];

      const unsub1 = router.subscribe('chat', (msg) => listener1Messages.push(msg.data));
      router.subscribe('chat', (msg) => listener2Messages.push(msg.data));

      client.simulateMessage({ channel: 'chat', data: 'First' });

      unsub1(); // Unsubscribe listener1

      client.simulateMessage({ channel: 'chat', data: 'Second' });

      expect(listener1Messages).toHaveLength(1); // Only received first
      expect(listener2Messages).toHaveLength(2); // Received both
    });

    it('should unsubscribe all listeners from channel', async () => {
      const client = createMockWebSocket<ChannelMessage>();
      await client.connect('wss://example.com');

      const router = createChannelRouter(
        client,
        (msg) => msg.channel
      );

      const listener1 = vi.fn();
      const listener2 = vi.fn();

      router.subscribe('chat', listener1);
      router.subscribe('chat', listener2);

      client.simulateMessage({ channel: 'chat', data: 'First' });

      router.unsubscribe('chat');

      client.simulateMessage({ channel: 'chat', data: 'Second' });

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it('should handle unsubscribe of non-existent channel', () => {
      const client = createMockWebSocket<ChannelMessage>();
      const router = createChannelRouter(
        client,
        (msg) => msg.channel
      );

      // Should not throw
      expect(() => router.unsubscribe('nonexistent')).not.toThrow();
    });

    it('should handle double unsubscribe', async () => {
      const client = createMockWebSocket<ChannelMessage>();
      await client.connect('wss://example.com');

      const router = createChannelRouter(
        client,
        (msg) => msg.channel
      );

      const messages: any[] = [];
      const unsubscribe = router.subscribe('chat', (msg) => messages.push(msg.data));

      unsubscribe();
      unsubscribe(); // Second call should be safe

      client.simulateMessage({ channel: 'chat', data: 'Test' });

      expect(messages).toHaveLength(0);
    });
  });

  describe('Channel Management', () => {
    it('should track active channels', async () => {
      const client = createMockWebSocket<ChannelMessage>();
      await client.connect('wss://example.com');

      const router = createChannelRouter(
        client,
        (msg) => msg.channel
      );

      expect(router.getChannels()).toEqual([]);

      router.subscribe('chat', () => {});
      expect(router.getChannels()).toContain('chat');

      router.subscribe('notifications', () => {});
      expect(router.getChannels()).toHaveLength(2);
      expect(router.getChannels()).toContain('notifications');
    });

    it('should remove channel when last listener unsubscribes', async () => {
      const client = createMockWebSocket<ChannelMessage>();
      await client.connect('wss://example.com');

      const router = createChannelRouter(
        client,
        (msg) => msg.channel
      );

      const unsub1 = router.subscribe('chat', () => {});
      const unsub2 = router.subscribe('chat', () => {});

      expect(router.getChannels()).toContain('chat');

      unsub1();
      expect(router.getChannels()).toContain('chat'); // Still has listener2

      unsub2();
      expect(router.getChannels()).not.toContain('chat'); // All unsubscribed
    });

    it('should get listener count for channel', async () => {
      const client = createMockWebSocket<ChannelMessage>();
      await client.connect('wss://example.com');

      const router = createChannelRouter(
        client,
        (msg) => msg.channel
      );

      expect(router.getListenerCount('chat')).toBe(0);

      router.subscribe('chat', () => {});
      expect(router.getListenerCount('chat')).toBe(1);

      router.subscribe('chat', () => {});
      expect(router.getListenerCount('chat')).toBe(2);

      router.unsubscribe('chat');
      expect(router.getListenerCount('chat')).toBe(0);
    });

    it('should clear all channel subscriptions', async () => {
      const client = createMockWebSocket<ChannelMessage>();
      await client.connect('wss://example.com');

      const router = createChannelRouter(
        client,
        (msg) => msg.channel
      );

      router.subscribe('chat', () => {});
      router.subscribe('notifications', () => {});
      router.subscribe('updates', () => {});

      expect(router.getChannels()).toHaveLength(3);

      router.clear();

      expect(router.getChannels()).toHaveLength(0);
      expect(router.getListenerCount('chat')).toBe(0);
    });
  });

  describe('Channel Extractor Function', () => {
    it('should support different message structures', async () => {
      interface CustomMessage {
        topic: string;
        payload: any;
      }

      const client = createMockWebSocket<CustomMessage>();
      await client.connect('wss://example.com');

      const router = createChannelRouter(
        client,
        (msg) => msg.topic // Using 'topic' instead of 'channel'
      );

      const messages: any[] = [];
      router.subscribe('users', (msg) => messages.push(msg.data));

      client.simulateMessage({ topic: 'users', payload: 'User data' });

      expect(messages).toHaveLength(1);
      expect(messages[0].payload).toBe('User data');
    });

    it('should support nested channel extraction', async () => {
      interface NestedMessage {
        meta: {
          channel: string;
        };
        content: any;
      }

      const client = createMockWebSocket<NestedMessage>();
      await client.connect('wss://example.com');

      const router = createChannelRouter(
        client,
        (msg) => msg.meta?.channel || null
      );

      const messages: any[] = [];
      router.subscribe('deep', (msg) => messages.push(msg.data));

      client.simulateMessage({ meta: { channel: 'deep' }, content: 'Nested' });

      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('Nested');
    });

    it('should handle null channel gracefully', async () => {
      const client = createMockWebSocket<any>();
      await client.connect('wss://example.com');

      const router = createChannelRouter(
        client,
        (msg) => msg.channel || null
      );

      const messages: any[] = [];
      router.subscribe('chat', (msg) => messages.push(msg.data));

      client.simulateMessage({ noChannel: true, data: 'Test' });

      expect(messages).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should catch and log listener errors', async () => {
      const client = createMockWebSocket<ChannelMessage>();
      await client.connect('wss://example.com');

      const router = createChannelRouter(
        client,
        (msg) => msg.channel
      );

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const goodListener = vi.fn();

      // Add failing listener
      router.subscribe('chat', () => {
        throw new Error('Listener error');
      });

      // Add good listener
      router.subscribe('chat', goodListener);

      client.simulateMessage({ channel: 'chat', data: 'Test' });

      // Good listener should still be called
      expect(goodListener).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('Client Subscription Lifecycle', () => {
    it('should only subscribe to client when first channel subscribed', async () => {
      const client = createMockWebSocket<ChannelMessage>();
      await client.connect('wss://example.com');

      const router = createChannelRouter(
        client,
        (msg) => msg.channel
      );

      // Router hasn't subscribed yet
      client.simulateMessage({ channel: 'chat', data: 'Before' });

      const messages: any[] = [];
      router.subscribe('chat', (msg) => messages.push(msg.data));

      // Now router is subscribed
      client.simulateMessage({ channel: 'chat', data: 'After' });

      expect(messages).toHaveLength(1);
      expect(messages[0].data).toBe('After');
    });

    it('should unsubscribe from client when all channels removed', async () => {
      const client = createMockWebSocket<ChannelMessage>();
      await client.connect('wss://example.com');

      const router = createChannelRouter(
        client,
        (msg) => msg.channel
      );

      const unsub = router.subscribe('chat', () => {});

      // Router subscribed
      expect(router.getChannels()).toHaveLength(1);

      unsub();

      // Router unsubscribed from client
      expect(router.getChannels()).toHaveLength(0);

      // Further messages shouldn't route
      const messages: any[] = [];
      router.subscribe('chat', (msg) => messages.push(msg.data));

      client.simulateMessage({ channel: 'chat', data: 'Test' });

      expect(messages).toHaveLength(1); // Should work again after resubscribe
    });
  });

  describe('Type Safety', () => {
    it('should support generic message types', async () => {
      interface TypedChannelMessage {
        channel: 'chat' | 'notifications' | 'updates';
        timestamp: number;
        payload: {
          user: string;
          content: string;
        };
      }

      const client = createMockWebSocket<TypedChannelMessage>();
      await client.connect('wss://example.com');

      const router = createChannelRouter(
        client,
        (msg) => msg.channel
      );

      const messages: WebSocketMessage<TypedChannelMessage>[] = [];
      router.subscribe('chat', (msg) => messages.push(msg));

      client.simulateMessage({
        channel: 'chat',
        timestamp: Date.now(),
        payload: { user: 'Alice', content: 'Hello' }
      });

      expect(messages[0].data.payload.user).toBe('Alice');
      expect(messages[0].data.payload.content).toBe('Hello');
    });
  });
});

describe('Channel WebSocket Client', () => {
  describe('Integration with Router', () => {
    it('should wrap client with router', async () => {
      const baseClient = createMockWebSocket<ChannelMessage>();
      const channelClient = createChannelWebSocket(
        baseClient,
        (msg) => msg.channel
      );

      await channelClient.connect('wss://example.com');

      const messages: any[] = [];
      channelClient.router.subscribe('chat', (msg) => messages.push(msg.data));

      baseClient.simulateMessage({ channel: 'chat', data: 'Test' });

      expect(messages).toHaveLength(1);
      expect(messages[0].data).toBe('Test');
    });

    it('should preserve all client methods', async () => {
      const baseClient = createMockWebSocket<ChannelMessage>();
      const channelClient = createChannelWebSocket(
        baseClient,
        (msg) => msg.channel
      );

      await channelClient.connect('wss://example.com', ['proto1']);

      expect(channelClient.state.status).toBe('connected');
      expect(channelClient.state.protocols).toEqual(['proto1']);

      await channelClient.send({ channel: 'chat', data: 'Message' });

      expect(baseClient.sentMessages).toHaveLength(1);

      await channelClient.disconnect(1000, 'Done');

      expect(channelClient.state.status).toBe('disconnected');
    });

    it('should provide access to router', async () => {
      const baseClient = createMockWebSocket<ChannelMessage>();
      const channelClient = createChannelWebSocket(
        baseClient,
        (msg) => msg.channel
      );

      expect(channelClient.router).toBeDefined();
      expect(typeof channelClient.router.subscribe).toBe('function');
      expect(typeof channelClient.router.unsubscribe).toBe('function');
      expect(typeof channelClient.router.getChannels).toBe('function');
    });
  });

  describe('Complete Workflow', () => {
    it('should handle complete send/receive workflow with channels', async () => {
      const baseClient = createMockWebSocket<ChannelMessage>();
      const channelClient = createChannelWebSocket(
        baseClient,
        (msg) => msg.channel
      );

      // Connect
      await channelClient.connect('wss://example.com');

      // Subscribe to channels
      const chatMessages: any[] = [];
      const notifMessages: any[] = [];

      channelClient.router.subscribe('chat', (msg) => chatMessages.push(msg.data));
      channelClient.router.subscribe('notifications', (msg) => notifMessages.push(msg.data));

      // Send messages
      await channelClient.send({ channel: 'chat', data: 'Hello' });
      await channelClient.send({ channel: 'notifications', data: 'Alert' });

      expect(baseClient.sentMessages).toHaveLength(2);

      // Receive messages
      baseClient.simulateMessage({ channel: 'chat', data: 'Reply' });
      baseClient.simulateMessage({ channel: 'notifications', data: 'Update' });

      expect(chatMessages).toHaveLength(1);
      expect(notifMessages).toHaveLength(1);
      expect(chatMessages[0].data).toBe('Reply');
      expect(notifMessages[0].data).toBe('Update');

      // Disconnect
      await channelClient.disconnect();

      expect(channelClient.state.status).toBe('disconnected');
    });
  });
});
