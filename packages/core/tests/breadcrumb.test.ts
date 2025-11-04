import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import {
	Breadcrumb,
	BreadcrumbList,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbPage,
	BreadcrumbSeparator,
	BreadcrumbEllipsis
} from '../src/lib/components/ui/breadcrumb/index.js';

describe('Breadcrumb', () => {
	it('renders nav element with aria-label', () => {
		const { container } = render(Breadcrumb, {
			props: {
				children: () => {}
			}
		});

		const nav = container.querySelector('nav');
		expect(nav).toBeTruthy();
		expect(nav?.getAttribute('aria-label')).toBe('breadcrumb');
	});
});

describe('BreadcrumbList', () => {
	it('renders ordered list with correct classes', () => {
		const { container } = render(BreadcrumbList, {
			props: {
				children: () => {}
			}
		});

		const ol = container.querySelector('ol');
		expect(ol).toBeTruthy();
		expect(ol?.className).toContain('flex');
		expect(ol?.className).toContain('flex-wrap');
		expect(ol?.className).toContain('items-center');
	});
});

describe('BreadcrumbItem', () => {
	it('renders list item with correct classes', () => {
		const { container } = render(BreadcrumbItem, {
			props: {
				children: () => {}
			}
		});

		const li = container.querySelector('li');
		expect(li).toBeTruthy();
		expect(li?.className).toContain('inline-flex');
		expect(li?.className).toContain('items-center');
	});
});

describe('BreadcrumbLink', () => {
	it('renders anchor element with default href', () => {
		const { container } = render(BreadcrumbLink, {
			props: {
				children: () => {}
			}
		});

		const link = container.querySelector('a');
		expect(link).toBeTruthy();
		expect(link?.getAttribute('href')).toBe('#');
		expect(link?.className).toContain('transition-colors');
	});

	it('renders anchor element with custom href', () => {
		const { container } = render(BreadcrumbLink, {
			props: {
				href: '/home',
				children: () => {}
			}
		});

		const link = container.querySelector('a');
		expect(link?.getAttribute('href')).toBe('/home');
	});
});

describe('BreadcrumbPage', () => {
	it('renders span with aria attributes for current page', () => {
		const { container } = render(BreadcrumbPage, {
			props: {
				children: () => {}
			}
		});

		const span = container.querySelector('span');
		expect(span).toBeTruthy();
		expect(span?.getAttribute('role')).toBe('link');
		expect(span?.getAttribute('aria-disabled')).toBe('true');
		expect(span?.getAttribute('aria-current')).toBe('page');
	});
});

describe('BreadcrumbSeparator', () => {
	it('renders list item with aria attributes', () => {
		const { container } = render(BreadcrumbSeparator, {
			props: {}
		});

		const li = container.querySelector('li');
		expect(li).toBeTruthy();
		expect(li?.getAttribute('role')).toBe('presentation');
		expect(li?.getAttribute('aria-hidden')).toBe('true');
	});

	it('renders default chevron icon when no children provided', () => {
		const { container } = render(BreadcrumbSeparator, {
			props: {}
		});

		const svg = container.querySelector('svg');
		expect(svg).toBeTruthy();
	});
});

describe('BreadcrumbEllipsis', () => {
	it('renders span with aria attributes', () => {
		const { container } = render(BreadcrumbEllipsis, {
			props: {}
		});

		const span = container.querySelector('span');
		expect(span).toBeTruthy();
		expect(span?.getAttribute('role')).toBe('presentation');
		expect(span?.getAttribute('aria-hidden')).toBe('true');
		expect(span?.getAttribute('aria-label')).toBe('More');
	});

	it('renders ellipsis icon', () => {
		const { container } = render(BreadcrumbEllipsis, {
			props: {}
		});

		const svg = container.querySelector('svg');
		expect(svg).toBeTruthy();
	});
});
