import { mount } from 'svelte';
import App from './App.svelte';

// The only browser read: the client entry passes the current URL in.
const target = document.getElementById('app');
if (target) mount(App, { target, props: { url: location.pathname + location.search + location.hash } });
