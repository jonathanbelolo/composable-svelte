# Independent Opus 5.5 recovery review

Claude Code CLI; high effort; normal read-only tool access; parent task approval.

**Verdict: the change looks correct. I found no correctness defects that block it.** I only read the diff and the files around it. I didn't run anything, so this rests on reading the code plus the lane's own reported results (761 Chromium, 38 SSR, svelte-check 0/0, consumer installs at Svelte 5.20.0 and 5.55.3).

**What holds up:**
- **Managed view:** both forms follow the same pattern as `SignupForm`/`LoginForm`. There's a `StandaloneBinding | ManagedBinding` union with `...binding` rest props. `managedFormStore` keeps the last form state, and `{#key formOwner}` remounts the form when the owner changes. `{#if flow}` hides the form once the owner retires.
- **Standalone behaviour is preserved.** Standalone still uses the `onSent`, `tokenProvided`, `sessionEstablished`/`onSuccess`, `onSignIn` and `onRequestNewLink` paths, and all of them are skipped in managed mode. `token` still defaults to `null`, and `effectiveToken = token ?? heldToken` still works on the server before any client effect runs.
- **Reset handoff:** `reduceResetPasswordResult` hands over only when `status === 'reset'` and the session is the same object the reducer just stored. `handOver` then clears every flow whether the handoff is accepted or refused (`loggingOut`), the same as login.
- **Reset without a session** stays on its final panel with no handoff. The parent can route from `resetSucceeded` plus `status`, as the consumer's `model.ts` does.
- **"Request a new link"** starts a fresh `forgotPassword` flow, and `forgotPasswordReplaced` covers it. **"Sign in"** from either flow starts a fresh `login`, and `isRecoverySignIn` covers it.
- **Flow ownership and lifetime:** `noFlows` and `hasLiveFlow` include both new slots, so logout, cancel and every `restart*` retire them.
- **Repeated "request sent":** the flow stays live, and the parent checks `requestedFor` against the routed email.
- **Type-level props check:** the `@ts-expect-error` cases reject `onSent`, spreading `sessionStore` in, and `onRequestNewLink` in managed mode.

**Low-severity items worth fixing:**
1. **`feature.ts` ~392–398:** the reset flow accepts `requestNewLinkRequested` and `signInRequested` whatever its status. A stray dispatch while a request is in flight would remove the flow and drop the result. The form only shows those buttons in the right states, so this is hardening, not a live bug. A guard would be: dead link for a new link, and `reset` with no session for sign-in.
2. **`ForgotPasswordForm.svelte` ~467–469:** in managed mode the "Back to sign in" button:
   - has hard-coded English text and no label prop;
   - has no class, unlike `reset-form__action`, so it renders unstyled;
   - always renders, even next to a `footer` that the prop's own doc says holds "back to sign in", so a consumer can end up with two.
3. **Behaviour change (as documented):** while a forgot-password flow stays open after "request sent", `openLogin`, `openSignup` and `openResetPassword` are refused. A parent has to use `restart*` or the in-form button. The README should say this.
4. **Nit:** the doc comment on `authFeatureCore` (~line 187) still says "Runs after the login, MFA and signup slots".

These notes are also saved in the plan file at `~/.claude/plans/independent-read-only-opus-5-5-hashed-stroustrup.md`.
