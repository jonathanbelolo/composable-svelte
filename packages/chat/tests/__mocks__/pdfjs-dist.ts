/**
 * Mock pdfjs-dist module for tests
 *
 * Avoids fs/promises dependency in browser test environment
 */

export const GlobalWorkerOptions = {
	workerSrc: ''
};

export const version = '5.0.0';

export function getDocument() {
	return {
		promise: Promise.resolve({
			numPages: 1,
			getPage: () => Promise.resolve({
				getViewport: () => ({ width: 800, height: 600 }),
				render: () => ({ promise: Promise.resolve() })
			})
		})
	};
}

export default {
	GlobalWorkerOptions,
	version,
	getDocument
};
