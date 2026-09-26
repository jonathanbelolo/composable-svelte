# npm dist-tag web authentication investigation

Confirmed offline, without live authentication, registry writes, real credentials, or browser interaction.

npm 11.15.0 (npm-profile 12.0.1) and the official npm 11.20.0 tarball (npm-profile 12.0.2) both have this call chain:

1. dist-tag constructs request options with method PUT and a JSON version body.
2. otplease passes those options into webAuthOpener after EOTP.
3. webAuthOpener forwards them to webAuthCheckLogin.
4. webAuthCheckLogin calls fetch(doneUrl, opts) without overriding method or body.

The completion check therefore inherits PUT and the version body. The function itself labels unsuccessful completion checks as GET in WebLoginInvalidResponse, supporting the intended GET semantics. This is a concrete request-option propagation defect. Upgrading to 11.20.0 does not correct it.

OFFLINE-PROOF.json records four passing cases using the real module source with a mocked fetch: both unmodified versions poll with PUT/body; both versions with the narrow correction poll with GET/no body. The original mutation options remain PUT/body. The mock does not contact a server and uses only a synthetic in-memory response.

Smallest verified correction, in webAuthCheckLogin only:

    const res = await fetch(doneUrl, { ...opts, method: 'GET', body: undefined })

The actual authenticated dist-tag retry must retain its original method and body. No operational npm installation was patched. This is a proposed correction, not a completed release retry.

The defect plausibly explains an approved browser challenge not being consumed correctly. It does not by itself prove the cause of the observed E429 on the dist-tag endpoint; server throttling and challenge validity remain unobserved.

Existing approval: a still-valid completion URL could in principle return the result for its already approved challenge when polled correctly. However the original process exited, and the normal CLI path inspected has no persisted/resumable challenge mechanism. A new invocation ordinarily creates another challenge. We cannot promise reuse without inspecting or contacting live authentication state, which this investigation deliberately did not do. No supported no-new-approval recovery was verified. Browser remembering authentication also cannot repair the wrong HTTP method.

Primary source references:
- https://github.com/npm/cli/blob/v11.20.0/lib/commands/dist-tag.js
- https://github.com/npm/cli/blob/v11.20.0/lib/utils/auth.js
- https://registry.npmjs.org/npm/-/npm-11.20.0.tgz (inspected source; SHA256 d1a92f40e6c407b84c3a00c3cf978a10b24fd42f153c527e2016cef7bb34a483)
- https://github.com/npm/npm-profile/blob/main/CHANGELOG.md (a done-check origin fix is listed; that is distinct from method/body inheritance; no verified upstream fix for this defect found)

Release state supplied by parent: all nine versions published and registry-verification PASSED; only Core latest promoted. Remaining tag mutations are stopped.
