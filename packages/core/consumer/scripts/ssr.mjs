import { createServer } from 'vite';
import assert from 'node:assert/strict';
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
try {
  const { render }=await server.ssrLoadModule('svelte/server');
  const { default: App }=await server.ssrLoadModule('/src/App.svelte');
  const output=render(App);
  assert.match(output.body,/Composable Svelte/);
  assert.match(output.body,/data-testid="count"[^>]*>0/);
  console.log('SSR smoke renders the expected initial state');
} finally {await server.close();}
