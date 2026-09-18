import { it, expect } from 'vitest';
import { createTestStore } from '@composable-svelte/core/test';
import { codeHighlightReducer, createInitialCodeHighlightState } from '@composable-svelte/code';

const store = createTestStore({
  initialState: createInitialCodeHighlightState({ code: 'const x = 5;' }),
  reducer: codeHighlightReducer,
  dependencies: { highlightCode: async (code) => `<span>${code}</span>` }
});

await store.send({ type: 'init' });

await store.receive({ type: 'highlightCompleted' }, (state) => {
  expect(state.highlightedCode).toContain('<span>');
  expect(state.isHighlighting).toBe(false);
});
