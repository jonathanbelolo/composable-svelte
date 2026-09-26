<script lang="ts">
  import {
    ApplicationHost,
    ApplicationRoot,
    FeatureOutlet,
    FeatureViews
  } from '@composable-svelte/core/application';
  import {
    application,
    type AppDependencies,
    type AppState,
    type ApplicationInitialInput
  } from './lib/model.js';
  import { appViews } from './lib/views.js';
  import { createControlledBackend } from './lib/controlled-backend.js';

  type AppInitialProp =
    | { input: ApplicationInitialInput; state?: never; url: string }
    | { state: AppState; input?: never; url: string };

  let {
    dependencies = createControlledBackend(),
    initial
  }: {
    dependencies?: AppDependencies;
    initial?: AppInitialProp;
  } = $props();

  const defaultUrl =
    typeof window !== 'undefined'
      ? window.location.pathname + window.location.search + window.location.hash
      : '/login';

  const effectiveInitial: AppInitialProp = $derived(
    initial ?? {
      input: { route: 'login' },
      url: defaultUrl
    }
  );
</script>

<ApplicationRoot definition={application} options={{ dependencies, initial: effectiveInitial }}>
  {#snippet children(app)}
    <ApplicationHost {app}>
      <FeatureViews store={app.store} definition={appViews}>
        {#snippet children(views)}
          {@const state = app.store.state}
          {@const session = state.auth?.session}
          {@const subject = session?.subject}
          {@const isAuth = subject?.kind === 'authenticated'}
          {@const displayName = subject?.kind === 'authenticated'
            ? String(subject.attributes['display_name'] ?? subject.id)
            : ''}

          <div class="app-layout" data-testid="app-root">
            <header class="app-header">
              <div class="brand">
                <h1>Account Dashboard</h1>
              </div>
              {#if isAuth}
                <div class="user-bar" data-testid="user-bar">
                  <span class="user-name" data-testid="user-display">{displayName}</span>
                  <button
                    class="btn btn-logout"
                    data-testid="logout-button"
                    onclick={() => app.store.dispatch({ type: 'logout' })}
                  >
                    Log out
                  </button>
                </div>
              {/if}
            </header>

            <main class="app-main">
              <!-- Auth Feature Outlet: always placed to maintain FeatureViews placement claim -->
              <div
                class="auth-container"
                class:hidden={state.route !== 'login' && !state.auth?.changePassword}
                data-testid="auth-container"
              >
                <FeatureOutlet view={views.auth} />
              </div>

              <!-- Dashboard Feature Views. The container stays mounted so the chart
                   outlet is placed exactly once for the whole layout lifetime; the
                   outlet renders nothing while the chart slot is null. -->
              <div
                class="dashboard-container"
                class:hidden={state.route !== 'dashboard'}
                data-testid="dashboard-container"
              >
                {#if state.route === 'dashboard' && state.accountLoading}
                  <div class="alert alert-info" data-testid="loading-indicator">
                    Loading account data…
                  </div>
                {/if}

                {#if state.route === 'dashboard' && state.accountError}
                  <div class="alert alert-error" data-testid="account-error" role="alert">
                    {state.accountError}
                  </div>
                {/if}

                {#if state.route === 'dashboard' && state.accountData}
                  <section class="account-card" data-testid="account-card">
                    <h2>Welcome back, {state.accountData.displayName}</h2>
                    <div class="account-details">
                      <p><strong>Email:</strong> <span data-testid="account-email">{state.accountData.email}</span></p>
                      <p><strong>Role:</strong> <span data-testid="account-role">{state.accountData.role}</span></p>
                      <p><strong>Subject ID:</strong> <span data-testid="account-subject-id">{state.accountData.subjectId}</span></p>
                    </div>
                  </section>
                {/if}

                <section class="chart-section" class:hidden={!state.chart} data-testid="chart-section">
                  {#if state.chart}
                    <h3>Recent Login Activity</h3>
                  {/if}
                  <!-- Chart Feature Outlet: renders ChartView with real AccountActivityRow typing -->
                  <FeatureOutlet view={views.chart} />

                  {#if state.selectedMetric}
                    <div class="selected-metric-banner" data-testid="selected-metric">
                      Selected Activity: <strong>{state.selectedMetric.date}</strong> —
                      <strong>{state.selectedMetric.logins} logins</strong> via {state.selectedMetric.service}
                    </div>
                  {/if}
                </section>

                {#if state.route === 'dashboard' && state.accountData}
                  <section class="security-section" data-testid="security-section">
                    <h3>Account Security</h3>
                    {#if state.passwordChangeMessage}
                      <div class="alert alert-success" data-testid="password-message" role="status">
                        {state.passwordChangeMessage}
                      </div>
                    {/if}

                    {#if !state.auth?.changePassword}
                      <button
                        class="btn btn-secondary"
                        data-testid="open-change-password-button"
                        onclick={() => app.store.dispatch({ type: 'openChangePassword' })}
                      >
                        Change password
                      </button>
                    {:else}
                      <button
                        class="btn btn-secondary"
                        data-testid="cancel-change-password-button"
                        onclick={() => app.store.dispatch({ type: 'closeChangePassword' })}
                      >
                        Cancel password change
                      </button>
                    {/if}
                  </section>
                {/if}
              </div>
            </main>
          </div>
        {/snippet}
      </FeatureViews>
    </ApplicationHost>
  {/snippet}
</ApplicationRoot>

<style>
  :global(body) {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    color: #1e293b;
    background-color: #f1f5f9;
  }

  .app-layout {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .app-header {
    background: #0f172a;
    color: #ffffff;
    padding: 1rem 2rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .app-header h1 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
  }

  .user-bar {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .user-name {
    font-size: 0.9rem;
    color: #94a3b8;
  }

  .app-main {
    flex: 1;
    max-width: 900px;
    width: 100%;
    margin: 2rem auto;
    padding: 0 1rem;
    box-sizing: border-box;
  }

  .hidden {
    display: none !important;
  }

  .auth-container {
    background: #ffffff;
    border-radius: 8px;
    padding: 2rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .dashboard-container {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .account-card, .chart-section, .security-section {
    background: #ffffff;
    border-radius: 8px;
    padding: 1.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .account-card h2, .chart-section h3, .security-section h3 {
    margin-top: 0;
    color: #0f172a;
  }

  .account-details p {
    margin: 0.5rem 0;
    font-size: 0.95rem;
  }

  .selected-metric-banner {
    margin-top: 1rem;
    padding: 0.75rem 1rem;
    background: #eff6ff;
    border-left: 4px solid #3b82f6;
    border-radius: 4px;
    color: #1e3a8a;
    font-size: 0.9rem;
  }

  .alert {
    padding: 0.75rem 1rem;
    border-radius: 6px;
    margin-bottom: 1rem;
    font-size: 0.9rem;
  }

  .alert-info {
    background: #e0f2fe;
    color: #0369a1;
  }

  .alert-error {
    background: #fee2e2;
    color: #991b1b;
  }

  .alert-success {
    background: #dcfce7;
    color: #166534;
  }

  .btn {
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    border: none;
    transition: background-color 0.15s ease-in-out;
  }

  .btn-logout {
    background: #334155;
    color: #ffffff;
  }

  .btn-logout:hover {
    background: #475569;
  }

  .btn-secondary {
    background: #0284c7;
    color: #ffffff;
  }

  .btn-secondary:hover {
    background: #0369a1;
  }
</style>
