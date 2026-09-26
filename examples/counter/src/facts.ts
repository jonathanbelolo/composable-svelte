/**
 * Number fact service dependencies.
 *
 * Provides:
 * - Deterministic local number facts for default runnable demo (no network needed).
 * - Factory for optional secure HTTPS or same-origin HTTP fact service.
 */

export interface FactService {
  getFact(count: number, signal?: AbortSignal): Promise<string>;
}

export const LOCAL_FACTS: Record<number, string> = {
  0: '0 is the additive identity and the only real number that is neither positive nor negative.',
  1: '1 is the multiplicative identity and the smallest positive integer.',
  2: '2 is the smallest and only even prime number.',
  3: '3 is the first odd prime number and the number of spatial dimensions we experience.',
  4: '4 is the smallest composite number and the number of seasons in a calendar year.',
  5: '5 is the number of appendages on a typical human hand and the third prime number.',
  6: '6 is the smallest positive perfect number (1 + 2 + 3 = 6).',
  7: '7 is the number of days in a week and a lucky prime number.',
  8: '8 is the number of bits in a byte and the first cube after 1.',
  9: '9 is the highest single-digit decimal integer and the first odd square after 1.',
  10: '10 is the base of the decimal numeral system.'
};

export function getLocalFact(count: number): string {
  if (count in LOCAL_FACTS) {
    return `[Demo Local Fact] ${LOCAL_FACTS[count]}`;
  }
  return `[Demo Local Fact] ${count} + 0 = ${count}.`;
}

export const defaultFactService: FactService = {
  async getFact(count: number, signal?: AbortSignal): Promise<string> {
    if (signal?.aborted) {
      throw new DOMException('The operation was aborted', 'AbortError');
    }
    return getLocalFact(count);
  }
};

export interface HttpFactServiceOptions {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
}

export function createHttpFactService(options: HttpFactServiceOptions): FactService {
  const baseUrl = options.baseUrl;
  const relative = baseUrl.startsWith('/') && !baseUrl.startsWith('//');
  if (baseUrl.includes('\\') || (!baseUrl.startsWith('https://') && !relative)) {
    throw new TypeError('Fact endpoint must use HTTPS or a same-origin absolute path');
  }
  const base = new URL(baseUrl, 'https://example.invalid');
  const fetchFn = options.fetch ?? globalThis.fetch;

  return {
    async getFact(count: number, signal?: AbortSignal): Promise<string> {
      const endpoint = new URL(base);
      endpoint.pathname = `${base.pathname.replace(/\/+$/, '')}/${encodeURIComponent(count)}/trivia`;
      const target = relative ? endpoint.pathname + endpoint.search : endpoint.href;
      const response = await fetchFn(target, { ...(signal !== undefined && { signal }) });
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw new Error(`HTTP ${response.status}: ${response.statusText || 'Request failed'}`);
      }
      return response.text();
    }
  };
}
