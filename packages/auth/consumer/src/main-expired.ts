import { mount } from 'svelte';
import { createMockAuthDeps } from '@composable-svelte/auth/testing';
import App from './App.svelte';

mount(App, {
  target: document.getElementById('app')!,
  props: {
    dependencies: createMockAuthDeps({ expiredTokens: ['consumer-verify-token'] })
  }
});
