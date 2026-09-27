import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import App from '../src/App.svelte';

describe('host example renders on the server from an injected URL', () => {
  it('renders the routed detail page', () => {
    const { body } = render(App, { props: { url: '/items/pavilion' } });
    expect(body).toContain('Pavilion of Light');
    expect(body).toContain('data-route-focus');
  });
  it('renders the catalog with its scroll container marker', () => {
    const { body } = render(App, { props: { url: '/' } });
    expect(body).toContain('data-composable-scroll="catalog-list"');
    expect(body).toContain('Harbour Baths');
  });
});
