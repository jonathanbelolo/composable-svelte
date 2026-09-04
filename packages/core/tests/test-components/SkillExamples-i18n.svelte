<script lang="ts">
	/**
	 * The component examples from `.claude/skills/composable-svelte-i18n/SKILL.md`,
	 * verbatim.
	 *
	 * `doc-typecheck` compiles the `<script>` body of a svelte fence and says so —
	 * markup expressions are out of its scope. This file is the markup half, and
	 * it is typechecked because `svelte-check` reads every `.svelte` under `tests`.
	 * `tests/repo/skill-examples.test.ts` checks that each fence's markup is still
	 * a substring of this file.
	 *
	 * `post`, `price`, `yesterday`, `user` and `product` are the values the
	 * examples format without ever declaring; they are props here.
	 */
	import { createFormatters, createTranslator, DateFormats } from '../../src/lib/i18n/index.js';
	import type { I18nAction, I18nState } from '../../src/lib/i18n/index.js';
	import type { Store } from '../../src/lib/types.js';

	interface AppState {
		i18n: I18nState;
	}

	let {
		store,
		post,
		price,
		yesterday,
		user,
		product
	}: {
		store: Store<AppState, I18nAction>;
		post: { date: string };
		price: number;
		yesterday: Date;
		user: { name: string };
		product: { price: number };
	} = $props();

	const t = $derived(createTranslator($store.i18n, 'common'));
	const formatters = $derived(createFormatters($store.i18n));

	const availableLocales = $derived($store.i18n.availableLocales);
	const currentLocale = $derived($store.i18n.currentLocale);

	const languageNames: Record<string, string> = {
		en: 'English',
		fr: 'Français',
		es: 'Español'
	};

	function switchLanguage(locale: string) {
		store.dispatch({
			type: 'i18n/setLocale',
			locale,
			preloadNamespaces: ['common']
		});
	}

	const authors = ['Alice', 'Bob', 'Carol'];

	const formattedAuthors = $derived(
		new Intl.ListFormat($store.i18n.currentLocale, {
			style: 'long',
			type: 'conjunction'
		}).format(authors)
	);
</script>

<!-- Rule 2, ✅ CORRECT — framework formatters -->
<div>
  <p>{t('welcome', { name: 'Alice' })}</p>
  <p>{formatters.date(post.date)}</p>
  <p>{formatters.number(1234.56)}</p>
  <p>{formatters.currency(99.99, 'USD')}</p>
</div>

<!-- Rule 2, ❌ WRONG — manual formatting -->
<!-- ❌ Don't manually format dates -->
<p>{new Date(post.date).toLocaleDateString()}</p>

<!-- ❌ Don't manually format numbers -->
<p>{price.toFixed(2)}</p>

<!-- ❌ Don't manually construct currency -->
<p>${price}</p>

<!-- Core concept 1: Translation system -->
<div>
  <!-- Simple translation -->
  <h1>{t('app.title')}</h1>

  <!-- With interpolation -->
  <p>{t('welcome', { name: 'Alice' })}</p>

  <!-- ICU MessageFormat (pluralization) -->
  <p>{t('items', { count: 5 })}</p>
  <!-- Translation: "{count, plural, one {# item} other {# items}}" -->
  <!-- Output: "5 items" -->
</div>

<!-- Core concept 2: Formatters -->
<div>
  <!-- Date formatting -->
  <p>{formatters.date(post.date)}</p>
  <!-- en: "January 5, 2025" -->
  <!-- fr: "5 janvier 2025" -->
  <!-- es: "5 de enero de 2025" -->

  <!-- Date with custom options -->
  <p>{formatters.date(post.date, DateFormats.short)}</p>
  <!-- en: "1/5/25" -->
  <!-- fr: "05/01/2025" -->

  <!-- Number formatting -->
  <p>{formatters.number(1234.56)}</p>
  <!-- en: "1,234.56" -->
  <!-- fr: "1 234,56" -->
  <!-- de: "1.234,56" -->

  <!-- Currency formatting -->
  <p>{formatters.currency(99.99, 'USD')}</p>
  <!-- en-US: "$99.99" -->
  <!-- fr: "99,99 $US" -->
  <!-- de: "99,99 $" -->

  <!-- Relative time -->
  <p>{formatters.relativeTime(yesterday)}</p>
  <!-- en: "yesterday" -->
  <!-- fr: "hier" -->
  <!-- es: "ayer" -->
</div>

<!-- src/App.svelte -->
<div>
  <h1>{t('app.title')}</h1>

  <select value={$store.i18n.currentLocale} onchange={(e) => switchLanguage(e.currentTarget.value)}>
    <option value="en">English</option>
    <option value="fr">Français</option>
    <option value="es">Español</option>
  </select>

  <p>{t('welcome', { name: 'User' })}</p>
  <p>{formatters.date(new Date())}</p>
</div>

<!-- Pattern 1: Language switcher -->
<div class="language-switcher">
  {#each availableLocales as locale}
    <button
      class:active={locale === currentLocale}
      onclick={() => switchLanguage(locale)}
    >
      {languageNames[locale]}
    </button>
  {/each}
</div>

<!-- Pattern 3: Formatted lists -->
<p>Authors: {formattedAuthors}</p>
<!-- en: "Authors: Alice, Bob, and Carol" -->
<!-- fr: "Authors: Alice, Bob et Carol" -->
<!-- es: "Authors: Alice, Bob y Carol" -->

<!-- Summary: most common pattern -->
<div>
  <h1>{t('app.title')}</h1>
  <p>{t('welcome', { name: user.name })}</p>
  <time>{formatters.date(post.date)}</time>
  <span>{formatters.currency(product.price, 'USD')}</span>
</div>
