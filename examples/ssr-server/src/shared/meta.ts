import type { AppDestination, PageMeta, Post, Comment } from './types';
import { formatLocalizedURL } from './routing';

export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function computeMeta(
  destination: AppDestination,
  posts: Post[],
  comments: Comment[],
  locale: string = 'en'
): PageMeta {
  const makeCanonical = (path: string) => {
    const localizedPath = formatLocalizedURL(path, locale);
    return `https://example.com${localizedPath}`;
  };

  switch (destination.type) {
    case 'list':
      return {
        title: 'Blog Posts - Composable Svelte SSR',
        description: 'Server-Side Rendered blog with Composable Svelte and Fastify',
        canonical: makeCanonical('/')
      };

    case 'post': {
      const post = posts.find((p) => p.id === destination.state.postId);
      if (post) {
        const plain = stripHtml(post.content);
        return {
          title: `${post.title} - Composable Svelte Blog`,
          description: plain.slice(0, 160),
          ogImage: `/og/post-${post.id}.jpg`,
          canonical: makeCanonical(`/posts/${post.id}`)
        };
      }
      break;
    }

    case 'comments': {
      const post = posts.find((p) => p.id === destination.state.postId);
      const commentCount = comments.filter((c) => c.postId === destination.state.postId).length;
      if (post) {
        return {
          title: `Comments on "${post.title}" - Composable Svelte Blog`,
          description: `Read ${commentCount} comments on ${post.title}`,
          canonical: makeCanonical(`/posts/${post.id}/comments`)
        };
      }
      break;
    }

    case 'notFound':
    default:
      break;
  }

  return {
    title: 'Page Not Found - Composable Svelte Blog',
    description: 'The requested page could not be found.',
    canonical: makeCanonical('/404')
  };
}
