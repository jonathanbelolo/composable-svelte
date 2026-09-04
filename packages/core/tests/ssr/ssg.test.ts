/**
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { expectConsole } from '../helpers/console.js';
import { generateStaticSite, generateStaticPage, SSGPathError } from '../../src/lib/ssr/ssg';
import type { Reducer } from '../../src/lib/types';
import { Effect } from '../../src/lib/effect';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  mkdir: vi.fn(),
  writeFile: vi.fn()
}));

// Mock Svelte server render
vi.mock('svelte/server', () => ({
  render: vi.fn((Component, { props }) => ({
    body: `<div>Rendered: ${JSON.stringify(props)}</div>`,
    head: '<title>Test Page</title>'
  }))
}));

// Test state and actions
interface TestState {
  title: string;
  content: string;
  meta: {
    description: string;
    canonical?: string;
  };
}

type TestAction = { type: 'updateTitle'; title: string };

const initialState: TestState = {
  title: 'Home',
  content: 'Welcome',
  meta: {
    description: 'Home page'
  }
};

const reducer: Reducer<TestState, TestAction> = (state, action) => {
  switch (action.type) {
    case 'updateTitle':
      return [{ ...state, title: action.title }, Effect.none()];
    default:
      return [state, Effect.none()];
  }
};

// Mock Svelte component
const MockComponent = {} as any;

describe('SSG (Static Site Generation)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateStaticPage', () => {
    it('generates a single static HTML page', async () => {
      const outPath = await generateStaticPage(MockComponent, '/', {
        initialState,
        reducer,
        dependencies: {},
        outDir: './dist'
      });

      expect(outPath).toBe('index.html');
      expect(fs.mkdir).toHaveBeenCalledWith('dist', { recursive: true });
      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join('dist', 'index.html'),
        expect.stringContaining('<!DOCTYPE html>'),
        'utf-8'
      );
    });

    it('generates nested paths correctly', async () => {
      const outPath = await generateStaticPage(MockComponent, '/posts/123', {
        initialState: {
          ...initialState,
          title: 'Post 123'
        },
        reducer,
        dependencies: {},
        outDir: './dist'
      });

      expect(outPath).toBe('posts/123/index.html');
      expect(fs.mkdir).toHaveBeenCalledWith(
        path.join('./dist', 'posts/123'),
        { recursive: true }
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join('./dist', 'posts/123/index.html'),
        expect.stringContaining('<!DOCTYPE html>'),
        'utf-8'
      );
    });

    it('generates 404 page at root', async () => {
      const outPath = await generateStaticPage(MockComponent, '/404', {
        initialState: {
          ...initialState,
          title: 'Not Found'
        },
        reducer,
        dependencies: {},
        outDir: './dist'
      });

      expect(outPath).toBe('404.html');
      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join('./dist', '404.html'),
        expect.stringContaining('<!DOCTYPE html>'),
        'utf-8'
      );
    });

    it('throws error when Component is missing', async () => {
      await expect(
        generateStaticPage(null as any, '/', {
          initialState,
          reducer,
          dependencies: {},
          outDir: './dist'
        })
      ).rejects.toThrow('generateStaticPage: Component is required');
    });

    it('throws error when path is missing', async () => {
      await expect(
        generateStaticPage(MockComponent, '', {
          initialState,
          reducer,
          dependencies: {},
          outDir: './dist'
        })
      ).rejects.toThrow('generateStaticPage: path is required');
    });
  });

  describe('generateStaticSite', () => {
    it('generates static site with multiple routes', async () => {
      const result = await generateStaticSite(
        MockComponent,
        {
          routes: [
            { path: '/' },
            { path: '/about' }
          ],
          outDir: './dist'
        },
        {
          reducer,
          dependencies: {},
          getInitialState: async (path) => ({
            ...initialState,
            title: path === '/' ? 'Home' : 'About'
          })
        }
      );

      expect(result.pagesGenerated).toBe(3); // / + /about + 404
      expect(result.generatedFiles).toHaveLength(3);
      expect(result.generatedFiles).toContain('index.html');
      expect(result.generatedFiles).toContain('about/index.html');
      expect(result.generatedFiles).toContain('404.html');
      expect(result.errors).toHaveLength(0);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('generates dynamic routes with path enumeration', async () => {
      const posts = [
        { id: 1, title: 'First Post' },
        { id: 2, title: 'Second Post' },
        { id: 3, title: 'Third Post' }
      ];

      const result = await generateStaticSite(
        MockComponent,
        {
          routes: [
            {
              path: '/posts/:id',
              paths: posts.map((p) => `/posts/${p.id}`)
            }
          ],
          outDir: './dist',
          generate404: false
        },
        {
          reducer,
          dependencies: {},
          getInitialState: async (path) => ({
            ...initialState,
            title: `Post ${path.split('/').pop()}`
          })
        }
      );

      expect(result.pagesGenerated).toBe(3);
      expect(result.generatedFiles).toContain('posts/1/index.html');
      expect(result.generatedFiles).toContain('posts/2/index.html');
      expect(result.generatedFiles).toContain('posts/3/index.html');
    });

    it('generates dynamic routes with async path function', async () => {
      const loadPosts = async () => [
        { id: 1, title: 'Post 1' },
        { id: 2, title: 'Post 2' }
      ];

      const result = await generateStaticSite(
        MockComponent,
        {
          routes: [
            {
              path: '/posts/:id',
              paths: async () => {
                const posts = await loadPosts();
                return posts.map((p) => `/posts/${p.id}`);
              }
            }
          ],
          outDir: './dist',
          generate404: false
        },
        {
          reducer,
          dependencies: {},
          getInitialState: async () => initialState
        }
      );

      expect(result.pagesGenerated).toBe(2);
      expect(result.generatedFiles).toContain('posts/1/index.html');
      expect(result.generatedFiles).toContain('posts/2/index.html');
    });

    it('loads data with getServerProps', async () => {
      const posts = [
        { id: 1, title: 'Post 1', content: 'Content 1' },
        { id: 2, title: 'Post 2', content: 'Content 2' }
      ];

      const getServerProps = vi.fn(async (path: string) => {
        const id = parseInt(path.split('/').pop()!);
        const post = posts.find((p) => p.id === id);
        return { postData: post };
      });

      const result = await generateStaticSite(
        MockComponent,
        {
          routes: [
            {
              path: '/posts/:id',
              paths: ['/posts/1', '/posts/2'],
              getServerProps
            }
          ],
          outDir: './dist',
          generate404: false
        },
        {
          reducer,
          dependencies: {},
          getInitialState: async () => initialState
        }
      );

      expect(result.pagesGenerated).toBe(2);
      expect(getServerProps).toHaveBeenCalledTimes(2);
      expect(getServerProps).toHaveBeenCalledWith('/posts/1');
      expect(getServerProps).toHaveBeenCalledWith('/posts/2');
    });

    it('generates 404 page by default', async () => {
      const result = await generateStaticSite(
        MockComponent,
        {
          routes: [{ path: '/' }],
          outDir: './dist'
        },
        {
          reducer,
          dependencies: {},
          getInitialState: async () => initialState
        }
      );

      expect(result.pagesGenerated).toBe(2); // / + 404
      expect(result.generatedFiles).toContain('404.html');
    });

    it('skips 404 page when generate404 is false', async () => {
      const result = await generateStaticSite(
        MockComponent,
        {
          routes: [{ path: '/' }],
          outDir: './dist',
          generate404: false
        },
        {
          reducer,
          dependencies: {},
          getInitialState: async () => initialState
        }
      );

      expect(result.pagesGenerated).toBe(1); // / only
      expect(result.generatedFiles).not.toContain('404.html');
    });

    it('uses custom 404 state when provided', async () => {
      const notFoundState = {
        ...initialState,
        title: 'Custom Not Found',
        content: 'Page does not exist'
      };

      const result = await generateStaticSite(
        MockComponent,
        {
          routes: [{ path: '/' }],
          outDir: './dist',
          notFoundState
        },
        {
          reducer,
          dependencies: {},
          getInitialState: async () => initialState
        }
      );

      expect(result.pagesGenerated).toBe(2);
      expect(result.generatedFiles).toContain('404.html');
    });

    it('adds canonical links when baseURL is provided', async () => {
      const result = await generateStaticSite(
        MockComponent,
        {
          routes: [
            { path: '/' },
            { path: '/about' }
          ],
          outDir: './dist',
          baseURL: 'https://example.com',
          generate404: false
        },
        {
          reducer,
          dependencies: {},
          getInitialState: async () => initialState
        }
      );

      expect(result.pagesGenerated).toBe(2);

      // Verify writeFile was called with canonical link in head
      const calls = vi.mocked(fs.writeFile).mock.calls;
      const homeCall = calls.find((call) => call[0].toString().endsWith('index.html'));
      expect(homeCall![1]).toContain('https://example.com/');

      const aboutCall = calls.find((call) => call[0].toString().includes('about'));
      expect(aboutCall![1]).toContain('https://example.com/about');
    });

    it('calls onPageGenerated callback for each page', async () => {
      const onPageGenerated = vi.fn();

      await generateStaticSite(
        MockComponent,
        {
          routes: [
            { path: '/' },
            { path: '/about' }
          ],
          outDir: './dist',
          onPageGenerated,
          generate404: false
        },
        {
          reducer,
          dependencies: {},
          getInitialState: async () => initialState
        }
      );

      expect(onPageGenerated).toHaveBeenCalledTimes(2);
      expect(onPageGenerated).toHaveBeenCalledWith('/', 'index.html');
      expect(onPageGenerated).toHaveBeenCalledWith('/about', 'about/index.html');
    });

    it('handles errors gracefully and continues generation', async () => {
      expectConsole('error');
      const getInitialState = vi.fn(async (path: string) => {
        if (path === '/error') {
          throw new Error('Failed to load data');
        }
        return initialState;
      });

      const result = await generateStaticSite(
        MockComponent,
        {
          routes: [
            { path: '/' },
            { path: '/error' },
            { path: '/about' }
          ],
          outDir: './dist',
          generate404: false
        },
        {
          reducer,
          dependencies: {},
          getInitialState
        }
      );

      expect(result.pagesGenerated).toBe(2); // / and /about (error skipped)
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.path).toBe('/error');
      expect(result.errors[0]!.error.message).toBe('Failed to load data');
    });

    it('uses default outDir when not provided', async () => {
      const result = await generateStaticSite(
        MockComponent,
        {
          routes: [{ path: '/' }]
        },
        {
          reducer,
          dependencies: {},
          getInitialState: async () => initialState
        }
      );

      expect(result.pagesGenerated).toBe(2); // / + 404
      expect(fs.mkdir).toHaveBeenCalledWith('./dist', { recursive: true });
    });

    it('measures generation duration', async () => {
      const result = await generateStaticSite(
        MockComponent,
        {
          routes: [{ path: '/' }],
          outDir: './dist'
        },
        {
          reducer,
          dependencies: {},
          getInitialState: async () => initialState
        }
      );

      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(typeof result.duration).toBe('number');
    });

    it('works without getInitialState (uses empty object)', async () => {
      const result = await generateStaticSite(
        MockComponent,
        {
          routes: [{ path: '/' }],
          outDir: './dist',
          generate404: false
        },
        {
          reducer,
          dependencies: {}
        }
      );

      expect(result.pagesGenerated).toBe(1);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('SSG with i18n (multi-locale)', () => {
    it('generates pages for multiple locales', async () => {
      const locales = ['en', 'fr', 'es'];
      const routes = [];

      for (const locale of locales) {
        const prefix = locale === 'en' ? '' : `/${locale}`;
        routes.push({
          path: `${prefix}/`,
          getServerProps: async () => ({
            locale,
            content: `Welcome (${locale})`
          })
        });
      }

      const result = await generateStaticSite(
        MockComponent,
        {
          routes,
          outDir: './dist',
          generate404: false
        },
        {
          reducer,
          dependencies: {},
          getInitialState: async () => initialState
        }
      );

      expect(result.pagesGenerated).toBe(3);
      expect(result.generatedFiles).toContain('index.html'); // en
      expect(result.generatedFiles).toContain('fr/index.html');
      expect(result.generatedFiles).toContain('es/index.html');
    });
  });

  describe('SSG edge cases', () => {
    it('handles paths without leading slash', async () => {
      const result = await generateStaticSite(
        MockComponent,
        {
          routes: [{ path: 'about' }],
          outDir: './dist',
          generate404: false
        },
        {
          reducer,
          dependencies: {},
          getInitialState: async () => initialState
        }
      );

      expect(result.pagesGenerated).toBe(1);
      expect(result.generatedFiles).toContain('about/index.html');
    });

    it('handles empty routes array', async () => {
      const result = await generateStaticSite(
        MockComponent,
        {
          routes: [],
          outDir: './dist',
          generate404: false
        },
        {
          reducer,
          dependencies: {},
          getInitialState: async () => initialState
        }
      );

      expect(result.pagesGenerated).toBe(0);
      expect(result.generatedFiles).toHaveLength(0);
    });

    it('handles very deep nested paths', async () => {
      const deepPath = '/a/b/c/d/e/f/g/page';

      const result = await generateStaticSite(
        MockComponent,
        {
          routes: [{ path: deepPath }],
          outDir: './dist',
          generate404: false
        },
        {
          reducer,
          dependencies: {},
          getInitialState: async () => initialState
        }
      );

      expect(result.pagesGenerated).toBe(1);
      expect(result.generatedFiles).toContain('a/b/c/d/e/f/g/page/index.html');
    });
  });

  describe('paths that would leave outDir (SS1)', () => {
    // Each of these, through the first form's strip-one-slash-and-join, wrote
    // a file outside outDir at build time.
    // `/./x` is harmless on disk; it is refused because a path is a page
    // name, not a directory operation, and it is the case the segment check
    // catches that resolving the target would not.
    const corpus = [
      '/../x',
      '/a/../../x',
      '/%2e%2e/x',
      '/a/%2e%2e/%2e%2e/x',
      '/..\\x',
      '/./x',
      '/a\u0000b',
      '/%zz'
    ];

    it('generateStaticPage refuses each with a typed error, before rendering or writing', async () => {
      for (const path of corpus) {
        await expect(
          generateStaticPage(MockComponent, path, { initialState, reducer, dependencies: {}, outDir: './dist' })
        ).rejects.toBeInstanceOf(SSGPathError);
      }
      expect(fs.writeFile).not.toHaveBeenCalled();
      expect(fs.mkdir).not.toHaveBeenCalled();
    });

    it('generateStaticSite records each in result.errors and writes nothing outside outDir', async () => {
      expectConsole('error', corpus.length);
      const result = await generateStaticSite(
        MockComponent,
        { routes: [{ path: '/ok' }, ...corpus.map((path) => ({ path }))], outDir: './dist', generate404: false },
        { reducer, dependencies: {}, getInitialState: async () => initialState }
      );

      expect(result.pagesGenerated).toBe(1);
      expect(result.errors.map((e) => e.path)).toEqual(corpus);
      for (const { error } of result.errors) expect(error).toBeInstanceOf(SSGPathError);

      const outRoot = path.resolve('./dist');
      const written = vi.mocked(fs.writeFile).mock.calls.map((call) => path.resolve(String(call[0])));
      expect(written).toEqual([path.join(outRoot, 'ok', 'index.html')]);
      for (const file of written) expect(file.startsWith(outRoot + path.sep)).toBe(true);
    });

    it('a data-derived path is checked the same way', async () => {
      expectConsole('error');
      const result = await generateStaticSite(
        MockComponent,
        { routes: [{ path: '/posts/:id', paths: async () => ['/posts/1', '/posts/../../escaped'] }], outDir: './dist', generate404: false },
        { reducer, dependencies: {}, getInitialState: async () => initialState }
      );
      expect(result.pagesGenerated).toBe(1);
      expect(result.errors[0]!.path).toBe('/posts/../../escaped');
      expect(vi.mocked(fs.writeFile).mock.calls).toHaveLength(1);
    });
  });

  describe('one file per target (SS11)', () => {
    it('/a and /a/ are one page, rendered once', async () => {
      const result = await generateStaticSite(
        MockComponent,
        { routes: [{ path: '/a' }, { path: '/a/' }], outDir: './dist', generate404: false },
        { reducer, dependencies: {}, getInitialState: async () => initialState }
      );
      expect(result.pagesGenerated).toBe(1);
      expect(result.generatedFiles).toEqual([path.join('a', 'index.html')]);
      expect(vi.mocked(fs.writeFile).mock.calls).toHaveLength(1);
    });

    it('a data path of /404 does not overwrite the 404 page', async () => {
      const onPageGenerated = vi.fn();
      const result = await generateStaticSite(
        MockComponent,
        { routes: [{ path: '/' }, { path: '/404' }], outDir: './dist', notFoundState: { ...initialState, title: 'Not found' }, onPageGenerated },
        { reducer, dependencies: {}, getInitialState: async () => initialState }
      );
      expect(result.pagesGenerated).toBe(2);
      expect(result.generatedFiles.filter((f) => f === '404.html')).toHaveLength(1);
      const writes = vi.mocked(fs.writeFile).mock.calls.filter((call) => String(call[0]).endsWith('404.html'));
      expect(writes).toHaveLength(1);
      expect(String(writes[0]![1])).toContain('Not found');
      expect(onPageGenerated).toHaveBeenCalledTimes(1); // the route loop's page; the 404 step has no callback
    });

    it('a failed 404 write lands in result.errors', async () => {
      expectConsole('error');
      vi.mocked(fs.writeFile).mockImplementation(async (file) => {
        if (String(file).endsWith('404.html')) throw new Error('disk full');
      });
      const result = await generateStaticSite(
        MockComponent,
        { routes: [{ path: '/' }], outDir: './dist' },
        { reducer, dependencies: {}, getInitialState: async () => initialState }
      );
      expect(result.pagesGenerated).toBe(1);
      expect(result.errors).toEqual([{ path: '/404', error: expect.objectContaining({ message: 'disk full' }) }]);
    });
  });

  describe('the canonical link (SS2)', () => {
    it('attribute-escapes the path', async () => {
      const hostile = '/a"><script>alert(1)</script>';
      await generateStaticSite(
        MockComponent,
        { routes: [{ path: hostile }], outDir: './dist', baseURL: 'https://x.example', generate404: false },
        { reducer, dependencies: {}, getInitialState: async () => initialState }
      );
      const html = String(vi.mocked(fs.writeFile).mock.calls[0]![1]);
      expect(html).toContain('<link rel="canonical" href="https://x.example/a&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;">');
      expect(html).not.toContain('href="https://x.example/a"><script>');
    });
  });
});

