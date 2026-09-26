import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

console.log('--- Starting SSR Qualification ---');

const server = await createServer({
  configFile: false,
  plugins: [svelte()],
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom'
});

try {
  const { render } = await server.ssrLoadModule('svelte/server');
  const { default: App } = await server.ssrLoadModule('/src/App.svelte');
  const { createInitialAppState, auth } = await server.ssrLoadModule('/src/lib/model.ts');
  const { createInitialLoginState } = await server.ssrLoadModule('@composable-svelte/auth/flows');
  const { createControlledBackend } = await server.ssrLoadModule('/src/lib/controlled-backend.js');

  console.log('Loaded SSR modules successfully.');

  // 1. Request One: Anonymous user at /login with seeded login flow
  const backend1 = createControlledBackend();
  const userOneState = {
    ...createInitialAppState({ route: 'login' }),
    auth: {
      ...auth.initialState(),
      login: createInitialLoginState()
    }
  };

  const render1 = render(App, {
    props: {
      dependencies: backend1,
      initial: {
        state: userOneState,
        url: '/login'
      }
    }
  }).body;

  // 2. Request Two: Authenticated user at /dashboard with loaded account
  const backend2 = createControlledBackend();
  const userTwoState = {
    ...createInitialAppState({
      route: 'dashboard',
      initialData: {
        subjectId: 'sub-ada-1',
        email: 'ada@example.com',
        displayName: 'Ada Lovelace',
        role: 'Administrator',
        metrics: [
          { date: '2026-09-26', logins: 15, service: 'Web Dashboard' }
        ]
      }
    }),
    auth: {
      ...auth.initialState(),
      session: {
        status: 'authenticated',
        subject: {
          kind: 'authenticated',
          id: 'sub-ada-1',
          attributes: { display_name: 'Ada Lovelace', roles: ['admin'] }
        },
        epoch: 1,
        error: null
      }
    }
  };

  const render2 = render(App, {
    props: {
      dependencies: backend2,
      initial: {
        state: userTwoState,
        url: '/dashboard'
      }
    }
  }).body;

  // 3. Request Three: Anonymous request root without seeded login
  const backend3 = createControlledBackend();
  const render3 = render(App, {
    props: {
      dependencies: backend3,
      initial: {
        input: { route: 'login' },
        url: '/login'
      }
    }
  }).body;

  // Assertions for Request One (Login)
  if (!render1.includes('Sign in') || !render1.includes('login-form')) {
    throw new Error('Request 1 output missing login form');
  }
  if (render1.includes('Ada Lovelace') || render1.includes('account-card') || render1.includes('Log out')) {
    throw new Error('Request 1 leaked authenticated dashboard view into anonymous render');
  }

  // Assertions for Request Two (Dashboard)
  if (!render2.includes('Ada Lovelace') || !render2.includes('account-card') || !render2.includes('Log out')) {
    throw new Error('Request 2 output missing dashboard header or account elements');
  }
  if (render2.includes('login-form') && !render2.includes('Ada Lovelace')) {
    throw new Error('Request 2 incorrectly rendered unauthenticated login form');
  }

  // Assertions for Request Three (Server request root without client-only startup)
  if (render3.includes('Sign in')) {
    throw new Error('SSR created a temporary login flow without explicit state (client-only startup work must not run on server)');
  }
  if (render3.includes('Ada Lovelace') || render3.includes('Account Activity')) {
    throw new Error('Request 3 leaked authenticated dashboard state');
  }

  // Cross-request isolation assertions
  if (render1.includes('ada@example.com') || render3.includes('ada@example.com')) {
    throw new Error('Anonymous requests leaked data from Request 2');
  }

  console.log('✓ Independent request roots verified (no cross-request state leakage).');

  // Verify zero client-only work on server
  const allBackends = [backend1, backend2, backend3];
  for (let i = 0; i < allBackends.length; i++) {
    const b = allBackends[i];
    const { loginCalls, fetchAccountCalls, fetchActivityCalls, verifyMfaCalls, changePasswordCalls, logoutCalls } = b.counters;
    if (loginCalls !== 0 || fetchAccountCalls !== 0 || fetchActivityCalls !== 0 || verifyMfaCalls !== 0 || changePasswordCalls !== 0 || logoutCalls !== 0) {
      throw new Error(`Request ${i + 1} triggered client-only calls during SSR: ${JSON.stringify(b.counters)}`);
    }
  }

  // Allow microtasks/timers to settle to ensure no deferred client work runs
  await new Promise((resolve) => setTimeout(resolve, 60));

  for (let i = 0; i < allBackends.length; i++) {
    const b = allBackends[i];
    const { loginCalls, fetchAccountCalls, fetchActivityCalls, verifyMfaCalls, changePasswordCalls, logoutCalls } = b.counters;
    if (loginCalls !== 0 || fetchAccountCalls !== 0 || fetchActivityCalls !== 0 || verifyMfaCalls !== 0 || changePasswordCalls !== 0 || logoutCalls !== 0) {
      throw new Error(`Request ${i + 1} triggered deferred client calls: ${JSON.stringify(b.counters)}`);
    }
  }

  console.log('✓ Zero client-only work performed during SSR (all network & effect counters 0).');
  console.log('SSR qualification passed cleanly.');
} finally {
  await server.close();
}
