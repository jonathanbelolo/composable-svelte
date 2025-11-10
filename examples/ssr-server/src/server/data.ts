/**
 * Mock data for the blog.
 * In a real application, this would fetch from a database or API.
 */

import type { Post } from '../shared/types';

const mockPosts: Post[] = [
  {
    id: 1,
    title: 'Getting Started with Composable Svelte',
    author: 'Jane Developer',
    date: '2025-01-05',
    tags: ['svelte', 'architecture', 'tutorial'],
    content: `
      <p><strong>Composable Svelte</strong> brings the power of the Composable Architecture to Svelte applications.
      This pattern, popularized by The Composable Architecture (TCA) in Swift, provides a consistent way to build
      robust, testable applications.</p>

      <p>The core principles are simple yet powerful:</p>
      <ul>
        <li>Pure reducers for predictable state management</li>
        <li>Declarative effects for side effects</li>
        <li>First-class composition for feature modularity</li>
      </ul>

      <p>With server-side rendering support, you can now build fast, SEO-friendly applications that hydrate seamlessly on the client.</p>
    `
  },
  {
    id: 2,
    title: 'Understanding Server-Side Rendering',
    author: 'John Architect',
    date: '2025-01-08',
    tags: ['ssr', 'performance', 'seo'],
    content: `
      <p>Server-Side Rendering (SSR) is a technique where your application is rendered on the server before being sent to the client.
      This has several important benefits:</p>

      <p><em>Performance:</em> Users see content immediately, without waiting for JavaScript to load and execute.</p>

      <p><em>SEO:</em> Search engines can easily crawl and index your content, as it's available in the initial HTML.</p>

      <p><em>Accessibility:</em> Content is available even if JavaScript fails to load or is disabled.</p>

      <p>With Composable Svelte's SSR support, you get all these benefits while maintaining the clean architecture patterns you love.</p>
    `
  },
  {
    id: 3,
    title: 'Building Production-Ready Apps',
    author: 'Sarah Engineer',
    date: '2025-01-10',
    tags: ['production', 'best-practices', 'deployment'],
    content: `
      <p>Taking your Composable Svelte application to production requires careful consideration of several factors:</p>

      <p><strong>State Management:</strong> Keep your state pure and serializable. This ensures smooth hydration and predictable behavior.</p>

      <p><strong>Effect Handling:</strong> Design effects to be resumable. When the page hydrates, effects should pick up where the server left off.</p>

      <p><strong>Performance:</strong> Use SSR for the initial render, then let the client take over for subsequent interactions. This gives you the best of both worlds.</p>

      <p>Remember: the architecture is designed to scale. Start simple, and add complexity only when needed.</p>
    `
  },
  {
    id: 4,
    title: 'Testing Strategies for SSR',
    author: 'Mike Tester',
    date: '2025-01-12',
    tags: ['testing', 'ssr', 'quality'],
    content: `
      <p>Testing server-rendered applications requires a different approach than client-only apps. Here's what you need to know:</p>

      <p><strong>Unit Tests:</strong> Test your reducers in isolation. They're pure functions, so this is straightforward and fast.</p>

      <p><strong>Integration Tests:</strong> Verify that state serialization and hydration work correctly. TestStore is your friend here.</p>

      <p><strong>E2E Tests:</strong> Test the full flow - server render, client hydration, and user interactions. This catches issues that unit tests might miss.</p>

      <p>The key is to test at multiple levels. Pure functions make testing easy, and the architecture makes it natural.</p>
    `
  },
  {
    id: 5,
    title: 'Fastify and Modern Node.js',
    author: 'Alex Performance',
    date: '2025-01-15',
    tags: ['fastify', 'nodejs', 'performance'],
    content: `
      <p><strong>Fastify</strong> is one of the fastest web frameworks for Node.js, and it's perfect for SSR applications. Here's why:</p>

      <p><em>Speed:</em> Fastify is designed for performance from the ground up. It's significantly faster than Express while being just as easy to use.</p>

      <p><em>Schema Validation:</em> Built-in JSON schema validation ensures your data is correct before it reaches your application logic.</p>

      <p><em>Plugin System:</em> Fastify's encapsulated plugin system makes it easy to organize your code and share functionality.</p>

      <p>Combined with Composable Svelte's efficient rendering, you get an incredibly fast stack for building modern web applications.</p>
    `
  }
];

/**
 * Simulates loading posts from a database.
 * In production, this would be a real database query.
 */
export async function loadPosts(): Promise<Post[]> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 10));

  return mockPosts;
}

/**
 * Loads a single post by ID.
 */
export async function loadPostById(id: number): Promise<Post | null> {
  const posts = await loadPosts();
  return posts.find((p) => p.id === id) || null;
}
