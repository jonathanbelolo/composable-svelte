import { mount } from 'svelte';
import App from './app/App.svelte';
import './lib/styles.css';

const app = mount(App, {
  target: document.getElementById('app')!
});

export default app;
