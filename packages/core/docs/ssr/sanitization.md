# HTML sanitization and return modes

Import `sanitizeHTML`, `createSanitizer` and `defaultSanitizeOptions` from `@composable-svelte/core/ssr/sanitize`. Install its optional `isomorphic-dompurify` peer when using this entry point.

The default result is a string. Literal `RETURN_DOM: true` returns an element and `RETURN_DOM_FRAGMENT: true` returns a fragment, including for empty input. Fragment mode takes precedence over element mode, and both take precedence over Trusted Types. Spread `defaultSanitizeOptions` when adding a custom peer config if you want to retain its tag/attribute allowlist.

With `allowDataUri` omitted or false, the wrapper removes data URLs from its supported URL attributes after peer sanitization. `data-*` attributes remain disabled by default; an explicit `ALLOW_DATA_ATTR: true` enables those independently. CSS, srcdoc and meta-refresh parsing are outside this URL-attribute policy. Do not widen those allowlists without an application policy for them.

For filtered TrustedHTML output, set `RETURN_TRUSTED_TYPE: true` and supply your existing application-approved policy through `TRUSTED_TYPES_POLICY`. The policy must provide `createHTML` and `createScriptURL`. Its `createHTML` return type is preserved by both helpers. The wrapper does not create a CSP policy or sanitize a second time. Without an explicit policy this combination throws before the peer runs, even for empty input.

When `allowDataUri: true`, the wrapper delegates directly to the peer once. This permits only the data URLs the peer itself accepts; it does not bypass peer safety rules. Native Trusted Types output without an explicit policy has type `unknown`, since the optional peer may return a string or a value produced by its private policy. Supply an explicit policy when an exact result type is needed. Do not enable data URLs merely to suppress the missing-policy diagnostic.

A broadly typed dynamic `SanitizeOptions` config also has an `unknown` result: its flags cannot establish one return type. Use concrete mode flags or `StringSanitizeOptions` for code that specifically needs a string. DOM modes are no longer misleadingly declared as strings.

DOMPurify uses shared internal config during sanitization. Calling either wrapper recursively from a shared peer hook is unsupported and throws before the nested call can change peer state. The wrapper guard is released on success or exception. Caller hooks are neither installed nor removed by the wrapper. An unsupported environment, or a peer that fails to return the required DOM node, produces an explicit error rather than unsanitized passthrough.

## Migration from the earlier wrapper

Filtered `RETURN_TRUSTED_TYPE` calls that previously relied on the peer's private default policy now require an explicit application policy. This prevents duplicate named-property prefixes and duplicate hook execution from re-sanitizing output. Nested wrapper calls inside peer hooks must be moved outside the sanitization call. Empty input now follows its requested return mode. Consumers that treated DOM results or dynamically configured results as strings must update their annotations or select string mode explicitly.
