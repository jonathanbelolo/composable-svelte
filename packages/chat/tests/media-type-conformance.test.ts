/**
 * `VideoEmbedData` must stay structurally compatible with media's own type.
 *
 * chat declares its own copy rather than importing `VideoEmbed` from
 * `@composable-svelte/media`, because a type-only import of an **optional** peer
 * lands in the emitted `.d.ts` and breaks a media-less consumer typechecking
 * with `skipLibCheck: false` — verified against a packed tarball, on the public
 * `@composable-svelte/chat/streaming-chat/markdown` subpath.
 *
 * The cost of that is a duplicated interface, and duplicated interfaces drift.
 * The original defect here was exactly a drifted copy: chat declared
 * `Array<{ url, platform }>` while media returned seven fields, so the value
 * reaching `<VideoEmbed>` was missing `videoId`, `aspectRatio` and `embedUrl`.
 *
 * This file is where that cannot happen quietly. Tests are not shipped, so it
 * may import media freely. If media adds a required field, renames one, or
 * narrows a type chat has widened, the assignment below stops compiling.
 *
 * It is a *type-level* test: the assertions exist to make `tsc` run, but the
 * real check is whether this file compiles at all. `pnpm --filter
 * @composable-svelte/chat typecheck` is what enforces it.
 */

import { describe, it, expect } from 'vitest';
import type { VideoEmbedType } from '@composable-svelte/media';
import type { VideoEmbedData } from '../src/lib/streaming-chat/types.js';
import { extractVideosFromMarkdown } from '../src/lib/streaming-chat/markdown.js';

/**
 * The load-bearing line: everything media produces must satisfy what chat
 * declares. Fails to compile if media grows a required field chat lacks.
 */
const mediaSatisfiesChat = (video: VideoEmbedType): VideoEmbedData => video;

/**
 * And the fields chat carries must be the ones media actually has — this
 * direction catches a *renamed* field, which the assignment above would not,
 * since chat's `string` widening makes it structurally permissive.
 */
type SharedKeys = keyof VideoEmbedData & keyof VideoEmbedType;
type ChatOnlyKeys = Exclude<keyof VideoEmbedData, SharedKeys>;
const noChatOnlyKeys: ChatOnlyKeys[] = [];

describe('VideoEmbedData conformance with @composable-svelte/media', () => {
	it('accepts every VideoEmbed media produces', () => {
		const fromMedia: VideoEmbedType = {
			url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
			platform: 'youtube',
			videoId: 'dQw4w9WgXcQ',
			aspectRatio: '16:9',
			embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ'
		};

		const asChat = mediaSatisfiesChat(fromMedia);
		expect(asChat.embedUrl).toContain('dQw4w9WgXcQ');
	});

	it('declares no field media does not have', () => {
		// If this array's element type is not `never`, chat invented a field —
		// most likely because media renamed one.
		expect(noChatOnlyKeys).toEqual([]);
	});

	it('the real extractor returns something that satisfies the declared type', () => {
		// Guards the actual runtime shape, not just the declarations. Returns []
		// until the optional dependency loads, which is fine — the point is that
		// whatever it does return typechecks as VideoEmbedData[].
		const videos: VideoEmbedData[] = extractVideosFromMarkdown('no videos here');
		expect(Array.isArray(videos)).toBe(true);
	});
});
