/**
 * Vitest Setup File
 *
 * Mock Node.js-only modules that can't run in browser test environment
 */

import { vi } from 'vitest';

// Mock pdfjs-dist to avoid fs/promises dependency in browser tests
vi.mock('pdfjs-dist', () => ({
	default: {
		GlobalWorkerOptions: {
			workerSrc: ''
		},
		getDocument: vi.fn(),
		version: '5.0.0'
	},
	GlobalWorkerOptions: {
		workerSrc: ''
	},
	getDocument: vi.fn(),
	version: '5.0.0'
}));
