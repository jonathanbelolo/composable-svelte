// ============================================================================
// Endpoint Builders Tests
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  createRESTEndpoints,
  createPaginatedEndpoints,
  createSearchEndpoints,
  createFullEndpoints
} from '../../src/lib/api/endpoints.js';

describe('createRESTEndpoints', () => {
  interface Product {
    id: string;
    name: string;
    price: number;
  }

  interface CreateProductDTO {
    name: string;
    price: number;
  }

  describe('list()', () => {
    it('creates GET request to base path', () => {
      const endpoints = createRESTEndpoints<Product>('/api/products');
      const request = endpoints.list();

      expect(request.method).toBe('GET');
      expect(request.url).toBe('/api/products');
      expect(request.config).toBeUndefined();
    });

    it('includes optional config', () => {
      const endpoints = createRESTEndpoints<Product>('/api/products');
      const request = endpoints.list({ headers: { 'X-Custom': 'value' } });

      expect(request.config).toEqual({ headers: { 'X-Custom': 'value' } });
    });
  });

  describe('get()', () => {
    it('creates GET request with ID parameter', () => {
      const endpoints = createRESTEndpoints<Product>('/api/products');
      const request = endpoints.get('123');

      expect(request.method).toBe('GET');
      expect(request.url).toBe('/api/products/123');
    });

    it('includes optional config', () => {
      const endpoints = createRESTEndpoints<Product>('/api/products');
      const request = endpoints.get('123', { headers: { 'X-Custom': 'value' } });

      expect(request.config).toEqual({ headers: { 'X-Custom': 'value' } });
    });
  });

  describe('create()', () => {
    it('creates POST request with body', () => {
      const endpoints = createRESTEndpoints<Product, CreateProductDTO>('/api/products');
      const data: CreateProductDTO = { name: 'Product 1', price: 100 };
      const request = endpoints.create(data);

      expect(request.method).toBe('POST');
      expect(request.url).toBe('/api/products');
      expect(request.config?.body).toEqual(data);
    });

    it('merges config with body', () => {
      const endpoints = createRESTEndpoints<Product, CreateProductDTO>('/api/products');
      const data: CreateProductDTO = { name: 'Product 1', price: 100 };
      const request = endpoints.create(data, { headers: { 'X-Custom': 'value' } });

      expect(request.config?.body).toEqual(data);
      expect(request.config?.headers).toEqual({ 'X-Custom': 'value' });
    });
  });

  describe('update()', () => {
    it('creates PUT request with ID and body', () => {
      const endpoints = createRESTEndpoints<Product, CreateProductDTO>('/api/products');
      const data = { name: 'Updated Product', price: 150 };
      const request = endpoints.update('123', data);

      expect(request.method).toBe('PUT');
      expect(request.url).toBe('/api/products/123');
      expect(request.config?.body).toEqual(data);
    });
  });

  describe('patch()', () => {
    it('creates PATCH request with ID and partial body', () => {
      const endpoints = createRESTEndpoints<Product>('/api/products');
      const data = { name: 'Patched Product' };
      const request = endpoints.patch('123', data);

      expect(request.method).toBe('PATCH');
      expect(request.url).toBe('/api/products/123');
      expect(request.config?.body).toEqual(data);
    });
  });

  describe('delete()', () => {
    it('creates DELETE request with ID', () => {
      const endpoints = createRESTEndpoints<Product>('/api/products');
      const request = endpoints.delete('123');

      expect(request.method).toBe('DELETE');
      expect(request.url).toBe('/api/products/123');
    });

    it('includes optional config', () => {
      const endpoints = createRESTEndpoints<Product>('/api/products');
      const request = endpoints.delete('123', { headers: { 'X-Custom': 'value' } });

      expect(request.config).toEqual({ headers: { 'X-Custom': 'value' } });
    });
  });
});

describe('createPaginatedEndpoints', () => {
  interface Product {
    id: string;
    name: string;
  }

  it('includes all REST endpoints', () => {
    const endpoints = createPaginatedEndpoints<Product>('/api/products');

    expect(endpoints.list).toBeDefined();
    expect(endpoints.get).toBeDefined();
    expect(endpoints.create).toBeDefined();
    expect(endpoints.update).toBeDefined();
    expect(endpoints.patch).toBeDefined();
    expect(endpoints.delete).toBeDefined();
  });

  describe('listPaginated()', () => {
    it('creates GET request with page parameters', () => {
      const endpoints = createPaginatedEndpoints<Product>('/api/products');
      const request = endpoints.listPaginated({ page: 2, pageSize: 20 });

      expect(request.method).toBe('GET');
      expect(request.url).toBe('/api/products');
      expect(request.config?.params).toEqual({ page: 2, pageSize: 20 });
    });

    it('creates GET request with offset parameters', () => {
      const endpoints = createPaginatedEndpoints<Product>('/api/products');
      const request = endpoints.listPaginated({ offset: 40, limit: 20 });

      expect(request.config?.params).toEqual({ offset: 40, limit: 20 });
    });

    it('merges pagination params with existing config params', () => {
      const endpoints = createPaginatedEndpoints<Product>('/api/products');
      const request = endpoints.listPaginated(
        { page: 1, pageSize: 10 },
        { params: { category: 'electronics' } }
      );

      expect(request.config?.params).toEqual({
        category: 'electronics',
        page: 1,
        pageSize: 10
      });
    });

    it('merges with other config properties', () => {
      const endpoints = createPaginatedEndpoints<Product>('/api/products');
      const request = endpoints.listPaginated(
        { page: 1 },
        { headers: { 'X-Custom': 'value' } }
      );

      expect(request.config?.headers).toEqual({ 'X-Custom': 'value' });
      expect(request.config?.params).toEqual({ page: 1 });
    });
  });
});

describe('createSearchEndpoints', () => {
  interface Product {
    id: string;
    name: string;
  }

  describe('search()', () => {
    it('creates GET request to search path', () => {
      const endpoints = createSearchEndpoints<Product>('/api/products');
      const request = endpoints.search({ query: 'laptop' });

      expect(request.method).toBe('GET');
      expect(request.url).toBe('/api/products/search');
      expect(request.config?.params).toEqual({ query: 'laptop' });
    });

    it('supports custom search path', () => {
      const endpoints = createSearchEndpoints<Product>('/api/products', '/find');
      const request = endpoints.search({ query: 'laptop' });

      expect(request.url).toBe('/api/products/find');
    });

    it('includes q parameter', () => {
      const endpoints = createSearchEndpoints<Product>('/api/products');
      const request = endpoints.search({ q: 'laptop' });

      expect(request.config?.params).toEqual({ q: 'laptop' });
    });

    it('includes sort and order parameters', () => {
      const endpoints = createSearchEndpoints<Product>('/api/products');
      const request = endpoints.search({
        query: 'laptop',
        sort: 'price',
        order: 'asc'
      });

      expect(request.config?.params).toEqual({
        query: 'laptop',
        sort: 'price',
        order: 'asc'
      });
    });

    it('includes pagination parameters', () => {
      const endpoints = createSearchEndpoints<Product>('/api/products');
      const request = endpoints.search({
        query: 'laptop',
        page: 2,
        pageSize: 20
      });

      expect(request.config?.params).toEqual({
        query: 'laptop',
        page: 2,
        pageSize: 20
      });
    });

    it('spreads filters into params', () => {
      const endpoints = createSearchEndpoints<Product>('/api/products');
      const request = endpoints.search({
        query: 'laptop',
        filters: {
          category: 'electronics',
          inStock: true,
          minPrice: 500
        }
      });

      expect(request.config?.params).toEqual({
        query: 'laptop',
        category: 'electronics',
        inStock: true,
        minPrice: 500
      });
    });

    it('merges with existing config params', () => {
      const endpoints = createSearchEndpoints<Product>('/api/products');
      const request = endpoints.search(
        { query: 'laptop' },
        { params: { source: 'mobile' } }
      );

      expect(request.config?.params).toEqual({
        query: 'laptop',
        source: 'mobile'
      });
    });
  });
});

describe('createFullEndpoints', () => {
  interface Product {
    id: string;
    name: string;
  }

  it('includes all REST endpoints', () => {
    const endpoints = createFullEndpoints<Product>('/api/products');

    expect(endpoints.list).toBeDefined();
    expect(endpoints.get).toBeDefined();
    expect(endpoints.create).toBeDefined();
    expect(endpoints.update).toBeDefined();
    expect(endpoints.patch).toBeDefined();
    expect(endpoints.delete).toBeDefined();
  });

  it('includes pagination endpoint', () => {
    const endpoints = createFullEndpoints<Product>('/api/products');

    expect(endpoints.listPaginated).toBeDefined();
  });

  it('includes search endpoint', () => {
    const endpoints = createFullEndpoints<Product>('/api/products');

    expect(endpoints.search).toBeDefined();
  });

  it('all endpoints work together', () => {
    const endpoints = createFullEndpoints<Product>('/api/products');

    // REST
    const list = endpoints.list();
    expect(list.url).toBe('/api/products');

    // Pagination
    const paginated = endpoints.listPaginated({ page: 1, pageSize: 10 });
    expect(paginated.config?.params).toEqual({ page: 1, pageSize: 10 });

    // Search
    const search = endpoints.search({ query: 'laptop', page: 1 });
    expect(search.url).toBe('/api/products/search');
    expect(search.config?.params).toEqual({ query: 'laptop', page: 1 });

    // CRUD
    const get = endpoints.get('123');
    expect(get.url).toBe('/api/products/123');

    const create = endpoints.create({ name: 'New Product' });
    expect(create.method).toBe('POST');
    expect(create.config?.body).toEqual({ name: 'New Product' });

    const update = endpoints.update('123', { name: 'Updated' });
    expect(update.method).toBe('PUT');

    const del = endpoints.delete('123');
    expect(del.method).toBe('DELETE');
  });
});

describe('Real-world Usage Examples', () => {
  interface Product {
    id: string;
    name: string;
    price: number;
    category: string;
  }

  interface CreateProductDTO {
    name: string;
    price: number;
    category: string;
  }

  it('builds complete product API endpoints', () => {
    const products = createFullEndpoints<Product, CreateProductDTO>('/api/products');

    // List all products
    const listRequest = products.list();
    expect(listRequest).toEqual({
      method: 'GET',
      url: '/api/products'
    });

    // Paginated list
    const paginatedRequest = products.listPaginated({ page: 1, pageSize: 20 });
    expect(paginatedRequest.config?.params).toEqual({ page: 1, pageSize: 20 });

    // Search products
    const searchRequest = products.search({
      query: 'laptop',
      sort: 'price',
      order: 'asc',
      filters: { category: 'electronics' }
    });
    expect(searchRequest.url).toBe('/api/products/search');
    expect(searchRequest.config?.params).toEqual({
      query: 'laptop',
      sort: 'price',
      order: 'asc',
      category: 'electronics'
    });

    // Get single product
    const getRequest = products.get('123');
    expect(getRequest).toEqual({
      method: 'GET',
      url: '/api/products/123'
    });

    // Create product
    const createRequest = products.create({
      name: 'MacBook Pro',
      price: 2499,
      category: 'electronics'
    });
    expect(createRequest.method).toBe('POST');
    expect(createRequest.config?.body).toEqual({
      name: 'MacBook Pro',
      price: 2499,
      category: 'electronics'
    });

    // Update product
    const updateRequest = products.update('123', {
      name: 'MacBook Pro M3',
      price: 2699,
      category: 'electronics'
    });
    expect(updateRequest.method).toBe('PUT');
    expect(updateRequest.url).toBe('/api/products/123');

    // Partial update
    const patchRequest = products.patch('123', { price: 2599 });
    expect(patchRequest.method).toBe('PATCH');
    expect(patchRequest.config?.body).toEqual({ price: 2599 });

    // Delete product
    const deleteRequest = products.delete('123');
    expect(deleteRequest).toEqual({
      method: 'DELETE',
      url: '/api/products/123'
    });
  });

  it('builds simple CRUD endpoints without pagination/search', () => {
    interface User {
      id: string;
      name: string;
      email: string;
    }

    const users = createRESTEndpoints<User>('/api/users');

    const list = users.list();
    expect(list.url).toBe('/api/users');

    const get = users.get('u123');
    expect(get.url).toBe('/api/users/u123');

    const create = users.create({ name: 'John', email: 'john@example.com' });
    expect(create.config?.body).toEqual({ name: 'John', email: 'john@example.com' });

    const update = users.update('u123', { name: 'John Doe', email: 'john@example.com' });
    expect(update.url).toBe('/api/users/u123');

    const del = users.delete('u123');
    expect(del.url).toBe('/api/users/u123');
  });

  it('builds endpoints with custom DTOs', () => {
    interface Article {
      id: string;
      title: string;
      content: string;
      publishedAt: string;
    }

    interface CreateArticleDTO {
      title: string;
      content: string;
    }

    interface UpdateArticleDTO {
      title?: string;
      content?: string;
      published?: boolean;
    }

    const articles = createRESTEndpoints<Article, CreateArticleDTO, UpdateArticleDTO>(
      '/api/articles'
    );

    const create = articles.create({
      title: 'New Article',
      content: 'Article content...'
    });
    expect(create.config?.body).toEqual({
      title: 'New Article',
      content: 'Article content...'
    });

    const update = articles.update('a123', {
      title: 'Updated Title',
      published: true
    });
    expect(update.config?.body).toEqual({
      title: 'Updated Title',
      published: true
    });

    const patch = articles.patch('a123', { published: true });
    expect(patch.config?.body).toEqual({ published: true });
  });

  it('builds paginated list with filters', () => {
    interface Order {
      id: string;
      status: string;
      total: number;
    }

    const orders = createPaginatedEndpoints<Order>('/api/orders');

    const request = orders.listPaginated(
      { page: 2, pageSize: 25 },
      {
        params: {
          status: 'pending',
          minTotal: 100
        }
      }
    );

    expect(request.config?.params).toEqual({
      status: 'pending',
      minTotal: 100,
      page: 2,
      pageSize: 25
    });
  });

  it('builds advanced search with multiple filters', () => {
    interface Product {
      id: string;
      name: string;
      price: number;
    }

    const products = createSearchEndpoints<Product>('/api/products');

    const request = products.search({
      query: 'macbook',
      sort: 'price',
      order: 'desc',
      page: 1,
      pageSize: 20,
      filters: {
        category: 'electronics',
        inStock: true,
        minPrice: 1000,
        maxPrice: 3000,
        brand: 'Apple'
      }
    });

    expect(request.config?.params).toEqual({
      query: 'macbook',
      sort: 'price',
      order: 'desc',
      page: 1,
      pageSize: 20,
      category: 'electronics',
      inStock: true,
      minPrice: 1000,
      maxPrice: 3000,
      brand: 'Apple'
    });
  });
});
