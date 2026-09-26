import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	createThemeManager,
	themeManager,
	type Theme,
	type ThemeManager,
	type ThemeState
} from '../src/lib/styles/theme.js';

interface MockEnvironmentOptions {
	matches?: boolean;
	storedTheme?: string | null;
	matchMediaThrows?: boolean;
	domThrows?: boolean;
	removeListenerThrows?: boolean;
}

function setupMockEnvironment(options: MockEnvironmentOptions = {}) {
	const classList = new Set<string>();
	const listeners = new Set<() => void>();
	const storage = new Map<string, string>();

	if (options.storedTheme !== undefined && options.storedTheme !== null) {
		storage.set('theme', options.storedTheme);
	}

	const mockMq = {
		matches: options.matches ?? false,
		addEventListener: vi.fn((event: string, listener: () => void) => {
			if (event === 'change') listeners.add(listener);
		}),
		removeEventListener: vi.fn((event: string, listener: () => void) => {
			if (options.removeListenerThrows) {
				throw new Error('removeEventListener failed');
			}
			if (event === 'change') listeners.delete(listener);
		})
	};

	const mockMatchMedia = vi.fn((_query: string) => {
		if (options.matchMediaThrows) {
			throw new Error('matchMedia registration failure');
		}
		return mockMq;
	});

	const mockDocElement = {
		classList: {
			remove: vi.fn((...classes: string[]) => {
				for (const c of classes) classList.delete(c);
			}),
			add: vi.fn((...classes: string[]) => {
				if (options.domThrows) {
					throw new Error('DOM resolve exception in classList.add');
				}
				for (const c of classes) classList.add(c);
			}),
			contains: (c: string) => classList.has(c)
		}
	};

	const mockStorage = {
		getItem: vi.fn((key: string) => storage.get(key) ?? null),
		setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
		removeItem: vi.fn((key: string) => storage.delete(key)),
		clear: vi.fn(() => storage.clear())
	};

	vi.stubGlobal('window', { matchMedia: mockMatchMedia });
	vi.stubGlobal('document', { documentElement: mockDocElement });
	vi.stubGlobal('localStorage', mockStorage);

	return {
		classList,
		listeners,
		mockMq,
		mockMatchMedia,
		mockDocElement,
		mockStorage,
		dispatchChange(newMatches: boolean) {
			mockMq.matches = newMatches;
			for (const listener of Array.from(listeners)) {
				listener();
			}
		}
	};
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('createThemeManager', () => {
	it('implements ThemeManager Readable store contract and reactive getters', () => {
		const manager: ThemeManager = createThemeManager();
		expect(manager.theme).toBe('system');
		expect(manager.resolvedTheme).toBe('light');
		expect(manager.initialized).toBe(false);

		const states: ThemeState[] = [];
		const unsubscribe = manager.subscribe((s) => states.push(s));
		expect(states).toEqual([{ theme: 'system', resolvedTheme: 'light' }]);

		manager.setTheme('dark');
		expect(manager.theme).toBe('dark');
		expect(manager.resolvedTheme).toBe('dark');
		expect(states.length).toBe(2);
		expect(states[1]).toEqual({ theme: 'dark', resolvedTheme: 'dark' });

		manager.toggle();
		expect(manager.theme).toBe('light');
		expect(manager.resolvedTheme).toBe('light');

		unsubscribe();
	});

	it('respects initialTheme constructor seed and routes resolvedTheme through seed', () => {
		const darkManager = createThemeManager('dark');
		expect(darkManager.theme).toBe('dark');
		expect(darkManager.resolvedTheme).toBe('dark');

		const lightManager = createThemeManager('light');
		expect(lightManager.theme).toBe('light');
		expect(lightManager.resolvedTheme).toBe('light');

		const invalidManager = createThemeManager('invalid' as Theme);
		expect(invalidManager.theme).toBe('system');
		expect(invalidManager.resolvedTheme).toBe('light');
	});

	it('gives localStorage precedence over constructor seed on client initialize', () => {
		setupMockEnvironment({ storedTheme: 'light' });
		const manager = createThemeManager('dark');
		expect(manager.theme).toBe('dark');

		const release = manager.initialize();
		expect(manager.theme).toBe('light');
		expect(manager.resolvedTheme).toBe('light');
		release();
	});

	it('shares a single listener across concurrent owners and removes on last release', () => {
		const env = setupMockEnvironment({ matches: true });
		const manager = createThemeManager();

		const teardown1 = manager.initialize();
		expect(manager.initialized).toBe(true);
		expect(env.listeners.size).toBe(1);
		expect(env.classList.has('dark')).toBe(true);

		const teardown2 = manager.initialize();
		expect(teardown2).not.toBe(teardown1);
		expect(env.listeners.size).toBe(1);

		teardown1();
		expect(manager.initialized).toBe(true);
		expect(env.listeners.size).toBe(1);

		teardown2();
		expect(manager.initialized).toBe(false);
		expect(env.listeners.size).toBe(0);

		// Double-release is an idempotent no-op
		teardown2();
		expect(manager.initialized).toBe(false);

		// Re-initialize starts a fresh lease lifetime
		const teardown3 = manager.initialize();
		expect(manager.initialized).toBe(true);
		expect(env.listeners.size).toBe(1);
		teardown3();
		expect(env.listeners.size).toBe(0);
	});

	it('forcefully retires all owners on destroy() making existing releases no-ops', () => {
		const env = setupMockEnvironment();
		const manager = createThemeManager();

		const release1 = manager.initialize();
		const release2 = manager.initialize();
		expect(env.listeners.size).toBe(1);

		manager.destroy();
		expect(manager.initialized).toBe(false);
		expect(env.listeners.size).toBe(0);

		// Prior teardown invocations become inert
		release1();
		release2();
		expect(env.listeners.size).toBe(0);

		// Fresh initialization after destroy succeeds
		const release3 = manager.initialize();
		expect(manager.initialized).toBe(true);
		expect(env.listeners.size).toBe(1);
		release3();
		expect(env.listeners.size).toBe(0);
	});

	it('updates resolved theme when system preference changes under system theme', () => {
		const env = setupMockEnvironment({ matches: false });
		const manager = createThemeManager();
		const release = manager.initialize();

		expect(manager.resolvedTheme).toBe('light');
		expect(env.classList.has('light')).toBe(true);

		env.dispatchChange(true);
		expect(manager.resolvedTheme).toBe('dark');
		expect(env.classList.has('dark')).toBe(true);

		manager.setTheme('light');
		env.dispatchChange(true);
		// Fixed light theme ignores system preference
		expect(manager.resolvedTheme).toBe('light');

		release();
	});

	it('rolls back listener, lease, and initialized on matchMedia throw and allows retry', () => {
		const env = setupMockEnvironment({ matchMediaThrows: true });
		const manager = createThemeManager();

		expect(() => manager.initialize()).toThrow('matchMedia registration failure');
		expect(manager.initialized).toBe(false);
		expect(env.listeners.size).toBe(0);

		// Recover matchMedia and verify retry succeeds cleanly
		env.mockMatchMedia.mockImplementation((_query: string) => env.mockMq);
		const release = manager.initialize();
		expect(manager.initialized).toBe(true);
		expect(env.listeners.size).toBe(1);
		release();
		expect(env.listeners.size).toBe(0);
	});

	it('preserves original thrown error on DOM resolve exception even if teardown throws and allows retry', () => {
		const env = setupMockEnvironment({
			domThrows: true,
			removeListenerThrows: true
		});
		const manager = createThemeManager();

		expect(() => manager.initialize()).toThrow('DOM resolve exception in classList.add');
		expect(manager.initialized).toBe(false);
		// A throwing host removal cannot be claimed to have removed its listener.
		expect(env.listeners.size).toBe(1);
		const resolveCalls = env.mockDocElement.classList.add.mock.calls.length;
		env.dispatchChange(true);
		expect(env.mockDocElement.classList.add).toHaveBeenCalledTimes(resolveCalls);
		expect(manager.initialized).toBe(false);
		env.dispatchChange(false);

		// Resolve DOM exception and verify retry succeeds
		env.mockDocElement.classList.add.mockImplementation((...classes: string[]) => {
			for (const c of classes) env.classList.add(c);
		});
		const release = manager.initialize();
		expect(manager.initialized).toBe(true);
		expect(env.classList.has('light')).toBe(true);
		release();
	});

	it('permits synchronous subscriber to destroy manager without resurrection or thrown error', () => {
		const env = setupMockEnvironment();
		const manager = createThemeManager();

		let release: (() => void) | null = null;
		const unsubscribe = manager.subscribe((state) => {
			if (state.theme === 'system' && manager.initialized) {
				manager.destroy();
			}
		});

		expect(() => {
			release = manager.initialize();
		}).not.toThrow();

		expect(manager.initialized).toBe(false);
		expect(env.listeners.size).toBe(0);
		expect(typeof release).toBe('function');

		// Invoking returned release does not throw or resurrect resources
		expect(() => release!()).not.toThrow();
		expect(manager.initialized).toBe(false);
		expect(env.listeners.size).toBe(0);

		unsubscribe();
	});
});

describe('SSR environment', () => {
	it('operates safely when window and document are undefined', () => {
		vi.stubGlobal('window', undefined);
		vi.stubGlobal('document', undefined);
		vi.stubGlobal('localStorage', undefined);

		const manager = createThemeManager();
		const release = manager.initialize();
		expect(typeof release).toBe('function');
		expect(manager.initialized).toBe(false);

		const states: ThemeState[] = [];
		const unsubscribe = manager.subscribe((s) => states.push(s));

		manager.setTheme('dark');
		expect(manager.theme).toBe('dark');
		expect(manager.resolvedTheme).toBe('dark');
		expect(states.length).toBe(2);

		release();
		unsubscribe();
	});
});

describe('themeManager singleton', () => {
	it('exports valid browser-only singleton instance conforming to ThemeManager', () => {
		expect(themeManager).toBeDefined();
		expect(typeof themeManager.initialize).toBe('function');
		expect(typeof themeManager.setTheme).toBe('function');
		expect(typeof themeManager.toggle).toBe('function');
		expect(typeof themeManager.destroy).toBe('function');
		expect(typeof themeManager.subscribe).toBe('function');
	});
});
