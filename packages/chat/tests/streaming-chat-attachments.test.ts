/**
 * StreamingChat Attachment Tests
 *
 * Tests for file attachment functionality in streaming chat
 */

import { describe, it, expect, vi } from 'vitest';
import { createStore } from '@composable-svelte/core';
// Import directly from source files to avoid pulling in component dependencies
import { streamingChatReducer } from '../src/lib/streaming-chat/reducer';
import {
	createInitialStreamingChatState,
	type StreamingChatDependencies,
	type MessageAttachment
} from '../src/lib/streaming-chat/types';
import {
	detectFileType,
	formatFileSize,
	validateFileSize,
	validateFileType,
	getFileExtension,
	getFileTypeIcon
} from '../src/lib/streaming-chat/utils';

describe('StreamingChat Attachments', () => {
	const mockStreamMessage = vi.fn((message, onChunk, onComplete, onError) => {
		// Simulate immediate completion for testing
		setTimeout(() => onComplete(), 0);
		return new AbortController();
	});

	const dependencies: StreamingChatDependencies = {
		streamMessage: mockStreamMessage,
		generateId: () => 'test-id-' + Math.random(),
		getTimestamp: () => 1234567890
	};

	const createMockAttachment = (overrides?: Partial<MessageAttachment>): MessageAttachment => ({
		id: 'attachment-1',
		type: 'image',
		filename: 'test.jpg',
		url: 'blob:test',
		size: 1024,
		mimeType: 'image/jpeg',
		...overrides
	});

	describe('Attachment Actions', () => {
		it('handles addAttachment action', () => {
			const store = createStore({
				initialState: createInitialStreamingChatState(),
				reducer: streamingChatReducer,
				dependencies
			});

			const attachment = createMockAttachment();
			store.dispatch({ type: 'addAttachment', attachment });

			expect(store.state.pendingAttachments).toHaveLength(1);
			expect(store.state.pendingAttachments[0]).toEqual(attachment);
		});

		it('handles multiple addAttachment actions', () => {
			const store = createStore({
				initialState: createInitialStreamingChatState(),
				reducer: streamingChatReducer,
				dependencies
			});

			const attachment1 = createMockAttachment({ id: 'att-1', filename: 'file1.jpg' });
			const attachment2 = createMockAttachment({ id: 'att-2', filename: 'file2.png' });

			store.dispatch({ type: 'addAttachment', attachment: attachment1 });
			store.dispatch({ type: 'addAttachment', attachment: attachment2 });

			expect(store.state.pendingAttachments).toHaveLength(2);
			expect(store.state.pendingAttachments[0].filename).toBe('file1.jpg');
			expect(store.state.pendingAttachments[1].filename).toBe('file2.png');
		});

		it('handles removeAttachment action', () => {
			const store = createStore({
				initialState: createInitialStreamingChatState(),
				reducer: streamingChatReducer,
				dependencies
			});

			const attachment1 = createMockAttachment({ id: 'att-1' });
			const attachment2 = createMockAttachment({ id: 'att-2' });

			store.dispatch({ type: 'addAttachment', attachment: attachment1 });
			store.dispatch({ type: 'addAttachment', attachment: attachment2 });
			store.dispatch({ type: 'removeAttachment', attachmentId: 'att-1' });

			expect(store.state.pendingAttachments).toHaveLength(1);
			expect(store.state.pendingAttachments[0].id).toBe('att-2');
		});

		it('handles clearAttachments action', () => {
			const store = createStore({
				initialState: createInitialStreamingChatState(),
				reducer: streamingChatReducer,
				dependencies
			});

			const attachment1 = createMockAttachment({ id: 'att-1' });
			const attachment2 = createMockAttachment({ id: 'att-2' });

			store.dispatch({ type: 'addAttachment', attachment: attachment1 });
			store.dispatch({ type: 'addAttachment', attachment: attachment2 });
			store.dispatch({ type: 'clearAttachments' });

			expect(store.state.pendingAttachments).toHaveLength(0);
		});
	});

	describe('SendMessage with Attachments', () => {
		it('includes attachments when sending message', async () => {
			const store = createStore({
				initialState: createInitialStreamingChatState(),
				reducer: streamingChatReducer,
				dependencies
			});

			const attachment = createMockAttachment();
			store.dispatch({ type: 'addAttachment', attachment });
			store.dispatch({ type: 'sendMessage', message: 'Hello with attachment' });

			// Check message was created with attachment
			expect(store.state.messages).toHaveLength(1);
			expect(store.state.messages[0].content).toBe('Hello with attachment');
			expect(store.state.messages[0].attachments).toHaveLength(1);
			expect(store.state.messages[0].attachments![0]).toEqual(attachment);
		});

		it('clears pending attachments after sending', () => {
			const store = createStore({
				initialState: createInitialStreamingChatState(),
				reducer: streamingChatReducer,
				dependencies
			});

			const attachment = createMockAttachment();
			store.dispatch({ type: 'addAttachment', attachment });
			store.dispatch({ type: 'sendMessage', message: 'Hello' });

			// Pending attachments should be cleared
			expect(store.state.pendingAttachments).toHaveLength(0);
		});

		it('does not include attachments field when no attachments', () => {
			const store = createStore({
				initialState: createInitialStreamingChatState(),
				reducer: streamingChatReducer,
				dependencies
			});

			store.dispatch({ type: 'sendMessage', message: 'Hello without attachment' });

			expect(store.state.messages).toHaveLength(1);
			expect(store.state.messages[0].attachments).toBeUndefined();
		});

		it('handles multiple attachments in one message', () => {
			const store = createStore({
				initialState: createInitialStreamingChatState(),
				reducer: streamingChatReducer,
				dependencies
			});

			const attachment1 = createMockAttachment({ id: 'att-1', filename: 'file1.jpg' });
			const attachment2 = createMockAttachment({ id: 'att-2', filename: 'file2.png' });
			const attachment3 = createMockAttachment({ id: 'att-3', filename: 'file3.pdf', type: 'pdf' });

			store.dispatch({ type: 'addAttachment', attachment: attachment1 });
			store.dispatch({ type: 'addAttachment', attachment: attachment2 });
			store.dispatch({ type: 'addAttachment', attachment: attachment3 });
			store.dispatch({ type: 'sendMessage', message: 'Multiple files' });

			expect(store.state.messages[0].attachments).toHaveLength(3);
			expect(store.state.pendingAttachments).toHaveLength(0);
		});
	});

	describe('Utility Functions', () => {
		describe('detectFileType', () => {
			it('detects image types', () => {
				expect(detectFileType('image/jpeg')).toBe('image');
				expect(detectFileType('image/png')).toBe('image');
				expect(detectFileType('image/gif')).toBe('image');
			});

			it('detects video types', () => {
				expect(detectFileType('video/mp4')).toBe('video');
				expect(detectFileType('video/webm')).toBe('video');
			});

			it('detects audio types', () => {
				expect(detectFileType('audio/mpeg')).toBe('audio');
				expect(detectFileType('audio/wav')).toBe('audio');
			});

			it('detects PDF', () => {
				expect(detectFileType('application/pdf')).toBe('pdf');
			});

			it('detects document types', () => {
				expect(detectFileType('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('document');
				expect(detectFileType('application/vnd.ms-excel')).toBe('document');
			});

			it('defaults to file for unknown types', () => {
				expect(detectFileType('application/octet-stream')).toBe('file');
				expect(detectFileType('text/plain')).toBe('file');
			});
		});

		describe('formatFileSize', () => {
			it('formats bytes', () => {
				expect(formatFileSize(0)).toBe('0 Bytes');
				expect(formatFileSize(500)).toBe('500 Bytes');
			});

			it('formats kilobytes', () => {
				expect(formatFileSize(1024)).toBe('1 KB');
				expect(formatFileSize(1536)).toBe('1.5 KB');
			});

			it('formats megabytes', () => {
				expect(formatFileSize(1024 * 1024)).toBe('1 MB');
				expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1.5 MB');
			});

			it('formats gigabytes', () => {
				expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB');
			});
		});

		describe('validateFileSize', () => {
			it('validates file size within limit', () => {
				const file = new File(['x'.repeat(1024)], 'test.txt', { type: 'text/plain' });
				expect(validateFileSize(file, 1)).toBe(true); // 1 MB limit
			});

			it('rejects file size over limit', () => {
				const file = new File(['x'.repeat(2 * 1024 * 1024)], 'large.txt', { type: 'text/plain' });
				expect(validateFileSize(file, 1)).toBe(false); // 1 MB limit
			});
		});

		describe('validateFileType', () => {
			it('accepts matching MIME type', () => {
				const file = new File([''], 'test.jpg', { type: 'image/jpeg' });
				expect(validateFileType(file, ['image/jpeg'])).toBe(true);
			});

			it('accepts wildcard MIME type', () => {
				const file = new File([''], 'test.jpg', { type: 'image/jpeg' });
				expect(validateFileType(file, ['image/*'])).toBe(true);
			});

			it('accepts file extension', () => {
				const file = new File([''], 'test.pdf', { type: 'application/pdf' });
				expect(validateFileType(file, ['.pdf'])).toBe(true);
			});

			it('rejects non-matching type', () => {
				const file = new File([''], 'test.jpg', { type: 'image/jpeg' });
				expect(validateFileType(file, ['video/*'])).toBe(false);
			});

			it('accepts all types when array is empty', () => {
				const file = new File([''], 'test.txt', { type: 'text/plain' });
				expect(validateFileType(file, [])).toBe(true);
			});
		});

		describe('getFileExtension', () => {
			it('extracts extension', () => {
				expect(getFileExtension('test.jpg')).toBe('jpg');
				expect(getFileExtension('document.pdf')).toBe('pdf');
				expect(getFileExtension('archive.tar.gz')).toBe('gz');
			});

			it('handles files without extension', () => {
				expect(getFileExtension('README')).toBe('');
			});

			it('normalizes to lowercase', () => {
				expect(getFileExtension('Photo.JPG')).toBe('jpg');
			});
		});

		describe('getFileTypeIcon', () => {
			it('returns correct icons', () => {
				expect(getFileTypeIcon('image')).toBe('🖼️');
				expect(getFileTypeIcon('video')).toBe('🎥');
				expect(getFileTypeIcon('audio')).toBe('🎵');
				expect(getFileTypeIcon('pdf')).toBe('📄');
				expect(getFileTypeIcon('document')).toBe('📝');
				expect(getFileTypeIcon('file')).toBe('📎');
			});
		});
	});
});
