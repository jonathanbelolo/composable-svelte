import App from './app/App.svelte';
import '../../packages/core/src/styles/theme.css';

const app = new App({
  target: document.getElementById('app')!
});

export default app;
