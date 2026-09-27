import { mount } from 'svelte';
import App from './App.svelte';
import './styles.css';

const target = document.getElementById('app');

// The document URL decides the initial page; SSR passes its request URL to App instead.
const url = `${location.pathname}${location.search}${location.hash}`;

const app = target
  ? mount(App, {
      target,
      props: { url }
    })
  : null;

export default app;
