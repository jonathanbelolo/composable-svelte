/**
 * @vitest-environment node
 *
 * State goes into a `<script>` element, and a `</script>` in it used to close
 * that element early.
 *
 * `renderToHTML` and `buildHydrationScript` both embedded the serialized store
 * raw. `escapeHtml` sat in the same file and was applied to the page title and
 * the client-script src — never to the state. So a state value carrying
 * `</script><img src=x onerror=…>` closed the tag and the rest was parsed as
 * markup: stored XSS, reachable through any state field a user influences — a
 * display name, a search term, a URL parameter.
 *
 * The arm that matters most here is the round-trip one. `escapeHtml` is the
 * obvious fix and it is the wrong one: inside a script element the HTML parser
 * does not decode entities, so `&lt;` would reach `JSON.parse` literally and
 * hydration would break instead. Only an escape that survives `JSON.parse` —
 * `<` — fixes the hole without opening another.
 */

import { describe, it, expect, vi } from 'vitest';

import { renderToHTML, buildHydrationScript } from '../../src/lib/ssr/render';
import { serializeState } from '../../src/lib/ssr/serialize';
import { hydrateStore, parseState } from '../../src/lib/ssr/hydrate';
import { createTaggedSerializer } from '../../src/lib/ssr/serializer';
import { createStore } from '../../src/lib/store.svelte';
import { Effect } from '../../src/lib/effect';
import type { Reducer } from '../../src/lib/types';

vi.mock('svelte/server', () => ({
  render: vi.fn(() => ({ body: '<div>body</div>', head: '<title>head</title>' }))
}));

interface State {
  title: string;
}
type Action = { type: 'noop' };

const reducer: Reducer<State, Action> = (state) => [state, Effect.none()];

function storeWith(title: string) {
  return createStore<State, Action>({ initialState: { title }, reducer });
}

/** The JSON between the state script's tags. */
function embeddedJSON(html: string): string {
  const match = /<script id="__COMPOSABLE_SVELTE_STATE__" type="application\/json">([\s\S]*?)<\/script>/.exec(
    html
  );
  if (match === null) throw new Error('no state script found');
  return match[1]!;
}

/** Both embed sites, so neither can be fixed while the other is left open. */
const SITES: ReadonlyArray<{ name: string; render: (title: string) => string }> = [
  { name: 'renderToHTML', render: (t) => renderToHTML({} as never, { store: storeWith(t) }) },
  { name: 'buildHydrationScript', render: (t) => buildHydrationScript(storeWith(t)) }
];

/**
 * Sequences that move the HTML tokenizer out of script-data state.
 *
 * `</script` is the one that gets exploited; `<script` and `<!--` are the other
 * two the spec names, and they are here because a fix that special-cases only
 * the first leaves a hole the same shape.
 */
const BREAKOUTS = ['</script><img src=x onerror=alert(1)>', '<script>alert(1)</script>', '<!--<script>'];

describe.each(SITES)('$name embeds state that cannot break out', ({ render }) => {
  it.each(BREAKOUTS)('neutralises %j', (payload) => {
    // Non-vacuity: the payload must really be in the state, or this asserts
    // nothing at all. A typo in the fixture would otherwise read as a pass.
    const store = storeWith(payload);
    expect(store.state.title).toContain('<');

    const html = render(payload);

    // One closing tag per state script. Two means the payload wrote one.
    expect(html.match(/<\/script/gi) ?? []).toHaveLength(
      (html.match(/<script/gi) ?? []).length
    );
    expect(html).not.toContain(payload);
  });

  it('round-trips the original string exactly', () => {
    // The arm `escapeHtml` fails. `&lt;` would satisfy every assertion above
    // and then break hydration, because a script element's contents are not
    // entity-decoded before `JSON.parse` sees them.
    const payload = '</script>&<>"   done';
    const parsed = JSON.parse(embeddedJSON(render(payload))) as State;
    expect(parsed.title).toBe(payload);
  });

  it('leaves benign state readable', () => {
    const parsed = JSON.parse(embeddedJSON(render('ordinary'))) as State;
    expect(parsed.title).toBe('ordinary');
  });
});

describe('a serializer reaches every site on the round trip', () => {
	// There are four ways state goes out — `serializeState`, `serializeStore`,
	// `buildHydrationScript` and `renderToHTML` (which calls `serializeStore`
	// and must forward) — and two ways it comes back: `parseState`, and
	// `hydrateStore`, which inlines its own `JSON.parse` rather than calling
	// `parseState`. A serializer wired into some of them and not others writes
	// tags nothing untags, which is worse than not tagging at all.

	interface Dated {
		at: Date;
	}
	const datedReducer: Reducer<Dated, Action> = (state) => [state, Effect.none()];
	const AT = new Date('2026-01-01T00:00:00.000Z');

	function datedStore() {
		return createStore<Dated, Action>({ initialState: { at: AT }, reducer: datedReducer });
	}

	it('renderToHTML forwards it to serializeStore', () => {
		const html = renderToHTML({} as never, { store: datedStore() }, {
			serializer: createTaggedSerializer()
		});

		const parsed = JSON.parse(embeddedJSON(html)) as { at: unknown };
		expect(parsed.at).toEqual({ __composableType: 'Date', value: AT.toISOString() });
	});

	it('buildHydrationScript forwards it', () => {
		const html = buildHydrationScript(datedStore(), createTaggedSerializer());
		const parsed = JSON.parse(embeddedJSON(html)) as { at: unknown };
		expect(parsed.at).toEqual({ __composableType: 'Date', value: AT.toISOString() });
	});

	it('hydrateStore applies the reviver, despite parsing for itself', () => {
		// The asymmetry arm. `hydrateStore` does not call `parseState`, so wiring
		// only the latter would pass every test above and still hand a real app a
		// tag wrapper where it expects a Date.
		const serializer = createTaggedSerializer();
		const json = buildHydrationScript(datedStore(), serializer);

		const hydrated = hydrateStore<Dated, Action>(embeddedJSON(json), {
			reducer: datedReducer,
			serializer
		});

		expect(hydrated.state.at).toBeInstanceOf(Date);
		expect(hydrated.state.at.getTime()).toBe(AT.getTime());
	});

	it('composes with the script escape', () => {
		// The two features meet in one string: a tagged value beside a payload
		// that would close the script tag.
		const serializer = createTaggedSerializer();
		interface Both {
			at: Date;
			note: string;
		}
		const reducer: Reducer<Both, Action> = (state) => [state, Effect.none()];
		const store = createStore<Both, Action>({
			initialState: { at: AT, note: '</script><img src=x>' },
			reducer
		});

		const html = renderToHTML({} as never, { store }, { serializer });
		expect(html.match(/<\/script/gi) ?? []).toHaveLength((html.match(/<script/gi) ?? []).length);

		const back = parseState<Both>(embeddedJSON(html), serializer);
		expect(back.at).toBeInstanceOf(Date);
		expect(back.note).toBe('</script><img src=x>');
	});
});

describe('renderToHTML fails closed on a state it cannot serialize (SS7)', () => {
	// The first form logged and embedded `{}`, so the client hydrated a blank
	// store; buildHydrationScript threw for the same state.
	function storeOf(state: unknown) {
		return createStore<unknown, Action>({ initialState: state as never, reducer: ((s: unknown) => [s, Effect.none()]) as never });
	}

	it('a BigInt in the state throws, and produces no page', () => {
		const store = storeOf({ big: 10n });
		expect(() => renderToHTML({} as never, { store })).toThrow(/not serializable/);
		expect(() => buildHydrationScript(store)).toThrow(/not serializable/);
	});

	it('a root with no JSON form throws a typed error, not a TypeError from the escape', () => {
		const store = storeOf(() => 1);
		expect(() => renderToHTML({} as never, { store })).toThrow(/no JSON form/);
		expect(() => buildHydrationScript(store)).toThrow(/no JSON form/);
	});

	it('serializeState throws the same typed error for a root with no JSON form', () => {
		expect(() => serializeState(() => 1)).toThrow(/no JSON form/);
		expect(() => serializeState(Symbol('s'))).toThrow(/no JSON form/);
	});
});

