import { createServer } from 'vite';
import assert from 'node:assert/strict';

const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
try {
  const { render } = await server.ssrLoadModule('svelte/server');
  const { default: App } = await server.ssrLoadModule('/src/App.svelte');

  const outputDefault = render(App);
  assert.match(outputDefault.body, /Composable Svelte/);
  assert.match(outputDefault.body, /data-testid="count"[^>]*>0</);

  let loadCallsA = 0;
  const outputA = render(App, {
    props: {
      initialState: { count: 7, loading: false },
      dependencies: {
        load: async () => {
          loadCallsA++;
          return 77;
        }
      }
    }
  });
  assert.match(outputA.body, /Composable Svelte/);
  assert.match(outputA.body, /data-testid="count"[^>]*>7</);
  assert.equal(loadCallsA, 0);

  let loadCallsB = 0;
  const outputB = render(App, {
    props: {
      initialState: { count: 42, loading: false },
      dependencies: {
        load: async () => {
          loadCallsB++;
          return 4242;
        }
      }
    }
  });
  assert.match(outputB.body, /Composable Svelte/);
  assert.match(outputB.body, /data-testid="count"[^>]*>42</);
  assert.equal(loadCallsB, 0);
  assert.notEqual(outputA.body, outputB.body);

  const outputA2 = render(App, {
    props: {
      initialState: { count: 7, loading: false },
      dependencies: {
        load: async () => {
          loadCallsA++;
          return 77;
        }
      }
    }
  });
  assert.equal(outputA.body, outputA2.body);
  assert.equal(loadCallsA, 0);

  const outputDefault2 = render(App);
  assert.equal(outputDefault.body, outputDefault2.body);

  console.log('SSR smoke renders the expected initial state');
} finally {
  await server.close();
}
