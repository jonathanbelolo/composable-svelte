/**
 * Tests for WebSocket Heartbeat (Ping/Pong)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHeartbeat } from '../../src/websocket/heartbeat.js';
import { createMockWebSocket } from '../../src/websocket/testing/mock-client.js';
import type { HeartbeatConfig } from '../../src/websocket/types.js';

describe('WebSocket Heartbeat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Basic Functionality', () => {
    it('should start in stopped state', () => {
      const client = createMockWebSocket();
      const config: HeartbeatConfig = {
        enabled: true,
        interval: 30000,
        timeout: 5000
      };
      const heartbeat = createHeartbeat(client, config);

      expect(heartbeat.isRunning).toBe(false);
    });

    it('should start heartbeat monitoring', () => {
      const client = createMockWebSocket();
      client.connect('wss://example.com');
      vi.advanceTimersByTime(10); // Let connection complete

      const config: HeartbeatConfig = {
        enabled: true,
        interval: 30000,
        timeout: 5000
      };
      const heartbeat = createHeartbeat(client, config);

      heartbeat.start();

      expect(heartbeat.isRunning).toBe(true);

      heartbeat.stop();
    });

    it('should stop heartbeat monitoring', () => {
      const client = createMockWebSocket();
      client.connect('wss://example.com');
      vi.advanceTimersByTime(10); // Let connection complete

      const config: HeartbeatConfig = {
        enabled: true,
        interval: 30000,
        timeout: 5000
      };
      const heartbeat = createHeartbeat(client, config);

      heartbeat.start();
      heartbeat.stop();

      expect(heartbeat.isRunning).toBe(false);
    });

    it('should not start if already running', () => {
      const client = createMockWebSocket();
      client.connect('wss://example.com');
      vi.advanceTimersByTime(10); // Let connection complete

      const config: HeartbeatConfig = {
        enabled: true,
        interval: 30000,
        timeout: 5000
      };
      const heartbeat = createHeartbeat(client, config);

      heartbeat.start();
      const firstStart = heartbeat.isRunning;
      heartbeat.start(); // Second start should be no-op

      expect(firstStart).toBe(true);
      expect(heartbeat.isRunning).toBe(true);

      heartbeat.stop();
    });

    it('should not start if disabled', () => {
      const client = createMockWebSocket();
      client.connect('wss://example.com');
      vi.advanceTimersByTime(10); // Let connection complete

      const config: HeartbeatConfig = {
        enabled: false,
        interval: 30000,
        timeout: 5000
      };
      const heartbeat = createHeartbeat(client, config);

      heartbeat.start();

      expect(heartbeat.isRunning).toBe(false);
    });
  });

  describe('Ping Messages', () => {
    it('should send default ping message at intervals', () => {
      const client = createMockWebSocket();
      client.connect('wss://example.com');
      vi.advanceTimersByTime(10); // Let connection complete

      const config: HeartbeatConfig = {
        enabled: true,
        interval: 1000,
        timeout: 500
      };
      const heartbeat = createHeartbeat(client, config);

      heartbeat.start();

      // Subscribe to simulate pong responses
      client.subscribe((msg) => {
        if (msg.data === 'PING') {
          client.simulateMessage('PONG');
        }
      });

      // Advance to first interval
      vi.advanceTimersByTime(1000);

      expect(client.sentMessages).toContainEqual('PING');

      heartbeat.stop();
    });

    it('should send custom ping message', () => {
      const client = createMockWebSocket();
      client.connect('wss://example.com');
      vi.advanceTimersByTime(10); // Let connection complete

      const config: HeartbeatConfig = {
        enabled: true,
        interval: 1000,
        timeout: 500,
        pingMessage: 'HEARTBEAT_PING',
        pongMessage: 'HEARTBEAT_PONG'
      };
      const heartbeat = createHeartbeat(client, config);

      heartbeat.start();

      // Subscribe to simulate pong responses
      client.subscribe((msg) => {
        if (msg.data === 'HEARTBEAT_PING') {
          client.simulateMessage('HEARTBEAT_PONG');
        }
      });

      // Advance to first interval
      vi.advanceTimersByTime(1000);

      expect(client.sentMessages).toContainEqual('HEARTBEAT_PING');

      heartbeat.stop();
    });

    it('should send multiple ping messages at configured intervals', () => {
      const client = createMockWebSocket();
      client.connect('wss://example.com');
      vi.advanceTimersByTime(10); // Let connection complete

      const config: HeartbeatConfig = {
        enabled: true,
        interval: 1000,
        timeout: 500
      };
      const heartbeat = createHeartbeat(client, config);

      heartbeat.start();

      // Advance through multiple intervals with pong responses
      vi.advanceTimersByTime(1000); // First ping
      client.simulateMessage('PONG');

      vi.advanceTimersByTime(1000); // Second ping
      client.simulateMessage('PONG');

      vi.advanceTimersByTime(1000); // Third ping
      client.simulateMessage('PONG');

      const pingCount = client.sentMessages.filter(msg => msg === 'PING').length;
      expect(pingCount).toBe(3);

      heartbeat.stop();
    });
  });

  describe('Pong Detection', () => {
    it('should recognize pong response', () => {
      const client = createMockWebSocket();
      client.connect('wss://example.com');
      vi.advanceTimersByTime(10); // Let connection complete

      const config: HeartbeatConfig = {
        enabled: true,
        interval: 1000,
        timeout: 500
      };
      const heartbeat = createHeartbeat(client, config);

      heartbeat.start();

      // Advance to first interval (ping sent)
      vi.advanceTimersByTime(1000);

      // Simulate pong response
      client.simulateMessage('PONG');

      // Should continue to second interval without disconnecting
      vi.advanceTimersByTime(1000);

      expect(client.state.status).toBe('connected');
      expect(heartbeat.isRunning).toBe(true);

      heartbeat.stop();
    });

    it('should recognize custom pong response', () => {
      const client = createMockWebSocket();
      client.connect('wss://example.com');
      vi.advanceTimersByTime(10); // Let connection complete

      const config: HeartbeatConfig = {
        enabled: true,
        interval: 1000,
        timeout: 500,
        pingMessage: 'HEARTBEAT_PING',
        pongMessage: 'HEARTBEAT_PONG'
      };
      const heartbeat = createHeartbeat(client, config);

      heartbeat.start();

      // Advance to first interval (ping sent)
      vi.advanceTimersByTime(1000);

      // Simulate pong response
      client.simulateMessage('HEARTBEAT_PONG');

      // Should continue to second interval without disconnecting
      vi.advanceTimersByTime(1000);

      expect(client.state.status).toBe('connected');
      expect(heartbeat.isRunning).toBe(true);

      heartbeat.stop();
    });
  });

  describe('Timeout Behavior', () => {
    it('should disconnect on pong timeout', () => {
      const client = createMockWebSocket();
      client.connect('wss://example.com');
      vi.advanceTimersByTime(10); // Let connection complete

      const config: HeartbeatConfig = {
        enabled: true,
        interval: 1000,
        timeout: 500
      };
      const heartbeat = createHeartbeat(client, config);

      heartbeat.start();

      // Don't respond to ping (no pong)
      vi.advanceTimersByTime(1000); // Ping sent
      vi.advanceTimersByTime(500);  // Timeout expires

      expect(client.state.status).toBe('disconnected');
      expect(heartbeat.isRunning).toBe(false);
    });

    it('should disconnect if second ping sent without pong from first', () => {
      const client = createMockWebSocket();
      client.connect('wss://example.com');
      vi.advanceTimersByTime(10); // Let connection complete

      const config: HeartbeatConfig = {
        enabled: true,
        interval: 1000,
        timeout: 500
      };
      const heartbeat = createHeartbeat(client, config);

      heartbeat.start();

      // First ping - no pong response
      vi.advanceTimersByTime(1000);

      // Second interval - should disconnect before sending second ping
      vi.advanceTimersByTime(1000);

      expect(client.state.status).toBe('disconnected');
      expect(heartbeat.isRunning).toBe(false);
    });

    it('should clear timeout when pong received', () => {
      const client = createMockWebSocket();
      client.connect('wss://example.com');
      vi.advanceTimersByTime(10); // Let connection complete

      const config: HeartbeatConfig = {
        enabled: true,
        interval: 1000,
        timeout: 2000 // Long timeout
      };
      const heartbeat = createHeartbeat(client, config);

      heartbeat.start();

      // First ping
      vi.advanceTimersByTime(1000);

      // Pong received after 100ms
      vi.advanceTimersByTime(100);
      client.simulateMessage('PONG');

      // Should continue normally - second ping
      vi.advanceTimersByTime(900);

      // Pong received after 100ms
      vi.advanceTimersByTime(100);
      client.simulateMessage('PONG');

      expect(client.state.status).toBe('connected');
      expect(heartbeat.isRunning).toBe(true);

      heartbeat.stop();
    });
  });

  describe('Stop Cleanup', () => {
    it('should clear interval on stop', () => {
      const client = createMockWebSocket();
      client.connect('wss://example.com');
      vi.advanceTimersByTime(10); // Let connection complete

      const config: HeartbeatConfig = {
        enabled: true,
        interval: 1000,
        timeout: 500
      };
      const heartbeat = createHeartbeat(client, config);

      heartbeat.start();
      const initialMessageCount = client.sentMessages.length;

      heartbeat.stop();

      // Advance time - should not send more pings
      vi.advanceTimersByTime(5000);

      expect(client.sentMessages.length).toBe(initialMessageCount);
    });

    it('should clear timeout on stop', () => {
      const client = createMockWebSocket();
      client.connect('wss://example.com');
      vi.advanceTimersByTime(10); // Let connection complete

      const config: HeartbeatConfig = {
        enabled: true,
        interval: 1000,
        timeout: 500
      };
      const heartbeat = createHeartbeat(client, config);

      heartbeat.start();

      // Send ping without pong
      vi.advanceTimersByTime(1000);

      // Stop before timeout
      heartbeat.stop();

      // Advance past timeout - should not disconnect
      vi.advanceTimersByTime(1000);

      expect(client.state.status).toBe('connected');
    });
  });

  describe('Error Handling', () => {
    it('should handle send errors gracefully', async () => {
      const client = createMockWebSocket();

      // Don't connect - send will fail
      const config: HeartbeatConfig = {
        enabled: true,
        interval: 1000,
        timeout: 500
      };
      const heartbeat = createHeartbeat(client, config);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      heartbeat.start();

      vi.advanceTimersByTime(1000);

      // Wait for promise rejection to be handled
      await Promise.resolve();

      // Should stop after send error
      expect(heartbeat.isRunning).toBe(false);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('Integration', () => {
    it('should integrate with connection lifecycle', () => {
      const client = createMockWebSocket();

      const config: HeartbeatConfig = {
        enabled: true,
        interval: 1000,
        timeout: 500
      };
      const heartbeat = createHeartbeat(client, config);

      // Subscribe to simulate pong responses
      client.subscribe((msg) => {
        if (msg.data === 'PING') {
          client.simulateMessage('PONG');
        }
      });

      // Start heartbeat on connection
      client.subscribeToEvents((event) => {
        if (event.type === 'connected') {
          heartbeat.start();
        } else if (event.type === 'disconnected') {
          heartbeat.stop();
        }
      });

      // Connect
      client.connect('wss://example.com');
      vi.advanceTimersByTime(10); // Let connection complete

      expect(heartbeat.isRunning).toBe(true);

      // Heartbeat should be working
      vi.advanceTimersByTime(1000);
      expect(client.sentMessages).toContainEqual('PING');

      // Disconnect
      client.disconnect();
      vi.advanceTimersByTime(10); // Let disconnection complete

      expect(heartbeat.isRunning).toBe(false);
    });

    it('should work with multiple reconnections', () => {
      const client = createMockWebSocket();

      const config: HeartbeatConfig = {
        enabled: true,
        interval: 1000,
        timeout: 500
      };
      const heartbeat = createHeartbeat(client, config);

      // Subscribe to simulate pong responses
      client.subscribe((msg) => {
        if (msg.data === 'PING') {
          client.simulateMessage('PONG');
        }
      });

      // Connect and start
      client.connect('wss://example.com');
      vi.advanceTimersByTime(10); // Let connection complete
      heartbeat.start();

      vi.advanceTimersByTime(1000);
      const firstPingCount = client.sentMessages.filter(msg => msg === 'PING').length;

      // Disconnect and reconnect
      client.disconnect();
      vi.advanceTimersByTime(10); // Let disconnection complete
      heartbeat.stop();

      client.reset(); // Clear state
      client.connect('wss://example.com');
      vi.advanceTimersByTime(10); // Let connection complete
      heartbeat.start();

      vi.advanceTimersByTime(1000);

      expect(heartbeat.isRunning).toBe(true);
      expect(client.sentMessages).toContainEqual('PING');
    });
  });

  describe('Edge Cases', () => {
    it('should handle late pong response', () => {
      const client = createMockWebSocket();
      client.connect('wss://example.com');
      vi.advanceTimersByTime(10); // Let connection complete

      const config: HeartbeatConfig = {
        enabled: true,
        interval: 1000,
        timeout: 2000
      };
      const heartbeat = createHeartbeat(client, config);

      heartbeat.start();

      // First ping sent
      vi.advanceTimersByTime(1000);

      // Wait most of interval but send pong before next interval check
      vi.advanceTimersByTime(800); // At 800ms after first ping, before next interval at 1000ms

      // Send pong now (late but before next interval check)
      client.simulateMessage('PONG');

      // Advance to next interval - should send second ping successfully
      vi.advanceTimersByTime(200);
      client.simulateMessage('PONG'); // Respond to second ping

      // Should still be connected since pong arrived before interval check
      expect(client.state.status).toBe('connected');
      expect(heartbeat.isRunning).toBe(true);

      heartbeat.stop();
    });

    it('should handle stop during timeout period', () => {
      const client = createMockWebSocket();
      client.connect('wss://example.com');
      vi.advanceTimersByTime(10); // Let connection complete

      const config: HeartbeatConfig = {
        enabled: true,
        interval: 1000,
        timeout: 2000
      };
      const heartbeat = createHeartbeat(client, config);

      heartbeat.start();

      // Send ping without pong
      vi.advanceTimersByTime(1000);

      // Stop during timeout period
      heartbeat.stop();

      // Advance past timeout
      vi.advanceTimersByTime(2000);

      // Should not have disconnected
      expect(client.state.status).toBe('connected');
    });

    it('should handle stop and restart', () => {
      const client = createMockWebSocket();
      client.connect('wss://example.com');
      vi.advanceTimersByTime(10); // Let connection complete

      const config: HeartbeatConfig = {
        enabled: true,
        interval: 1000,
        timeout: 500
      };
      const heartbeat = createHeartbeat(client, config);

      // Subscribe to simulate pong responses
      client.subscribe((msg) => {
        if (msg.data === 'PING') {
          client.simulateMessage('PONG');
        }
      });

      // First cycle
      heartbeat.start();
      vi.advanceTimersByTime(1000);
      heartbeat.stop();

      const firstPingCount = client.sentMessages.filter(msg => msg === 'PING').length;

      // Restart
      heartbeat.start();
      vi.advanceTimersByTime(1000);

      const secondPingCount = client.sentMessages.filter(msg => msg === 'PING').length;

      expect(secondPingCount).toBeGreaterThan(firstPingCount);
      expect(heartbeat.isRunning).toBe(true);
    });
  });
});
