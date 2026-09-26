import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { createHttpAuthDeps, authErrorFromResponse } from '@composable-svelte/auth/http';
import { createMockAuthDeps } from '@composable-svelte/auth/testing';
import { isMfaRequired, isAuthError } from '@composable-svelte/auth/errors';

// Headless qualification of installed @composable-svelte/auth/http and @composable-svelte/auth/testing
{
  const calls = [];
  const testFetch = async (input, init) => {
    calls.push(init ?? {});
    const url = String(input);
    if (init?.signal?.aborted) {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    }
    if (url.endsWith('/auth/session')) {
      return new Response(null, { status: 204 });
    }
    if (url.endsWith('/auth/password-login') || url.endsWith('/auth/login')) {
      return new Response(JSON.stringify({ code: 'invalid_credentials', message: 'Bad credentials.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (url.endsWith('/auth/account')) {
      return new Response(JSON.stringify({ email: 'test@example.com', emailVerified: true, hasPassword: true, mfaEnabled: false, providers: [], pendingEmail: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const httpDeps = createHttpAuthDeps('https://api.example.com', { fetch: testFetch });
  assert.equal(await httpDeps.fetchSession(), null);
  assert.equal(calls.at(-1)?.credentials, 'include');

  await assert.rejects(
    httpDeps.login({ email: 'ada@example.com', password: 'wrong' }),
    (err) => isAuthError(err) && err.code === 'invalid_credentials'
  );
  assert.equal(calls.at(-1)?.credentials, 'include');

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(httpDeps.fetchAccount(controller.signal));
  assert.equal(calls.at(-1)?.signal, controller.signal);

  const mockDeps = createMockAuthDeps({
    session: { subject_id: 'user-1', display_name: 'User 1', roles: ['admin'], expires_at: '2030-01-01T00:00:00Z' }
  });
  assert.equal(await mockDeps.fetchSession(), null);
  const loggedIn = await mockDeps.login({ email: 'ada@example.com', password: 'correct-horse' });
  assert.equal(loggedIn.subject_id, 'user-1');
  const controller2 = new AbortController();
  controller2.abort();
  await assert.rejects(mockDeps.fetchAccount(controller2.signal));

  const mfaResp = new Response(JSON.stringify({ error: { code: 'mfa_required', challenge_id: 'ch-1', methods: ['totp'] } }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' }
  });
  const mfaErr = await authErrorFromResponse(mfaResp, 'Second factor required.');
  assert(isMfaRequired(mfaErr));
  assert.equal(mfaErr.challengeId, 'ch-1');
}

const port = Number(process.env.AUTH_CONSUMER_PORT ?? '5417');
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  stdio: 'pipe'
});
const address = `http://127.0.0.1:${port}/`;

try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`Vite exited with ${server.exitCode}`);
    try { if ((await fetch(address)).ok) { ready = true; break; } } catch { /* server starting */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error('Vite did not start');

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(address);
    // Initial session gate: pending/unresolved
    await page.getByTestId('left-guard-pending').waitFor();
    await page.getByRole('button', { name: 'Open left login' }).waitFor({ timeout: 60000 });
    await page.getByRole('button', { name: 'Open left login' }).click();
    await page.getByRole('button', { name: 'Open right login' }).click();
    const left = page.getByTestId('left-auth');
    const right = page.getByTestId('right-auth');
    if (await left.locator('input[name=email]').count() !== 1 || await right.locator('input[name=email]').count() !== 1) throw new Error('both nested login views must render');
    await left.locator('input[name=email]').fill('ada@example.com');
    await left.locator('input[name=password]').fill('correct-horse');
    await left.getByRole('button', { name: 'Sign in' }).click();
    await page.getByTestId('outcomes').getByText('left:accepted:login').waitFor();
    if (await left.locator('form').count() !== 0) throw new Error('completed left flow must retire');

    // Parent session gates after child retirement:
    await page.getByTestId('left-guard-authenticated').waitFor();
    await page.getByTestId('left-role-member').waitFor();
    await page.getByTestId('left-role-no-admin').waitFor();

    // Password guidance and accessibility:
    const guidanceSection = page.getByTestId('password-guidance-section');
    const guidanceInput = guidanceSection.locator('#guidance-password-input');
    const guidanceCriteria = guidanceSection.locator('#guidance-password-criteria');
    await guidanceInput.waitFor();
    if (await guidanceInput.getAttribute('type') !== 'password') throw new Error('expected guidance input type password');
    const describedBy = await guidanceInput.getAttribute('aria-describedby');
    if (!describedBy?.includes('guidance-password-criteria')) throw new Error(`expected describedBy guidance-password-criteria, got ${describedBy}`);
    const criteriaLabel = await guidanceCriteria.getAttribute('aria-label');
    if (criteriaLabel !== 'Password requirements') throw new Error(`expected criteria label Password requirements, got ${criteriaLabel}`);

    const toggleBtn = guidanceSection.locator('button.password-input__toggle');
    if (await toggleBtn.getAttribute('aria-label') !== 'Show password') throw new Error('expected Show password label');
    await toggleBtn.click();
    if (await guidanceInput.getAttribute('type') !== 'text') throw new Error('expected input type text after toggle');
    if (await toggleBtn.getAttribute('aria-label') !== 'Hide password') throw new Error('expected Hide password label after toggle');
    await toggleBtn.click();
    if (await guidanceInput.getAttribute('type') !== 'password') throw new Error('expected input type password after toggle back');

    const lengthItem = guidanceCriteria.locator('.password-criteria__item').first();
    if (await lengthItem.getAttribute('data-met') !== 'false') throw new Error('expected unmet length on empty');
    await guidanceInput.fill('short');
    if (await lengthItem.getAttribute('data-met') !== 'false') throw new Error('expected unmet length on short');
    await guidanceInput.fill('correct-horse-battery-staple');
    if (await lengthItem.getAttribute('data-met') !== 'true') throw new Error('expected met length on valid');

    if (await right.locator('input[name=email]').count() !== 1) throw new Error('right sibling must remain live');
    await page.getByRole('button', { name: 'Reset left' }).click();
    await left.getByRole('button', { name: 'Open left login' }).click();
    if (await left.locator('input[name=email]').count() !== 1) throw new Error('reset left flow must reopen');
    await page.getByRole('button', { name: 'Remove left' }).click();
    if (await left.count() !== 0) throw new Error('left owner must retire');
    await page.getByRole('button', { name: 'Restore left' }).click();
    if (await left.count() !== 1) throw new Error('left owner must restore');
    await left.getByRole('button', { name: 'Open left signup' }).click();
    await left.locator('input[name=email]').fill('grace@example.com');
    await left.locator('input[name=password]').fill('correct-horse-battery-staple');
    await left.locator('input[name=confirmPassword]').fill('correct-horse-battery-staple');
    await left.getByRole('button', { name: 'Create account' }).click();
    await left.getByText('Check your email').waitFor();
    await page.getByTestId('outcomes').getByText('left:verification:grace@example.com').waitFor();
    if (await page.getByTestId('outcomes').getByText('left:accepted:signup').count() !== 0) throw new Error('verification must not establish a session');
    await left.getByRole('button', { name: 'Open left signup' }).click();
    const firstVerification = await page.getByTestId('outcomes').textContent();
    if ((firstVerification?.match(/left:verification:grace@example.com/g) ?? []).length !== 1) throw new Error('an unrelated auth action replayed verification');
    await page.getByRole('button', { name: 'Reset left' }).click();
    await left.getByRole('button', { name: 'Open left signup' }).click();
    await left.locator('input[name=email]').fill('grace@example.com');
    await left.locator('input[name=password]').fill('correct-horse-battery-staple');
    await left.locator('input[name=confirmPassword]').fill('correct-horse-battery-staple');
    await left.getByRole('button', { name: 'Create account' }).click();
    await left.getByText('Check your email').waitFor();
    const secondVerification = await page.getByTestId('outcomes').textContent();
    if ((secondVerification?.match(/left:verification:grace@example.com/g) ?? []).length !== 2) throw new Error('a new auth lifetime lost its verification result');
    await right.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
    await right.locator('input[name=email]').fill('ada@example.com');
    await right.locator('input[name=password]').fill('correct-horse');
    await right.getByRole('button', { name: 'Sign in' }).click();
    await page.getByTestId('outcomes').getByText('right:accepted:login').waitFor();
    await right.getByRole('button', { name: 'Open right signup' }).click();
    // Test password policy on right signup (requires at least 12 characters):
    await right.locator('input[name=email]').fill('policy-test@example.com');
    await right.locator('input[name=password]').fill('short');
    await right.locator('input[name=confirmPassword]').fill('short');
    await right.getByRole('button', { name: 'Create account' }).click();
    await right.locator('.signup-form__field-error').first().waitFor();
    const policyError = await right.locator('.signup-form__field-error').first().textContent();
    if (!policyError?.includes('12 characters')) {
      throw new Error(`expected min length error in signup form, got ${policyError}`);
    }
    await right.locator('input[name=email]').fill('taken@example.com');
    await right.locator('input[name=password]').fill('correct-horse-battery-staple');
    await right.locator('input[name=confirmPassword]').fill('correct-horse-battery-staple');
    await right.getByRole('button', { name: 'Create account' }).click();
    await right.getByRole('button', { name: 'Sign in instead' }).click();
    if (await right.locator('input[name=confirmPassword]').count() !== 0) throw new Error('Sign in instead must retire signup');
    if (await right.getByRole('button', { name: 'Sign in', exact: true }).count() !== 1) throw new Error('Sign in instead must present login');
    await page.getByRole('button', { name: 'Reset left' }).click();
    await left.getByRole('button', { name: 'Open left recovery' }).click();
    await left.locator('input[name=email]').fill('grace@example.com');
    await left.getByRole('button', { name: 'Send reset link' }).click();
    await left.getByText('If there is an account for').waitFor();
    await page.getByTestId('outcomes').getByText('left:recoverySent:grace@example.com').waitFor();
    if (await left.locator('input[name=email]').count() !== 1) throw new Error('sent recovery must keep an editable form');
    await left.getByRole('button', { name: 'Open left recovery' }).click();
    const onceSent = await page.getByTestId('outcomes').textContent();
    if ((onceSent?.match(/left:recoverySent:grace@example.com/g) ?? []).length !== 1) throw new Error('unrelated auth action replayed recovery');
    await left.getByRole('button', { name: 'Send reset link' }).click();
    await page.waitForFunction(() => (document.querySelector('[data-testid=outcomes]')?.textContent?.match(/left:recoverySent:grace@example.com/g) ?? []).length === 2);
    await left.getByRole('button', { name: 'Back to sign in' }).click();
    if (await left.locator('.login-form').count() !== 1) throw new Error('managed recovery must return to login');
    await page.getByRole('button', { name: 'Reset left' }).click();
    await left.getByRole('button', { name: 'Open left reset', exact: true }).click();
    await left.locator('input[name=password]').fill('correct-horse-battery-staple');
    await left.locator('input[name=confirmPassword]').fill('correct-horse-battery-staple');
    await left.getByRole('button', { name: 'Set new password' }).click();
    await page.getByTestId('outcomes').getByText('left:resetWithoutSession').waitFor();
    await left.getByRole('button', { name: 'Sign in', exact: true }).click();
    if (await left.locator('.login-form').count() !== 1) throw new Error('no-session reset must offer sign-in');
    await page.getByRole('button', { name: 'Reset left' }).click();
    await left.getByRole('button', { name: 'Open left expired reset' }).click();
    await left.locator('input[name=password]').fill('correct-horse-battery-staple');
    await left.locator('input[name=confirmPassword]').fill('correct-horse-battery-staple');
    await left.getByRole('button', { name: 'Set new password' }).click();
    await page.getByTestId('outcomes').getByText('left:resetExpired').waitFor();
    await left.getByRole('button', { name: 'Send me a new link' }).click();
    if (await left.locator('.forgot-form').count() !== 1) throw new Error('expired reset must offer recovery');
    await page.getByRole('button', { name: 'Reset left' }).click();
    await left.getByRole('button', { name: 'Open left verification' }).click();
    await page.getByTestId('outcomes').getByText('left:verifiedWithoutSession').waitFor();
    await left.getByRole('button', { name: 'Sign in', exact: true }).click();
    if (await left.locator('.login-form').count() !== 1) throw new Error('no-session verification must offer sign-in');
    // OAuth start: browser redirect operation that stores pending state
    await page.getByRole('button', { name: 'Reset left' }).click();
    await left.getByRole('button', { name: 'Open left OAuth start' }).click();
    if (await left.getByRole('button', { name: 'GitHub' }).count() !== 1) throw new Error('left OAuth start must render GitHub button');
    if (await right.locator('.oauth-signin').count() !== 0) throw new Error('right sibling must not render OAuth start');
    await left.getByRole('button', { name: 'GitHub' }).click();
    await page.waitForFunction(() => (window).__authConsumerLastRedirect?.includes('https://provider.example/authorize'));

    // OAuth callback: empty callback URL renders "Nothing to finish here" and offers sign-in
    await page.getByRole('button', { name: 'Reset left' }).click();
    await left.getByRole('button', { name: 'Open left OAuth callback' }).click();
    await left.getByText('Nothing to finish here').waitFor();
    await left.getByRole('button', { name: 'Back to sign in' }).click();
    if (await left.locator('.login-form').count() !== 1) throw new Error('empty callback start-over must return to login');

    // OAuth callback sign-in: one-use code exchange hands over session to parent
    await page.evaluate(() => {
      sessionStorage.setItem('auth:oauth:pending', JSON.stringify({
        provider: 'google',
        intent: 'signIn',
        state: 'st_demo',
        returnTo: '/dash'
      }));
    });
    await page.goto(`${address}?code=code_demo&state=st_demo`);
    await page.getByRole('button', { name: 'Open left OAuth callback' }).waitFor();
    await page.getByRole('button', { name: 'Open left OAuth callback' }).click();
    await page.getByTestId('outcomes').getByText('left:accepted:oauthCallback').waitFor();
    await page.getByTestId('outcomes').getByText('left:oauth:signedIn:/dash').waitFor();
    if (await left.locator('.oauth-callback').count() !== 0) throw new Error('completed OAuth sign-in flow must retire');

    // OAuth callback link: links provider without establishing a new session.
    // Navigate with the callback query first, then authenticate in this SAME
    // page lifecycle, capture the subject and accepted count, complete the link,
    // and assert zero new accepted handoffs and unchanged subject.
    await page.goto(`${address}?code=code_demo&state=st_demo`);
    await page.evaluate(() => {
      sessionStorage.setItem('auth:oauth:pending', JSON.stringify({
        provider: 'github',
        intent: 'link',
        state: 'st_demo',
        returnTo: '/settings'
      }));
    });
    await left.getByRole('button', { name: 'Open left login' }).waitFor();
    await left.getByRole('button', { name: 'Open left login' }).click();
    await left.locator('input[name=email]').fill('ada@example.com');
    await left.locator('input[name=password]').fill('correct-horse');
    await left.getByRole('button', { name: 'Sign in' }).click();
    await page.getByTestId('outcomes').getByText('left:accepted:login').waitFor();
    await page.waitForFunction(() => {
      const subject = document.querySelector('[data-testid=left-subject]')?.textContent;
      return Boolean(subject && subject !== 'none');
    });

    const subjectBefore = await page.getByTestId('left-subject').textContent();
    const outcomesBefore = await page.getByTestId('outcomes').textContent();
    const acceptedBefore = (outcomesBefore?.match(/left:accepted:oauthCallback/g) ?? []).length;

    await page.getByRole('button', { name: 'Open left OAuth callback' }).click();
    await page.getByTestId('outcomes').getByText('left:oauth:linkCompleted:/settings').waitFor();

    const subjectAfter = await page.getByTestId('left-subject').textContent();
    const outcomesAfter = await page.getByTestId('outcomes').textContent();
    const acceptedAfter = (outcomesAfter?.match(/left:accepted:oauthCallback/g) ?? []).length;
    if (acceptedAfter !== acceptedBefore) {
      throw new Error(`linking must never establish a session (accepted count went from ${acceptedBefore} to ${acceptedAfter})`);
    }
    if (!subjectBefore || subjectBefore === 'none' || subjectAfter !== subjectBefore) {
      throw new Error(`linking must not mutate session subject (expected ${subjectBefore}, got ${subjectAfter})`);
    }

    // OAuth callback denied: user cancelled authorization
    await page.goto(`${address}?error=access_denied`);
    await page.getByRole('button', { name: 'Open left OAuth callback' }).waitFor();
    await page.getByRole('button', { name: 'Open left OAuth callback' }).click();
    await page.getByTestId('outcomes').getByText('left:oauth:failed:oauth_denied').waitFor();
    await left.getByText('Sign-in cancelled').waitFor();
    await left.getByRole('button', { name: 'Try again' }).click();
    if (await left.locator('.login-form').count() !== 1) throw new Error('denied callback try-again must present login');

    // OAuth callback state mismatch: forged or stale state
    await page.goto(`${address}?code=bad_code&state=mismatched_state`);
    await page.getByRole('button', { name: 'Open left OAuth callback' }).waitFor();
    await page.getByRole('button', { name: 'Open left OAuth callback' }).click();
    await page.getByTestId('outcomes').getByText('left:oauth:failed:oauth_state_mismatch').waitFor();
    await left.getByText("We couldn't finish that sign-in").waitFor();
    await left.getByRole('button', { name: 'Start again' }).click();
    if (await left.locator('.login-form').count() !== 1) throw new Error('mismatched callback start-again must present login');
    // MFA settings: they belong to a signed-in account, management waits for the
    // parent's account read, routes each outcome, and keeps an unhandled
    // re-authentication demand visible. A fresh load: the right section still
    // holds the login from "Sign in instead", which (correctly) refuses opening
    // settings, and the disable mock's attempt count must start at zero.
    await page.goto(address);
    await page.getByRole('button', { name: 'Open left MFA settings' }).waitFor({ timeout: 60000 });
    const outcomeCount = async (text) => ((await page.getByTestId('outcomes').textContent())?.split(',').filter(entry => entry === text).length ?? 0);
    async function signIn(section, side) {
      const before = await outcomeCount(`${side}:accepted:login`);
      await section.getByRole('button', { name: `Open ${side} login` }).click();
      await section.locator('input[name=email]').fill('ada@example.com');
      await section.locator('input[name=password]').fill('correct-horse');
      await section.getByRole('button', { name: 'Sign in', exact: true }).click();
      await page.waitForFunction(([entry, count]) => (document.querySelector('[data-testid=outcomes]')?.textContent?.split(',').filter(e => e === entry).length ?? 0) > count, [`${side}:accepted:login`, before]);
    }
    await left.getByRole('button', { name: 'Open left MFA settings' }).click();
    if (await left.locator('.mfa-management').count() !== 0) throw new Error('settings must not open without a signed-in account');
    await signIn(left, 'left');
    await signIn(right, 'right');
    await left.getByRole('button', { name: 'Open left MFA settings' }).click();
    await right.getByRole('button', { name: 'Open right MFA settings' }).click();
    await left.getByText('Reading your account').waitFor();
    if (await left.getByRole('button', { name: 'Turn off' }).count() !== 0) throw new Error('an unread account must not offer Turn off');
    await page.getByRole('button', { name: 'Read left account' }).click();
    await left.getByRole('button', { name: 'Get new recovery codes' }).click();
    await left.getByText('These replace your previous codes').waitFor();
    await page.getByTestId('outcomes').getByText('left:mfa:recoveryCodesRegenerated').waitFor();
    await left.getByRole('button', { name: 'I have saved them' }).click();
    await left.getByRole('button', { name: 'Turn off' }).click();
    await page.getByTestId('outcomes').getByText('left:mfa:reauthenticationRequired:disable').waitFor();
    if (await left.getByText('Nothing was turned off.').count() !== 1) throw new Error('a re-authentication demand must stay visible');
    await left.getByRole('button', { name: "Confirm it's you and retry" }).waitFor();
    // Logging out retires the panel, and the parent's account read and pending
    // retry go with it: the next session starts unread, with no stale prompt.
    await left.getByRole('button', { name: 'Log out left' }).click();
    await left.locator('.mfa-management').waitFor({ state: 'detached' });
    if (await left.getByRole('button', { name: "Confirm it's you and retry" }).count() !== 0) throw new Error('a retry prompt outlived its session');
    await signIn(left, 'left');
    await left.getByRole('button', { name: 'Open left MFA settings' }).click();
    await left.getByText('Reading your account').waitFor();
    if (await left.getByRole('button', { name: "Confirm it's you and retry" }).count() !== 0) throw new Error('a new session inherited the old retry prompt');
    await page.getByRole('button', { name: 'Read left account' }).click();
    await left.getByRole('button', { name: 'Turn off' }).click();
    await page.waitForFunction(() => (document.querySelector('[data-testid=outcomes]')?.textContent?.split(',').filter(e => e === 'left:mfa:reauthenticationRequired:disable').length ?? 0) === 2);
    await left.getByRole('button', { name: "Confirm it's you and retry" }).click();
    await page.getByTestId('outcomes').getByText('left:mfa:disabled').waitFor();
    await left.getByText('Your recovery codes no longer work').waitFor();
    if (await right.getByText('Reading your account').count() !== 1 || await right.getByRole('button', { name: 'Turn off' }).count() !== 0) throw new Error('right MFA settings must stay independent');
    // Enrolment: the codes stay until the user acknowledges them; the parent
    // routes that outcome by closing the enrolment and re-reading the account.
    await left.getByRole('button', { name: 'Open left enrolment' }).click();
    await left.locator('.mfa-enrolment__key').waitFor();
    await left.locator('input[name=code]').fill('123456');
    await left.getByRole('button', { name: 'Turn on authentication' }).click();
    await left.getByText('8fj2-kd91-0aab').waitFor();
    if ((await page.getByTestId('outcomes').textContent())?.includes('left:mfa:enrolmentAcknowledged')) throw new Error('confirmation must not acknowledge the codes');
    await left.getByRole('button', { name: 'I have saved them' }).click();
    await page.getByTestId('outcomes').getByText('left:mfa:enrolmentAcknowledged').waitFor();
    await left.locator('.mfa-enrolment').waitFor({ state: 'detached' });
    await left.getByRole('button', { name: 'Turn off' }).waitFor();
    const mfaOutcomes = await page.getByTestId('outcomes').textContent();
    if ((mfaOutcomes?.match(/left:mfa:disabled/g) ?? []).length !== 1 || mfaOutcomes?.includes('right:mfa')) throw new Error('MFA outcomes must be routed once, to their own section');

    // Connected accounts & account summary: belong to signed-in account.
    // Mount effect reads account once on client; panel truthfully waits without false empty state;
    // disconnect pulses outcome and prunes local unlinked knowledge on account re-read;
    // backend reauthentication requirement stays visible.
    const fetchCallsBefore = await page.evaluate(() => window.__authConsumerCounters?.fetchAccountCalls ?? 0);
    if (fetchCallsBefore !== 0) {
      throw new Error(`expected initial fetchAccountCalls to be 0 before opening connected accounts (got ${fetchCallsBefore})`);
    }
    await left.getByRole('button', { name: 'Open left account' }).click();
    await left.getByRole('button', { name: 'Open left connected accounts' }).click();

    // Truthful wait: panel indicates reading before snapshot resolves
    await left.getByText('Reading your account…').waitFor();
    await left.getByRole('heading', { name: 'Connected accounts' }).waitFor();
    await left.locator('.connected-accounts__name', { hasText: 'GitHub' }).waitFor();
    await left.locator('.connected-accounts__name', { hasText: 'Google' }).waitFor();

    const fetchCallsAfterMount = await page.evaluate(() => window.__authConsumerCounters?.fetchAccountCalls ?? 0);
    if (fetchCallsAfterMount !== 1) {
      throw new Error(`expected fetchAccountCalls to be 1 on mount (got ${fetchCallsAfterMount})`);
    }

    // Right sibling unaffected:
    if (await right.locator('.connected-accounts').count() !== 0) {
      throw new Error('right sibling must not render connected accounts when only left opened');
    }

    // Google disconnect demands re-authentication on first attempt:
    const googleRow = left.locator('li.connected-accounts__row', { hasText: 'Google' });
    await googleRow.getByRole('button', { name: 'Disconnect' }).click();
    await page.getByTestId('outcomes').getByText('left:connectedAccounts:reauthenticationRequired:google:password,totp').waitFor();
    if (await left.getByText('Confirm it is you.').count() !== 1) {
      throw new Error('re-authentication demand must be visible in panel');
    }

    // GitHub disconnect succeeds immediately:
    const githubRow = left.locator('li.connected-accounts__row', { hasText: 'GitHub' });
    await githubRow.getByRole('button', { name: 'Disconnect' }).click();
    await page.getByTestId('outcomes').getByText('left:connectedAccounts:unlinked:github').waitFor();
    await left.locator('li.connected-accounts__row', { hasText: 'GitHub' }).waitFor({ state: 'detached' });

    // Account reload after unlinked outcome makes GitHub available to connect:
    await page.waitForFunction(
      (expected) => (window.__authConsumerCounters?.fetchAccountCalls ?? 0) === expected,
      fetchCallsBefore + 2
    );
    await left.getByRole('button', { name: 'Connect GitHub' }).waitFor();

    // Connecting GitHub uses startOAuthLink with intent: 'link' and redirects to authorize URL:
    await left.getByRole('button', { name: 'Connect GitHub' }).click();
    await page.waitForFunction(() => !!window.__authConsumerLastRedirect);
    const lastRedirect = await page.evaluate(() => window.__authConsumerLastRedirect);
    if (!lastRedirect || !lastRedirect.includes('client_id=demo')) {
      throw new Error(`expected OAuth redirect to authorize URL, got ${lastRedirect}`);
    }

    // Verify stored pending OAuth record has intent: 'link'
    const pendingOAuth = await page.evaluate(() => {
      const raw = sessionStorage.getItem('auth:oauth:pending');
      return raw ? JSON.parse(raw) : null;
    });
    if (!pendingOAuth || pendingOAuth.intent !== 'link' || pendingOAuth.provider !== 'github') {
      throw new Error(`expected pending OAuth with intent: 'link' and provider: 'github', got ${JSON.stringify(pendingOAuth)}`);
    }

    // Closing left connected accounts retires the panel:
    await left.getByRole('button', { name: 'Close left connected accounts' }).click();
    await left.locator('.connected-accounts').waitFor({ state: 'detached' });

    // Prove right sibling independence: right can independently open its own account and connected accounts
    await right.getByRole('button', { name: 'Open right account' }).click();
    await right.getByRole('button', { name: 'Open right connected accounts' }).click();
    await right.getByRole('heading', { name: 'Connected accounts' }).waitFor();
    await right.locator('.connected-accounts__name', { hasText: 'Google' }).waitFor();
    await right.getByRole('button', { name: 'Connect GitHub' }).waitFor();
    await page.waitForFunction(
      () => (window.__authConsumerCounters?.fetchAccountCalls ?? 0) === 3
    );
    const rightFetchCalls = await page.evaluate(() => window.__authConsumerCounters?.fetchAccountCalls ?? 0);
    if (rightFetchCalls !== 3) {
      throw new Error(`expected fetchAccountCalls to be 3 after right account read (got ${rightFetchCalls})`);
    }
    await right.getByRole('button', { name: 'Close right connected accounts' }).click();
    await right.locator('.connected-accounts').waitFor({ state: 'detached' });

    // Magic-link request: submit email -> wait for sent confirmation -> back to sign in
    await page.getByRole('button', { name: 'Reset left' }).click();
    const reqCallsBefore = await page.evaluate(() => window.__authConsumerCounters?.requestMagicLinkCalls ?? 0);
    await left.getByRole('button', { name: 'Open left magic request' }).click();
    await left.locator('.magic-request__input').fill('grace@example.com');
    await left.locator('.magic-request__submit').click();
    await page.getByTestId('outcomes').getByText('left:magicLink:requestSent:grace@example.com').waitFor();
    const reqCallsAfter = await page.evaluate(() => window.__authConsumerCounters?.requestMagicLinkCalls ?? 0);
    if (reqCallsAfter !== reqCallsBefore + 1) throw new Error(`expected requestMagicLinkCalls to increment by 1 (got ${reqCallsAfter - reqCallsBefore})`);
    const reqSentCount = ((await page.getByTestId('outcomes').textContent())?.match(/left:magicLink:requestSent:grace@example.com/g) ?? []).length;
    if (reqSentCount !== 1) throw new Error(`expected exactly 1 requestSent outcome, got ${reqSentCount}`);
    if (await left.locator('.magic-request__body').count() !== 1) throw new Error('sent confirmation must be displayed');
    await left.locator('.magic-request__back').click();
    if (await left.locator('.login-form').count() !== 1) throw new Error('back button must return to login');

    // Magic-link sign-in: token not spent until user clicks -> session established
    await page.getByRole('button', { name: 'Reset left' }).click();
    await left.getByRole('button', { name: 'Open left magic sign-in' }).click();
    await left.locator('.magic-signin').waitFor();

    // Prove zero calls after opening/rendering sign-in and before click in that same page lifecycle:
    const signInCallsBefore = await page.evaluate(() => window.__authConsumerCounters?.signInWithMagicLinkCalls ?? 0);
    if (signInCallsBefore !== 0) throw new Error(`signInWithMagicLink must not be called before click (got ${signInCallsBefore})`);

    // Capture right sibling state before left click
    const rightHtmlBefore = await right.innerHTML();

    await left.locator('.magic-signin__action').click();
    await page.getByTestId('outcomes').getByText('left:accepted:magicLinkSignIn').waitFor();

    // Prove exactly one call after click:
    const signInCallsAfter = await page.evaluate(() => window.__authConsumerCounters?.signInWithMagicLinkCalls ?? 0);
    if (signInCallsAfter !== 1) throw new Error(`signInWithMagicLink must be called exactly once after click (got ${signInCallsAfter})`);

    // Prove exactly one accepted outcome:
    const acceptedCount = ((await page.getByTestId('outcomes').textContent())?.match(/left:accepted:magicLinkSignIn/g) ?? []).length;
    if (acceptedCount !== 1) throw new Error(`expected exactly 1 accepted magicLinkSignIn outcome, got ${acceptedCount}`);

    if (await left.locator('.magic-signin').count() !== 0) throw new Error('accepted magic-link sign-in must retire');

    // Right sibling unaffected:
    const rightHtmlAfter = await right.innerHTML();
    if (rightHtmlAfter !== rightHtmlBefore) throw new Error('right sibling must be unaffected by left magic-link exchange');
    const allOutcomes = await page.getByTestId('outcomes').textContent();
    if (allOutcomes?.includes('right:magicLink') || allOutcomes?.includes('right:accepted:magicLinkSignIn')) {
      throw new Error('right sibling must have no magic-link outcomes');
    }

    // Magic-link missing token: offer fresh link
    await page.getByRole('button', { name: 'Reset left' }).click();
    await left.getByRole('button', { name: 'Open left missing magic sign-in' }).click();
    await left.getByText('Nothing to sign in with').waitFor();
    await left.locator('.magic-signin__action').click();
    await left.locator('.magic-request').waitFor();

    // Change-email request & resend: belongs to signed-in account
    await page.getByRole('button', { name: 'Reset left' }).click();
    await signIn(left, 'left');
    const changeReqCallsBefore = await page.evaluate(() => window.__authConsumerCounters?.requestEmailChangeCalls ?? 0);
    const changeResendCallsBefore = await page.evaluate(() => window.__authConsumerCounters?.resendEmailChangeCalls ?? 0);

    // Open change email
    await left.getByRole('button', { name: 'Open left change email', exact: true }).click();
    await left.locator('.change-email').waitFor();

    // Verify right sibling unaffected
    if (await right.locator('.change-email').count() !== 0) throw new Error('right sibling must not render change email');

    // 1. Submit taken email -> safe taken rendering
    await left.locator('.change-email__input').fill('taken-change@example.com');
    await left.locator('.change-email__submit').click();
    await left.locator('.change-email__taken').waitFor();
    if (await left.locator('.change-email__error').count() !== 0) throw new Error('email_taken must not render as red generic error banner');
    if (!((await left.locator('.change-email__taken').textContent())?.includes('That address already has an account.'))) {
      throw new Error('expected taken explanation in change-email panel');
    }

    // 2. Submit reauth email -> reauthenticationRequired outcome
    await left.locator('.change-email__input').fill('reauth-change@example.com');
    await left.locator('.change-email__submit').click();
    await page.getByTestId('outcomes').getByText('left:changeEmail:reauthenticationRequired:password').waitFor();

    // 3. Submit valid new email -> requested outcome & pending state
    await left.locator('.change-email__input').fill('new-email@example.com');
    await left.locator('.change-email__submit').click();
    await page.getByTestId('outcomes').getByText('left:changeEmail:requested:new-email@example.com').waitFor();
    await left.locator('.change-email__pending').waitFor();
    if (!((await left.locator('.change-email__pending').textContent())?.includes('new-email@example.com'))) {
      throw new Error('pending email confirmation must be visible in change-email panel');
    }

    // Call count verified
    const changeReqCallsAfter = await page.evaluate(() => window.__authConsumerCounters?.requestEmailChangeCalls ?? 0);
    if (changeReqCallsAfter !== changeReqCallsBefore + 3) {
      throw new Error(`expected 3 requestEmailChange calls, got ${changeReqCallsAfter - changeReqCallsBefore}`);
    }

    // 4. Resend confirmation
    await left.locator('.change-email__secondary').click();
    await page.getByTestId('outcomes').getByText('left:changeEmail:resent').waitFor();
    await left.getByText('Sent again.').waitFor();
    const changeResendCallsAfter = await page.evaluate(() => window.__authConsumerCounters?.resendEmailChangeCalls ?? 0);
    if (changeResendCallsAfter !== changeResendCallsBefore + 1) {
      throw new Error(`expected 1 resendEmailChange call, got ${changeResendCallsAfter - changeResendCallsBefore}`);
    }

    // 5. Replay pulse prevention: unrelated action must not replay change-email outcomes
    await left.getByRole('button', { name: 'Open left change email', exact: true }).click();
    const requestedCount = ((await page.getByTestId('outcomes').textContent())?.match(/left:changeEmail:requested:new-email@example.com/g) ?? []).length;
    if (requestedCount !== 1) throw new Error(`unrelated auth action replayed changeEmail:requested (count: ${requestedCount})`);
    const resentCount = ((await page.getByTestId('outcomes').textContent())?.match(/left:changeEmail:resent/g) ?? []).length;
    if (resentCount !== 1) throw new Error(`unrelated auth action replayed changeEmail:resent (count: ${resentCount})`);

    // Change-email confirmation:
    // 6. Valid confirmation with signed-in session -> preserves session, pulses confirmed outcome
    const confirmCallsBefore = await page.evaluate(() => window.__authConsumerCounters?.confirmEmailChangeCalls ?? 0);
    await left.getByRole('button', { name: 'Open left change email confirm', exact: true }).click();
    await page.getByTestId('outcomes').getByText('left:changeEmailConfirm:confirmed:confirmed-email@example.com').waitFor();
    await left.getByText('Done — your account now uses confirmed-email@example.com.').waitFor();
    const confirmCallsAfter = await page.evaluate(() => window.__authConsumerCounters?.confirmEmailChangeCalls ?? 0);
    if (confirmCallsAfter !== confirmCallsBefore + 1) {
      throw new Error(`expected 1 confirmEmailChange call, got ${confirmCallsAfter - confirmCallsBefore}`);
    }
    // Verify subject is still signed in (session preserved!)
    const subjectAfterConfirm = await page.getByTestId('left-subject').textContent();
    if (!subjectAfterConfirm || subjectAfterConfirm === 'none') {
      throw new Error('signed-in confirmation must preserve current session subject');
    }

    // 7. Restart with expired token confirmation -> error banner and failed outcome
    await left.getByRole('button', { name: 'Restart left expired change email confirm' }).click();
    await page.getByTestId('outcomes').getByText('left:changeEmailConfirm:failed:token_expired').waitFor();
    await left.getByText('That link is no longer valid.').waitFor();

    // 8. Signed-out confirmation with 401 invalid_credentials -> offers sign-in route
    await left.getByRole('button', { name: 'Close left change email confirm', exact: true }).click();
    await left.getByRole('button', { name: 'Log out left' }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid=left-subject]')?.textContent === 'none');

    await left.getByRole('button', { name: 'Open left unauthorized change email confirm' }).click();
    await page.getByTestId('outcomes').getByText('left:changeEmailConfirm:failed:invalid_credentials').waitFor();
    await left.getByText('Sign in first, then follow the link again').waitFor();
    await left.getByRole('button', { name: 'Sign in', exact: true }).click();
    if (await left.locator('.login-form').count() !== 1) {
      throw new Error('signed-out confirmation 401 must offer usable route to sign in');
    }

    // 9. Missing token confirmation -> truthful instruction, zero network calls
    await left.getByRole('button', { name: 'Dismiss login' }).click();
    if (await left.locator('.login-form').count() !== 0) throw new Error('sign-in form must retire on cancel');

    const confirmCallsBeforeMissing = await page.evaluate(() => window.__authConsumerCounters?.confirmEmailChangeCalls ?? 0);
    await left.getByRole('button', { name: 'Open left missing change email confirm' }).click();
    await left.getByText('This page needs the link from the email we sent you.').waitFor();
    const confirmCallsAfterMissing = await page.evaluate(() => window.__authConsumerCounters?.confirmEmailChangeCalls ?? 0);
    if (confirmCallsAfterMissing !== confirmCallsBeforeMissing) {
      throw new Error(`missing token must not initiate confirmEmailChange (calls went from ${confirmCallsBeforeMissing} to ${confirmCallsAfterMissing})`);
    }

    // Also verify restartChangeEmailConfirm works cleanly
    await left.getByRole('button', { name: 'Restart left missing change email confirm' }).click();
    await left.getByText('This page needs the link from the email we sent you.').waitFor();

    // Clean up change-email flows on left
    await left.getByRole('button', { name: 'Close left change email', exact: true }).click();
    await left.getByRole('button', { name: 'Close left change email confirm', exact: true }).click();

    // Verify right sibling remained isolated throughout
    const finalOutcomes = await page.getByTestId('outcomes').textContent();
    if (finalOutcomes?.includes('right:changeEmail')) {
      throw new Error('right sibling must have no change-email outcomes');
    }

    // Sign back in on left to test settings flows
    await left.getByRole('button', { name: 'Open left login' }).click();
    await left.locator('input[name=email]').fill('ada@example.com');
    await left.locator('input[name=password]').fill('correct-horse');
    await left.getByRole('button', { name: 'Sign in' }).click();
    await page.getByTestId('outcomes').getByText('left:accepted:login').waitFor();

    // Change Password
    const changePassCallsBefore = await page.evaluate(() => window.__authConsumerCounters?.changePasswordCalls ?? 0);
    await left.getByRole('button', { name: 'Open left change password', exact: true }).click();
    await left.locator('.change-password').waitFor();
    if (await right.locator('.change-password').count() !== 0) throw new Error('right sibling must not render change password');

    // 1. Submit reauth password -> reauthenticationRequired outcome
    await left.locator('input[name=password]').fill('reauth-pass-1234');
    await left.locator('input[name=confirmPassword]').fill('reauth-pass-1234');
    await left.locator('.change-password__submit').click();
    await page.getByTestId('outcomes').getByText('left:changePassword:reauthenticationRequired:password').waitFor();

    // 2. Submit valid password -> changed:retained outcome & cleared fields
    await left.locator('input[name=password]').fill('new-password-1234');
    await left.locator('input[name=confirmPassword]').fill('new-password-1234');
    await left.locator('.change-password__submit').click();
    await page.getByTestId('outcomes').getByText('left:changePassword:changed:retained').waitFor();
    await left.getByText('Your password is set.').waitFor();
    if (await left.locator('input[name=password]').inputValue() !== '') throw new Error('password field must be cleared after change');

    // 3. Submit mismatch rotated session password -> rejected:subjectMismatch outcome, subject unchanged
    await left.locator('input[name=password]').fill('mismatch-pass-1234');
    await left.locator('input[name=confirmPassword]').fill('mismatch-pass-1234');
    await left.locator('.change-password__submit').click();
    await page.getByTestId('outcomes').getByText('left:changePassword:rejected:subjectMismatch').waitFor();
    const unchangedSubject = await page.getByTestId('left-subject').textContent();
    if (unchangedSubject !== '00000000-0000-4000-8000-000000000001') throw new Error(`expected subject 00000000-0000-4000-8000-000000000001, got ${unchangedSubject}`);

    // 4. Submit same-subject rotated session password -> changed:rotated outcome, unchanged subject & updated display name
    await left.locator('input[name=password]').fill('rotated-pass-1234');
    await left.locator('input[name=confirmPassword]').fill('rotated-pass-1234');
    await left.locator('.change-password__submit').click();
    await page.getByTestId('outcomes').getByText('left:changePassword:changed:rotated').waitFor();
    const rotatedSubject = await page.getByTestId('left-subject').textContent();
    if (rotatedSubject !== '00000000-0000-4000-8000-000000000001') throw new Error(`expected subject 00000000-0000-4000-8000-000000000001, got ${rotatedSubject}`);
    const rotatedDisplayName = await page.getByTestId('left-display-name').textContent();
    if (rotatedDisplayName !== 'Ada Lovelace (Rotated)') throw new Error(`expected display name Ada Lovelace (Rotated), got ${rotatedDisplayName}`);

    const changePassCallsAfter = await page.evaluate(() => window.__authConsumerCounters?.changePasswordCalls ?? 0);
    if (changePassCallsAfter !== changePassCallsBefore + 4) {
      throw new Error(`expected 4 changePassword calls, got ${changePassCallsAfter - changePassCallsBefore}`);
    }

    await left.getByRole('button', { name: 'Close left change password', exact: true }).click();

    // Delete Account
    const deleteCallsBefore = await page.evaluate(() => window.__authConsumerCounters?.deleteAccountCalls ?? 0);
    await left.getByRole('button', { name: 'Open left delete account', exact: true }).click();
    await left.locator('.delete-account').waitFor();
    if (await right.locator('.delete-account').count() !== 0) throw new Error('right sibling must not render delete account');

    // 1. Confirmation gate: clicking Delete my account enters confirming state
    await left.getByRole('button', { name: 'Delete my account' }).click();
    await left.getByText('Are you sure? There is no way back from this.').waitFor();

    // Dismiss confirmation returns to idle
    await left.getByRole('button', { name: 'Keep my account' }).click();
    await left.getByRole('button', { name: 'Delete my account' }).waitFor();
    const deleteCallsDismissed = await page.evaluate(() => window.__authConsumerCounters?.deleteAccountCalls ?? 0);
    if (deleteCallsDismissed !== deleteCallsBefore) throw new Error('dismissed confirmation must not call deleteAccount');

    // 2. Reauth demand on deletion: first attempt rejects with reauth
    await left.getByRole('button', { name: 'Delete my account' }).click();
    await left.getByRole('button', { name: 'Delete permanently' }).click();
    await page.getByTestId('outcomes').getByText('left:deleteAccount:reauthenticationRequired:password').waitFor();
    await left.getByRole('button', { name: 'Delete my account' }).waitFor();

    // 3. Successful deletion: second attempt succeeds -> deleted outcome and anonymous session
    await left.getByRole('button', { name: 'Delete my account' }).click();
    await left.getByRole('button', { name: 'Delete permanently' }).click();
    await page.getByTestId('outcomes').getByText('left:deleteAccount:deleted').waitFor();
    const subjectAfterDelete = await page.getByTestId('left-subject').textContent();
    if (subjectAfterDelete !== 'none') throw new Error(`expected anonymous subject after delete, got ${subjectAfterDelete}`);
    if (await left.locator('.delete-account').count() !== 0) throw new Error('deleted account panel must retire');
    await page.getByTestId('left-guard-anonymous').waitFor();

    const deleteCallsAfter = await page.evaluate(() => window.__authConsumerCounters?.deleteAccountCalls ?? 0);
    if (deleteCallsAfter !== deleteCallsBefore + 2) {
      throw new Error(`expected 2 deleteAccount calls, got ${deleteCallsAfter - deleteCallsBefore}`);
    }

    // Verify right sibling remained unaffected throughout
    const finalOutcomesAfterAll = await page.getByTestId('outcomes').textContent();
    if (finalOutcomesAfterAll?.includes('right:changePassword') || finalOutcomesAfterAll?.includes('right:deleteAccount')) {
      throw new Error('right sibling must have no change-password or delete-account outcomes');
    }

    // Session Refresh: belongs to signed-in account
    // Start from a fresh page/mock lifecycle so deleted-account state from earlier deleteAccount test does not pollute session refresh
    await page.goto(address);
    await page.getByRole('button', { name: 'Open left login' }).waitFor({ timeout: 60000 });
    const freshLeft = page.getByTestId('left-auth');
    await signIn(freshLeft, 'left');
    const expiryBefore = await page.getByTestId('left-expiry').textContent();
    const refreshCallsBefore = await page.evaluate(() => window.__authConsumerCounters?.refreshSessionCalls ?? 0);
    await freshLeft.getByRole('button', { name: 'Open left session refresh' }).click();
    if (await freshLeft.getByTestId('session-refresh-slot').count() !== 1) {
      throw new Error('expected session-refresh-slot to be mounted');
    }

    // Request refresh manually:
    await freshLeft.getByRole('button', { name: 'Request left refresh' }).click();
    await page.getByTestId('outcomes').getByText('left:sessionRefresh:refreshed:').waitFor();

    const expiryAfter = await page.getByTestId('left-expiry').textContent();
    if (!expiryAfter || expiryAfter === 'none' || expiryAfter === expiryBefore) {
      throw new Error(`expected truthful expiry propagation, before=${expiryBefore}, after=${expiryAfter}`);
    }

    // Assert outcome carries the exact new expiry and matches parent output:
    const outcomesText = await page.getByTestId('outcomes').textContent();
    if (!outcomesText?.includes(`left:sessionRefresh:refreshed:${expiryAfter}`)) {
      throw new Error(`expected outcome to carry exact new expiry ${expiryAfter}, got: ${outcomesText}`);
    }

    const refreshCallsAfter = await page.evaluate(() => window.__authConsumerCounters?.refreshSessionCalls ?? 0);
    if (refreshCallsAfter !== refreshCallsBefore + 1) {
      throw new Error(`expected refreshSessionCalls to increment by 1, got ${refreshCallsAfter - refreshCallsBefore}`);
    }

    // Verify right sibling unaffected:
    const refreshOutcomes = await page.getByTestId('outcomes').textContent();
    if (refreshOutcomes?.includes('right:sessionRefresh')) {
      throw new Error('right sibling must have no sessionRefresh outcomes');
    }

    // Restart left session refresh (observable via slot remaining mounted and accepting refresh on replacement owner):
    await freshLeft.getByRole('button', { name: 'Restart left session refresh' }).click();
    if (await freshLeft.getByTestId('session-refresh-slot').count() !== 1) {
      throw new Error('expected session-refresh-slot to remain mounted after restart');
    }
    await freshLeft.getByRole('button', { name: 'Request left refresh' }).click();
    const refreshCallsAfterRestart = await page.evaluate(() => window.__authConsumerCounters?.refreshSessionCalls ?? 0);
    if (refreshCallsAfterRestart !== refreshCallsAfter + 1) {
      throw new Error(`expected restarted session refresh to accept refresh request, got ${refreshCallsAfterRestart - refreshCallsAfter}`);
    }

    // Close left session refresh (observable via unmounting slot from DOM):
    await freshLeft.getByRole('button', { name: 'Close left session refresh' }).click();
    if (await freshLeft.getByTestId('session-refresh-slot').count() !== 0) {
      throw new Error('expected session-refresh-slot to unmount after close');
    }

    await page.goto(`${address}index-controlled.html`);
    const controlledLeft = page.getByTestId('left-auth');
    await controlledLeft.getByRole('button', { name: 'Log out left' }).click();
    await controlledLeft.getByRole('button', { name: 'Open left login' }).click();
    await controlledLeft.locator('input[name=email]').fill('ada@example.com');
    await controlledLeft.locator('input[name=password]').fill('correct-horse');
    await controlledLeft.getByRole('button', { name: 'Sign in' }).click();
    await page.getByTestId('outcomes').getByText('left:refused:login').waitFor();
    if (await controlledLeft.locator('form').count() !== 0) throw new Error('refused flow must retire');
    const controlledRight = page.getByTestId('right-auth');
    await controlledRight.getByRole('button', { name: 'Open right signup' }).click();
    await controlledRight.locator('input[name=email]').fill('grace@example.com');
    await controlledRight.locator('input[name=password]').fill('correct-horse-battery-staple');
    await controlledRight.locator('input[name=confirmPassword]').fill('correct-horse-battery-staple');
    await controlledRight.getByRole('button', { name: 'Create account' }).click();
    await page.getByTestId('outcomes').getByText('right:accepted:signup').waitFor();
    if (await controlledRight.locator('form').count() !== 0) throw new Error('accepted signup must retire');
    await controlledRight.getByRole('button', { name: 'Open right reset' }).click();
    await controlledRight.locator('input[name=password]').fill('correct-horse-battery-staple');
    await controlledRight.locator('input[name=confirmPassword]').fill('correct-horse-battery-staple');
    await controlledRight.getByRole('button', { name: 'Set new password' }).click();
    await page.getByTestId('outcomes').getByText('right:accepted:resetPassword').waitFor();
    if (await controlledRight.locator('form').count() !== 0) throw new Error('accepted reset must retire');
    await controlledRight.getByRole('button', { name: 'Open right verification' }).click();
    await page.getByTestId('outcomes').getByText('right:accepted:emailVerification').waitFor();
    if (await controlledRight.locator('.email-verification').count() !== 0) throw new Error('accepted verification must retire');
    await page.evaluate(() => window.__authConsumerReleaseLogout?.());
    await page.goto(`${address}index-expired.html`);
    const expiredLeft = page.getByTestId('left-auth');
    await expiredLeft.getByRole('button', { name: 'Open left verification' }).click();
    await expiredLeft.getByText('That link did not work').waitFor();
    await expiredLeft.getByRole('button', { name: 'Send another link' }).click();
    await page.getByTestId('outcomes').getByText('left:verificationResent').waitFor();
    if (await expiredLeft.getByText('That link did not work').count() !== 1) throw new Error('resend must not erase the expired-link error');
    if (errors.length) throw new Error(`page errors: ${errors.join('; ')}`);
    console.log('Installed nested browser proof passed');
  } finally { await browser.close(); }
} finally { server.kill('SIGTERM'); }
