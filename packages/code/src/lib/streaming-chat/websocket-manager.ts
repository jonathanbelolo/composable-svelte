/**
 * WebSocket State Machine
 *
 * Manages WebSocket connection lifecycle with:
 * - Exponential backoff reconnection
 * - Sequence number tracking
 * - Message queuing while disconnected
 * - Heartbeat monitoring
 */

import type { WebSocketConnectionState } from './collaborative-types.js';

/**
 * WebSocket message envelope with sequence number.
 */
export interface WebSocketMessage {
	/** Message type */
	type: string;
	/** Sequence number for ordering */
	seq: number;
	/** Message payload */
	payload: unknown;
	/** Message timestamp */
	timestamp: number;
}

/**
 * WebSocket configuration.
 */
export interface WebSocketConfig {
	/** WebSocket server URL */
	url: string;
	/** Initial reconnect delay (ms) */
	initialRetryDelay?: number;
	/** Maximum reconnect delay (ms) */
	maxRetryDelay?: number;
	/** Maximum reconnection attempts */
	maxRetries?: number;
	/** Heartbeat interval (ms) */
	heartbeatInterval?: number;
	/** Heartbeat timeout (ms) */
	heartbeatTimeout?: number;
}

/**
 * WebSocket manager for collaborative chat.
 *
 * Implements state machine with reconnection logic.
 */
export class WebSocketManager {
	private ws: WebSocket | null = null;
	private config: Required<WebSocketConfig>;
	private connectionState: WebSocketConnectionState = { status: 'disconnected' };
	private reconnectAttempts = 0;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	private heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
	private messageQueue: Array<unknown> = [];
	private lastSequenceNumber = 0;
	private lastHeartbeat = 0;
	private isIntentionallyClosed = false;

	// Callbacks
	private onMessageCallback: ((message: WebSocketMessage) => void) | null = null;
	private onStateChangeCallback: ((state: WebSocketConnectionState) => void) | null = null;

	constructor(config: WebSocketConfig) {
		this.config = {
			url: config.url,
			initialRetryDelay: config.initialRetryDelay ?? 1000,
			maxRetryDelay: config.maxRetryDelay ?? 30000,
			maxRetries: config.maxRetries ?? 10,
			heartbeatInterval: config.heartbeatInterval ?? 30000,
			heartbeatTimeout: config.heartbeatTimeout ?? 10000
		};
	}

	/**
	 * Connect to WebSocket server.
	 */
	connect(): void {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			console.warn('[WebSocketManager] Already connected');
			return;
		}

		this.isIntentionallyClosed = false;
		this.updateState({ status: 'connecting', attempt: this.reconnectAttempts + 1 });

		try {
			this.ws = new WebSocket(this.config.url);

			this.ws.onopen = () => {
				console.log('[WebSocketManager] Connected');
				this.reconnectAttempts = 0;
				this.updateState({ status: 'connected', connectedAt: Date.now() });
				this.startHeartbeat();
				this.flushMessageQueue();
			};

			this.ws.onmessage = (event) => {
				this.handleMessage(event.data);
			};

			this.ws.onerror = (error) => {
				console.error('[WebSocketManager] Error:', error);
			};

			this.ws.onclose = (event) => {
				console.log('[WebSocketManager] Closed', event.code, event.reason);
				this.stopHeartbeat();

				if (!this.isIntentionallyClosed) {
					// Unintentional disconnect - attempt reconnection
					this.reconnect();
				} else {
					// Intentional disconnect
					this.updateState({ status: 'disconnected', reason: 'User disconnected' });
				}
			};
		} catch (error) {
			console.error('[WebSocketManager] Connection failed:', error);
			this.updateState({
				status: 'failed',
				reason: error instanceof Error ? error.message : 'Connection failed',
				canRetry: this.reconnectAttempts < this.config.maxRetries
			});
			this.reconnect();
		}
	}

	/**
	 * Disconnect from WebSocket server.
	 */
	disconnect(): void {
		this.isIntentionallyClosed = true;
		this.stopHeartbeat();
		this.clearReconnectTimer();

		if (this.ws) {
			this.ws.close(1000, 'Client disconnect');
			this.ws = null;
		}

		this.updateState({ status: 'disconnected', reason: 'User disconnected' });
	}

	/**
	 * Send message to server.
	 */
	send(message: unknown): void {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			// Wrap message with sequence number
			const envelope: WebSocketMessage = {
				type: (message as any).type || 'message',
				seq: ++this.lastSequenceNumber,
				payload: message,
				timestamp: Date.now()
			};

			this.ws.send(JSON.stringify(envelope));
		} else {
			// Queue message for later
			console.warn('[WebSocketManager] Not connected, queuing message');
			this.messageQueue.push(message);
		}
	}

	/**
	 * Set message callback.
	 */
	onMessage(callback: (message: WebSocketMessage) => void): void {
		this.onMessageCallback = callback;
	}

	/**
	 * Set connection state change callback.
	 */
	onStateChange(callback: (state: WebSocketConnectionState) => void): void {
		this.onStateChangeCallback = callback;
		// Immediately call with current state
		callback(this.connectionState);
	}

	/**
	 * Get current connection state.
	 */
	getState(): WebSocketConnectionState {
		return this.connectionState;
	}

	/**
	 * Get last sequence number.
	 */
	getLastSequenceNumber(): number {
		return this.lastSequenceNumber;
	}

	/**
	 * Cleanup resources.
	 */
	cleanup(): void {
		this.disconnect();
		this.messageQueue = [];
		this.onMessageCallback = null;
		this.onStateChangeCallback = null;
	}

	// Private methods

	private handleMessage(data: string): void {
		try {
			const message: WebSocketMessage = JSON.parse(data);

			// Handle heartbeat
			if (message.type === 'heartbeat') {
				this.lastHeartbeat = Date.now();
				this.resetHeartbeatTimeout();
				return;
			}

			// Update sequence number
			if (message.seq > this.lastSequenceNumber) {
				this.lastSequenceNumber = message.seq;
			}

			// Call message callback
			if (this.onMessageCallback) {
				this.onMessageCallback(message);
			}
		} catch (error) {
			console.error('[WebSocketManager] Failed to parse message:', error);
		}
	}

	private reconnect(): void {
		if (this.isIntentionallyClosed) {
			return;
		}

		if (this.reconnectAttempts >= this.config.maxRetries) {
			console.error('[WebSocketManager] Max reconnection attempts reached');
			this.updateState({
				status: 'failed',
				reason: 'Max reconnection attempts reached',
				canRetry: false
			});
			return;
		}

		this.reconnectAttempts++;

		// Calculate exponential backoff delay
		const delay = Math.min(
			this.config.initialRetryDelay * Math.pow(2, this.reconnectAttempts - 1),
			this.config.maxRetryDelay
		);

		const nextRetryAt = Date.now() + delay;

		console.log(
			`[WebSocketManager] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.config.maxRetries})`
		);

		this.updateState({
			status: 'reconnecting',
			attempt: this.reconnectAttempts,
			nextRetryAt
		});

		this.reconnectTimer = setTimeout(() => {
			this.connect();
		}, delay);
	}

	private startHeartbeat(): void {
		this.stopHeartbeat();

		// Send heartbeat periodically
		this.heartbeatTimer = setInterval(() => {
			if (this.ws && this.ws.readyState === WebSocket.OPEN) {
				this.send({ type: 'heartbeat', timestamp: Date.now() });
			}
		}, this.config.heartbeatInterval);

		// Start timeout monitoring
		this.resetHeartbeatTimeout();
	}

	private resetHeartbeatTimeout(): void {
		if (this.heartbeatTimeoutTimer) {
			clearTimeout(this.heartbeatTimeoutTimer);
		}

		this.heartbeatTimeoutTimer = setTimeout(() => {
			console.error('[WebSocketManager] Heartbeat timeout - connection dead');
			// Force disconnect and reconnect
			if (this.ws) {
				this.ws.close();
			}
		}, this.config.heartbeatTimeout);
	}

	private stopHeartbeat(): void {
		if (this.heartbeatTimer) {
			clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = null;
		}

		if (this.heartbeatTimeoutTimer) {
			clearTimeout(this.heartbeatTimeoutTimer);
			this.heartbeatTimeoutTimer = null;
		}
	}

	private clearReconnectTimer(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
	}

	private flushMessageQueue(): void {
		if (this.messageQueue.length === 0) {
			return;
		}

		console.log(`[WebSocketManager] Flushing ${this.messageQueue.length} queued messages`);

		const queue = [...this.messageQueue];
		this.messageQueue = [];

		for (const message of queue) {
			this.send(message);
		}
	}

	private updateState(state: WebSocketConnectionState): void {
		this.connectionState = state;

		if (this.onStateChangeCallback) {
			this.onStateChangeCallback(state);
		}
	}
}

/**
 * Create WebSocket manager for collaborative chat.
 */
export function createWebSocketManager(config: WebSocketConfig): WebSocketManager {
	return new WebSocketManager(config);
}
