import { mount } from 'svelte';
import { createMockAuthDeps } from '@composable-svelte/auth/testing';
import App from './App.svelte';

let releaseLogout: (() => void) | undefined;
const deps = {
  ...createMockAuthDeps({ signupOutcome: 'session', resetOutcome: 'session', verifyOutcome: 'session', magicLinkTokens: ['consumer-magic-token'] }),
  fetchLogout: () => new Promise<void>(resolve => { releaseLogout = resolve; })
};
(window as Window & { __authConsumerReleaseLogout?: () => void }).__authConsumerReleaseLogout = () => releaseLogout?.();
mount(App, { target: document.getElementById('app')!, props: { dependencies: deps } });
