/**
 * Svelte 5.20 accepts runes in class field initializers, but rejects a
 * TypeScript-lowered assignment such as `this.active = $state(true)` inside a
 * constructor. Check the packaged bytes that installed consumers compile.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { walkFiles } from './walk.js';

const renderer = new URL('../../dist/application/renderer/', import.meta.url);
const dist = fileURLToPath(new URL('../../dist/', import.meta.url));

describe('packaged rune class fields', () => {
	it.each([
		['placement.svelte.js', 'active', 'true'],
		['placement-activity.svelte.js', 'epoch', '0']
	])('%s preserves $state as a class field', (file, field, initial) => {
		const output = readFileSync(new URL(file, renderer), 'utf8');
		expect(output).toContain(`${field} = $state(${initial});`);
		expect(output).not.toContain(`this.${field} = $state(${initial});`);
	});

	it('uses a compiler target that preserves class rune initializers', () => {
		const config = JSON.parse(readFileSync(new URL('../../tsconfig.json', import.meta.url), 'utf8')) as {
			compilerOptions?: { target?: string; useDefineForClassFields?: boolean };
		};
		expect(config.compilerOptions?.target).toBe('ES2022');
		expect(config.compilerOptions?.useDefineForClassFields).toBe(true);
	});

	it('has no known lowered rune assignments in packaged Svelte files', () => {
		const { files, unreadable } = walkFiles(dist, {
			keep: (name) => name.endsWith('.svelte.js') || name.endsWith('.svelte')
		});
		expect(unreadable).toEqual([]);
		expect(files.length).toBeGreaterThan(0);
		const loweredRune = /\bthis\.[\w$]+\s*=\s*\$(?:state(?:\.raw)?|derived(?:\.by)?)\s*\(/;
		for (const file of files) {
			const output = readFileSync(file, 'utf8');
			expect(output, `${file} contains a lowered rune initializer`).not.toMatch(loweredRune);
		}
	});
});
