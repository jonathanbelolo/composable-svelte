// Bundle renderer and App component together so the SSR lifecycle has one Svelte server runtime.
export { render } from 'svelte/server';
export { default as App } from '../src/App.svelte';
