import { mount } from 'svelte';
import App from './App.svelte';
// In-memory demo only. Production services must enforce revision conflicts.
mount(App, { target: document.getElementById('app')!, props: {
  url: window.location.href,
  dependencies: { save: async note => ({ ...note, revision: note.revision + 1 }) }
} });
