import { mount } from 'svelte';
import '@composable-svelte/graphics/dist/index.css';
import App from './App.svelte';

const app = mount(App, {
  target: document.getElementById('app')!
});

export default app;
