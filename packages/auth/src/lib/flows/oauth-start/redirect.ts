/**
 * Leaving this page.
 *
 * The only full-page navigation in the repository — nothing else in any package
 * calls `location.assign`, `location.href =` or `window.open`, and core's
 * routing is `history.pushState`, which cannot cross an origin at all
 * (`pushState` throws `SecurityError` on a foreign one). So this had to be
 * written rather than reused.
 *
 * It is a **dependency** and not a bare call for two concrete reasons, neither
 * of them ceremony: a `TestStore` can assert *where* the user was sent, which is
 * otherwise unobservable; and the styleguide demo can substitute one that shows
 * the authorize URL instead of navigating, which is the only way that demo can
 * exist at all.
 */

/**
 * Go to `url`. Nothing comes back — by the time this returns, or shortly after,
 * the document is being torn down.
 */
export type Redirect = (url: string) => void;

/**
 * The browser implementation.
 *
 * `location.assign`, not `location.href =`. Identical behaviour, but a named
 * method is greppable and stubbable, and this is the one line worth being able
 * to find.
 *
 * **Touches no `window` at construction**, so it can sit at module scope beside
 * `createHttpAuthDeps()` in a file that also renders on a server.
 */
export function createBrowserRedirect(): Redirect {
	return (url: string) => {
		// Checked again here, though `decodeOAuthStart` already refused anything
		// that is not http(s). That check protects the HTTP adapter's callers; this
		// one protects everyone else, because `beginOAuth` is an injected
		// dependency and a hand-written adapter is under no obligation to
		// validate. A `javascript:` URL reaching `assign` is script execution in
		// the app's own origin, so it is worth two lines in both places.
		let parsed: URL;
		try {
			parsed = new URL(url);
		} catch {
			throw new TypeError(`redirect: ${url} is not a URL`);
		}
		if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
			throw new TypeError(`redirect: refusing to navigate to ${parsed.protocol}`);
		}
		window.location.assign(url);
	};
}
