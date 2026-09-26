/**
 * Inventory App - Entry Point
 *
 * Example application demonstrating URL routing with Composable Svelte.
 * Phase 7: URL Synchronization (Browser History Integration)
 */

import { mount } from 'svelte';
import App from './App.svelte';

const app = mount(App, {
	target: document.getElementById('app')!,
	props: {url: window.location.href}
});

export default app;
