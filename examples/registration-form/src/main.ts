import App from './app/App.svelte';
import '@composable-svelte/core/styles/theme.css';

const app = new App({
  target: document.getElementById('app')!
});

export default app;
