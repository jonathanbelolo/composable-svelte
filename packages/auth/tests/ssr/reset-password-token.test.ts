import { it, expect, vi } from 'vitest';
import { render } from 'svelte/server';
import { createStore } from '@composable-svelte/core';
import { createInitialResetPasswordState, resetPasswordReducer } from '../../src/lib/flows/reset-password/reducer.js';
import { createMockAuthDeps } from '../../src/lib/testing/index.js';
import ResetPasswordForm from '../../src/lib/components/ResetPasswordForm.svelte';

it.each(['missing-with-prop', 'expired-with-new-prop', 'missing', 'expired-same'] as const)(
  'renders %s without dispatching or changing caller state', mode => {
    const state = createInitialResetPasswordState(mode.startsWith('expired') ? 'old' : null);
    if (mode.startsWith('expired')) state.error = { code: 'token_expired', message: 'expired' };
    const store = createStore({ initialState: state, reducer: resetPasswordReducer, dependencies: createMockAuthDeps() });
    const dispatch = vi.spyOn(store, 'dispatch');
    const token = mode.endsWith('prop') ? 'new' : mode === 'expired-same' ? 'old' : null;
    try {
      const html = render(ResetPasswordForm, { props: {
        flowStore: store, sessionStore: { dispatch: () => {} }, token, onRequestNewLink: () => {}
      } }).body;
      expect(html.includes('type="password"')).toBe(mode.endsWith('prop'));
      expect(dispatch).not.toHaveBeenCalled();
      expect(store.state).toBe(state);
    } finally { store.destroy(); }
  }
);
