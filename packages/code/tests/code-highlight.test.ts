/**
 * CodeHighlight component tests
 *
 * Production-store reducer/effect tests await actual terminal actions; no fixed delays.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createStore } from '@composable-svelte/core';
import {
	codeHighlightReducer,
	createInitialState,
	type CodeHighlightDependencies
} from '../src/lib/code-highlight/index';

import type { Store } from '@composable-svelte/core';
import type { CodeHighlightAction, CodeHighlightState } from '../src/lib/code-highlight/code-highlight.types';
const dispose: Array<()=>void> = [];
afterEach(()=>{dispose.splice(0).forEach(fn=>fn());vi.clearAllMocks();});
function terminal(store: Store<CodeHighlightState,CodeHighlightAction>, type: 'highlighted'|'highlightFailed') {
 dispose.push(()=>store.destroy());
 return new Promise<CodeHighlightAction>(resolve=>{
  const unsubscribe=store.subscribeToActions?.(action=>{if(action.type===type){unsubscribe?.();resolve(action);}});
  if(!unsubscribe)throw new Error('Production store must expose action observation');
  dispose.push(unsubscribe);
 });
}

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

		const completed=terminal(store,'highlighted');
		store.dispatch({ type: 'init' });

		// Wait for async highlighting to complete
		expect(await completed).toEqual({type:'highlighted',html:'<span>const x = 5;</span>',code:'const x = 5;',language:'typescript'});

		expect(store.state.isHighlighting).toBe(false);
		expect(store.state.highlightedCode).toBe('<span>const x = 5;</span>');
		expect(mockHighlightCode).toHaveBeenCalledWith('const x = 5;', 'typescript');
	});

	it('handles codeChanged action', async () => {
		const store = createStore({
			initialState: createInitialState(),
			reducer: codeHighlightReducer,
			dependencies
		});

		const completed=terminal(store,'highlighted');
		store.dispatch({ type: 'codeChanged', code: 'let y = 10;' });

		expect(store.state.code).toBe('let y = 10;');
		expect(store.state.isHighlighting).toBe(true);

		// Wait for highlighting
		expect(await completed).toEqual({type:'highlighted',html:'<span>let y = 10;</span>',code:'let y = 10;',language:'typescript'});

		expect(store.state.isHighlighting).toBe(false);
		expect(store.state.highlightedCode).toContain('<span>');
	});

	it('handles languageChanged action', async () => {
		const store = createStore({
			initialState: createInitialState({ code: 'print("hello")' }),
			reducer: codeHighlightReducer,
			dependencies
		});

		const completed=terminal(store,'highlighted');
		store.dispatch({ type: 'languageChanged', language: 'python' });

		expect(store.state.language).toBe('python');
		expect(store.state.isHighlighting).toBe(true);

		expect(await completed).toEqual({type:'highlighted',html:'<span>print("hello")</span>',code:'print("hello")',language:'python'});

		expect(store.state.isHighlighting).toBe(false);
		expect(mockHighlightCode).toHaveBeenCalledWith('print("hello")', 'python');
	});

	it('handles themeChanged action', () => {
		const store = createStore({
			initialState: createInitialState({ theme: 'dark' }),
			reducer: codeHighlightReducer,
			dependencies
		});

		store.dispatch({ type: 'themeChanged', theme: 'light' });

		expect(store.state.theme).toBe('light');
	});

	it('handles toggleLineNumbers action', () => {
		const store = createStore({
			initialState: createInitialState({ showLineNumbers: true }),
			reducer: codeHighlightReducer,
			dependencies
		});

		store.dispatch({ type: 'toggleLineNumbers' });
		expect(store.state.showLineNumbers).toBe(false);

		store.dispatch({ type: 'toggleLineNumbers' });
		expect(store.state.showLineNumbers).toBe(true);
	});

	it('handles highlightLinesChanged action', () => {
		const store = createStore({
			initialState: createInitialState(),
			reducer: codeHighlightReducer,
			dependencies
		});

		store.dispatch({ type: 'highlightLinesChanged', lines: [1, 3, 5] });

		expect(store.state.highlightLines).toEqual([1, 3, 5]);
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

		const completed=terminal(store,'highlightFailed');
		store.dispatch({ type: 'init' });

		expect(await completed).toEqual({type:'highlightFailed',error:'Highlighting failed',code:'test',language:'typescript'});

		expect(store.state.error).toBe('Highlighting failed');
		expect(store.state.isHighlighting).toBe(false);
	});
});
