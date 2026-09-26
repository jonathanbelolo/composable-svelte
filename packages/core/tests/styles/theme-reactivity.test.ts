import { describe, it, expect, vi, afterEach } from 'vitest';
import { createThemeManager, type ThemeState } from '../../src/lib/styles/theme.js';

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('theme manager reactivity and lifecycle', () => {
	it('publishes explicit changes through the standard Svelte store contract and updates DOM classes', () => {
		let dark = false;
		let listener: (() => void) | undefined;
		const classes = new Set<string>();

		vi.stubGlobal('window', {
			matchMedia: () => ({
				get matches() {
					return dark;
				},
				addEventListener: (_event: string, callback: () => void) => {
					listener = callback;
				},
				removeEventListener: vi.fn()
			})
		});
		vi.stubGlobal('localStorage', {
			getItem: () => null,
			setItem: vi.fn()
		});
		vi.stubGlobal('document', {
			documentElement: {
				classList: {
					remove: (...values: string[]) => values.forEach((v) => classes.delete(v)),
					add: (v: string) => classes.add(v)
				}
			}
		});

		const manager = createThemeManager();
		const states: ThemeState[] = [];
		const stop = manager.subscribe((state) => states.push(state));
		expect(states.at(-1)).toEqual({ theme: 'system', resolvedTheme: 'light' });

		manager.initialize();
		manager.setTheme('dark');
		expect(states.at(-1)).toEqual({ theme: 'dark', resolvedTheme: 'dark' });
		expect(classes.has('dark')).toBe(true);

		manager.toggle();
		expect(states.at(-1)?.resolvedTheme).toBe('light');
		expect(classes.has('light')).toBe(true);

		manager.setTheme('system');
		dark = true;
		listener!();
		expect(states.at(-1)).toEqual({ theme: 'system', resolvedTheme: 'dark' });

		stop();
		const count = states.length;
		manager.setTheme('light');
		expect(states).toHaveLength(count);
	});

	it('can subscribe, initialize, and set preference without browser globals (SSR regression)', () => {
		vi.stubGlobal('window', undefined);
		vi.stubGlobal('document', undefined);
		vi.stubGlobal('localStorage', undefined);

		const manager = createThemeManager();
		const updates: ThemeState[] = [];
		const stop = manager.subscribe((value) => updates.push(value));

		expect(updates.at(-1)).toEqual({ theme: 'system', resolvedTheme: 'light' });
		const teardown = manager.initialize();
		expect(typeof teardown).toBe('function');
		teardown();

		manager.setTheme('dark');
		expect(manager.theme).toBe('dark');
		expect(manager.resolvedTheme).toBe('dark');
		expect(updates.at(-1)).toEqual({ theme: 'dark', resolvedTheme: 'dark' });

		manager.toggle();
		expect(manager.theme).toBe('light');
		expect(manager.resolvedTheme).toBe('light');
		expect(updates.at(-1)).toEqual({ theme: 'light', resolvedTheme: 'light' });

		stop();
	});

	it('owns removable matchMedia listener and supports idempotent repeat initialization', () => {
		let removeListenerCalled = false;
		let addListenerCount = 0;
		const mockMql = {
			matches: false,
			addEventListener: vi.fn((_event: string, _callback: () => void) => {
				addListenerCount++;
			}),
			removeEventListener: vi.fn((_event: string, _callback: () => void) => {
				removeListenerCalled = true;
			})
		};

		vi.stubGlobal('window', { matchMedia: () => mockMql });
		vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
		vi.stubGlobal('document', { documentElement: { classList: { remove: vi.fn(), add: vi.fn() } } });

		const manager = createThemeManager();
		const teardown1 = manager.initialize();
		expect(manager.initialized).toBe(true);
		expect(addListenerCount).toBe(1);

		// Multiple owners share one listener but release independently.
		const teardown2 = manager.initialize();
		expect(addListenerCount).toBe(1);
		expect(teardown2).not.toBe(teardown1);

		teardown1();
		expect(removeListenerCalled).toBe(false);
		teardown2();
		expect(removeListenerCalled).toBe(true);
		expect(manager.initialized).toBe(false);

		// Re-initialization after teardown succeeds
		manager.initialize();
		expect(addListenerCount).toBe(2);
		expect(manager.initialized).toBe(true);
		manager.destroy();
		expect(manager.initialized).toBe(false);
	});

	it('handles invalid persisted preferences and storage failures gracefully', () => {
		vi.stubGlobal('window', { matchMedia: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) });
		vi.stubGlobal('document', { documentElement: { classList: { remove: vi.fn(), add: vi.fn() } } });
		vi.stubGlobal('localStorage', {
			getItem: () => 'corrupt-theme-value',
			setItem: () => {
				throw new Error('QuotaExceededError');
			}
		});

		const manager = createThemeManager();
		manager.initialize();
		// Corrupt theme value in storage falls back to system
		expect(manager.theme).toBe('system');

		// Set theme does not crash despite storage exception
		expect(() => manager.setTheme('dark')).not.toThrow();
		expect(manager.theme).toBe('dark');
		expect(manager.resolvedTheme).toBe('dark');
	});
});

it('mount cleanup releases only its own initialization and cannot retire a later lifetime', () => {
 const listeners=new Set<()=>void>();
 const media={matches:false,addEventListener:(_type:string,fn:()=>void)=>listeners.add(fn),removeEventListener:(_type:string,fn:()=>void)=>listeners.delete(fn)};
 vi.stubGlobal('window',{matchMedia:()=>media});vi.stubGlobal('document',undefined);vi.stubGlobal('localStorage',undefined);
 const manager=createThemeManager();const first=manager.initialize();const second=manager.initialize();
 expect(listeners.size).toBe(1);first();expect(listeners.size).toBe(1);expect(manager.initialized).toBe(true);
 second();expect(listeners.size).toBe(0);const third=manager.initialize();
 first();second();expect(listeners.size).toBe(1);manager.destroy();const fourth=manager.initialize();third();expect(listeners.size).toBe(1);fourth();expect(listeners.size).toBe(0);
});
