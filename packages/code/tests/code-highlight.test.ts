/**
 * CodeHighlight component tests
 *
 * Tests use TestStore for pure reducer testing - no component mounting needed
 */

import { describe, it, expect, vi } from 'vitest';
import { createStore } from '@composable-svelte/core';
import {
	codeHighlightReducer,
	createInitialState,
	type CodeHighlightDependencies
} from '../src/lib/code-highlight/index';

describe('CodeHighlight Reducer', () => {
	const mockHighlightCode = vi.fn(async (code: string) => `<span>${code}</span>`);

	const dependencies: CodeHighlightDependencies = {
		highlightCode: mockHighlightCode
	};

	it('initializes with default state', () => {
		const state = createInitialState();

		expect(state.code).toBe('');
		expect(state.language).toBe('typescript');
		expect(state.theme).toBe('dark');
		expect(state.showLineNumbers).toBe(true);
		expect(state.highlightedCode).toBe(null);
		expect(state.copyStatus).toBe('idle');
		expect(state.isHighlighting).toBe(false);
		expect(state.error).toBe(null);
	});

	it('initializes with custom state', () => {
		const state = createInitialState({
			code: 'const x = 5;',
			language: 'javascript',
			theme: 'light'
		});

		expect(state.code).toBe('const x = 5;');
		expect(state.language).toBe('javascript');
		expect(state.theme).toBe('light');
	});

	it('handles init action and triggers highlighting', async () => {
		const store = createStore({
			initialState: createInitialState({ code: 'const x = 5;' }),
			reducer: codeHighlightReducer,
			dependencies
		});

		// Dispatch init
		store.dispatch({ type: 'init' });

		// Wait for async highlighting to complete
		await new Promise((resolve) => setTimeout(resolve, 10));

		expect($store.isHighlighting).toBe(false);
		expect($store.highlightedCode).toBe('<span>const x = 5;</span>');
		expect(mockHighlightCode).toHaveBeenCalledWith('const x = 5;', 'typescript');
	});

	it('handles codeChanged action', async () => {
		const store = createStore({
			initialState: createInitialState(),
			reducer: codeHighlightReducer,
			dependencies
		});

		store.dispatch({ type: 'codeChanged', code: 'let y = 10;' });

		expect($store.code).toBe('let y = 10;');
		expect($store.isHighlighting).toBe(true);

		// Wait for highlighting
		await new Promise((resolve) => setTimeout(resolve, 10));

		expect($store.isHighlighting).toBe(false);
		expect($store.highlightedCode).toContain('<span>');
	});

	it('handles languageChanged action', async () => {
		const store = createStore({
			initialState: createInitialState({ code: 'print("hello")' }),
			reducer: codeHighlightReducer,
			dependencies
		});

		store.dispatch({ type: 'languageChanged', language: 'python' });

		expect($store.language).toBe('python');
		expect($store.isHighlighting).toBe(true);

		await new Promise((resolve) => setTimeout(resolve, 10));

		expect($store.isHighlighting).toBe(false);
		expect(mockHighlightCode).toHaveBeenCalledWith('print("hello")', 'python');
	});

	it('handles themeChanged action', () => {
		const store = createStore({
			initialState: createInitialState({ theme: 'dark' }),
			reducer: codeHighlightReducer,
			dependencies
		});

		store.dispatch({ type: 'themeChanged', theme: 'light' });

		expect($store.theme).toBe('light');
	});

	it('handles toggleLineNumbers action', () => {
		const store = createStore({
			initialState: createInitialState({ showLineNumbers: true }),
			reducer: codeHighlightReducer,
			dependencies
		});

		store.dispatch({ type: 'toggleLineNumbers' });
		expect($store.showLineNumbers).toBe(false);

		store.dispatch({ type: 'toggleLineNumbers' });
		expect($store.showLineNumbers).toBe(true);
	});

	it('handles highlightLinesChanged action', () => {
		const store = createStore({
			initialState: createInitialState(),
			reducer: codeHighlightReducer,
			dependencies
		});

		store.dispatch({ type: 'highlightLinesChanged', lines: [1, 3, 5] });

		expect($store.highlightLines).toEqual([1, 3, 5]);
	});

	it('handles highlighting errors gracefully', async () => {
		const errorDeps: CodeHighlightDependencies = {
			highlightCode: async () => {
				throw new Error('Highlighting failed');
			}
		};

		const store = createStore({
			initialState: createInitialState({ code: 'test' }),
			reducer: codeHighlightReducer,
			dependencies: errorDeps
		});

		store.dispatch({ type: 'init' });

		await new Promise((resolve) => setTimeout(resolve, 10));

		expect($store.error).toBe('Highlighting failed');
		expect($store.isHighlighting).toBe(false);
	});
});
