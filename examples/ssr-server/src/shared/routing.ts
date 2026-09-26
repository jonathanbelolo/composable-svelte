/** Shared pure route decisions. Browser event ownership remains in core routing. */
import { createParserConfig, parseDestination, serializeDestination } from '@composable-svelte/core/routing';
import type { ParserConfig, SerializerConfig } from '@composable-svelte/core/routing';
import type { AppDestination } from './types';

export const SUPPORTED_LOCALES = ['en', 'fr', 'es'] as const;
export function supportedLocale(value: string | null | undefined): string | undefined {
  return SUPPORTED_LOCALES.find(locale => locale === value);
}

export function extractLocaleAndCleanPath(input: string): { path: string; locale: string | undefined; search: string } {
  const url = new URL(input, 'https://example.com');
  const parts = url.pathname.split('/');
  const locale = supportedLocale(parts[1]);
  const path = locale ? `/${parts.slice(2).join('/')}` : url.pathname;
  return { path: path || '/', locale, search: url.search };
}

function postId(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

export const parserConfig: ParserConfig<AppDestination> = createParserConfig<AppDestination>({
  '/posts/:id/comments': params => {
    const id = postId(params.id);
    return id === null ? null : { type: 'comments', state: { postId: id } };
  },
  '/posts/:id': params => {
    const id = postId(params.id);
    return id === null ? null : { type: 'post', state: { postId: id } };
  },
  '/': () => ({ type: 'list', state: {} })
}, { basePath: '/' });

export const serializerConfig: SerializerConfig<AppDestination> = {
  basePath: '/',
  serializers: {
    list: () => '/',
    post: state => `/posts/${state.postId}`,
    comments: state => `/posts/${state.postId}/comments`,
    notFound: () => '/404'
  }
};

export function parseDestinationFromURL(input: string): AppDestination {
  return parseDestination(extractLocaleAndCleanPath(input).path, parserConfig) ?? { type: 'notFound', state: {} };
}
export function destinationURL(destination: AppDestination): string {
  return serializeDestination(destination, serializerConfig);
}
export function formatLocalizedURL(path: string, locale: string = 'en'): string {
  return locale === 'en' ? path : `/${locale}${path}`;
}
export function listURL(locale = 'en'): string { return formatLocalizedURL('/', locale); }
export function postURL(id: number, locale = 'en'): string { return formatLocalizedURL(`/posts/${id}`, locale); }
export function commentsURL(id: number, locale = 'en'): string { return formatLocalizedURL(`/posts/${id}/comments`, locale); }
