/**
 * Tests for i18n SSR utilities.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  initI18nOnServer,
  generateAlternateLinks,
  extractLocaleFromPath,
  rerouteWithLocale
} from '../../src/lib/i18n/ssr.js';
import type { TranslationNamespace } from '../../src/lib/i18n/types.js';

describe('initI18nOnServer', () => {
  const enCommon: TranslationNamespace = {
    welcome: 'Welcome',
    greeting: 'Hello, {name}!'
  };

  const ptBRCommon: TranslationNamespace = {
    welcome: 'Bem-vindo',
    greeting: 'Olá, {name}!'
  };

  const bundles = {
    'en': { common: enCommon },
    'pt-BR': { common: ptBRCommon }
  };

  it('should detect locale from Accept-Language header', async () => {
    const request = new Request('http://localhost:3000/', {
      headers: {
        'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8'
      }
    });

    const result = await initI18nOnServer({
      request,
      url: 'http://localhost:3000/',
      supportedLocales: ['en', 'pt-BR'],
      defaultLocale: 'en',
      bundles,
      preloadNamespaces: ['common']
    });

    expect(result.locale).toBe('pt-BR');
    expect(result.state.currentLocale).toBe('pt-BR');
    expect(result.state.fallbackChain).toEqual(['pt-BR', 'pt', 'en']);
  });

  it('should detect locale from cookie', async () => {
    const request = new Request('http://localhost:3000/', {
      headers: {
        'cookie': 'locale=pt-BR'
      }
    });

    const result = await initI18nOnServer({
      request,
      url: 'http://localhost:3000/',
      supportedLocales: ['en', 'pt-BR'],
      defaultLocale: 'en',
      bundles,
      preloadNamespaces: ['common']
    });

    expect(result.locale).toBe('pt-BR');
  });

  it('should detect locale from URL parameter', async () => {
    const request = new Request('http://localhost:3000/?lang=pt-BR');

    const result = await initI18nOnServer({
      request,
      url: 'http://localhost:3000/?lang=pt-BR',
      supportedLocales: ['en', 'pt-BR'],
      defaultLocale: 'en',
      bundles,
      preloadNamespaces: ['common']
    });

    expect(result.locale).toBe('pt-BR');
  });

  it('should fall back to default locale', async () => {
    const request = new Request('http://localhost:3000/');

    const result = await initI18nOnServer({
      request,
      url: 'http://localhost:3000/',
      supportedLocales: ['en', 'pt-BR'],
      defaultLocale: 'en',
      bundles,
      preloadNamespaces: ['common']
    });

    expect(result.locale).toBe('en');
  });

  it('should preload namespaces', async () => {
    const request = new Request('http://localhost:3000/');

    const result = await initI18nOnServer({
      request,
      url: 'http://localhost:3000/',
      supportedLocales: ['en', 'pt-BR'],
      defaultLocale: 'en',
      bundles,
      preloadNamespaces: ['common']
    });

    expect(result.translations['en:common']).toEqual(enCommon);
    expect(result.state.translations['en:common']).toEqual(enCommon);
  });

  it('should handle multiple preloaded namespaces', async () => {
    const enProducts: TranslationNamespace = {
      title: 'Products'
    };

    const bundlesWithProducts = {
      'en': { common: enCommon, products: enProducts },
      'pt-BR': { common: ptBRCommon }
    };

    const request = new Request('http://localhost:3000/');

    const result = await initI18nOnServer({
      request,
      url: 'http://localhost:3000/',
      supportedLocales: ['en', 'pt-BR'],
      defaultLocale: 'en',
      bundles: bundlesWithProducts,
      preloadNamespaces: ['common', 'products']
    });

    expect(result.translations['en:common']).toEqual(enCommon);
    expect(result.translations['en:products']).toEqual(enProducts);
  });

  it('should handle missing namespace gracefully', async () => {
    const request = new Request('http://localhost:3000/');

    const result = await initI18nOnServer({
      request,
      url: 'http://localhost:3000/',
      supportedLocales: ['en', 'pt-BR'],
      defaultLocale: 'en',
      bundles,
      preloadNamespaces: ['common', 'nonexistent']
    });

    expect(result.translations['en:common']).toEqual(enCommon);
    expect(result.translations['en:nonexistent']).toBeUndefined();
  });
});

describe('generateAlternateLinks', () => {
  it('should generate alternate links for multiple locales', () => {
    const links = generateAlternateLinks('/products', ['en', 'pt-BR', 'es']);

    expect(links).toContain('rel="alternate"');
    expect(links).toContain('hreflang="en"');
    expect(links).toContain('hreflang="pt-BR"');
    expect(links).toContain('hreflang="es"');
    expect(links).toContain('href="/products?lang=en"');
    expect(links).toContain('href="/products?lang=pt-BR"');
  });

  it('should support base URL', () => {
    const links = generateAlternateLinks('/products', ['en', 'pt-BR'], 'https://example.com');

    expect(links).toContain('href="https://example.com/products?lang=en"');
    expect(links).toContain('href="https://example.com/products?lang=pt-BR"');
  });
});

describe('extractLocaleFromPath', () => {
  it('should extract locale from path', () => {
    expect(extractLocaleFromPath('/en/products', ['en', 'pt-BR'])).toBe('en');
    expect(extractLocaleFromPath('/pt-BR/about', ['en', 'pt-BR'])).toBe('pt-BR');
  });

  it('should return null if locale not in supported list', () => {
    expect(extractLocaleFromPath('/fr/products', ['en', 'pt-BR'])).toBeNull();
  });

  it('should return null for empty path', () => {
    expect(extractLocaleFromPath('/', ['en', 'pt-BR'])).toBeNull();
  });

  it('should return null if path has no locale prefix', () => {
    expect(extractLocaleFromPath('/products', ['en', 'pt-BR'])).toBeNull();
  });
});

describe('rerouteWithLocale', () => {
  it('should remove locale from path', () => {
    expect(rerouteWithLocale('/en/products', 'en')).toBe('/products');
    expect(rerouteWithLocale('/pt-BR/about', 'pt-BR')).toBe('/about');
  });

  it('should handle paths without locale', () => {
    expect(rerouteWithLocale('/products', 'en')).toBe('/products');
  });

  it('should handle root path', () => {
    expect(rerouteWithLocale('/en', 'en')).toBe('/');
  });

  it('should handle nested paths', () => {
    expect(rerouteWithLocale('/en/products/123', 'en')).toBe('/products/123');
  });
});
