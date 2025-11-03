// ============================================================================
// Common Endpoint Patterns
// ============================================================================

import type { APIRequest, RequestConfig } from './types.js';

// ============================================================================
// REST Endpoints
// ============================================================================

/**
 * Standard REST CRUD operations for a resource.
 */
export interface RESTEndpoints<T, CreateDTO = Partial<T>, UpdateDTO = Partial<T>> {
  /**
   * List all resources.
   * GET /resource
   */
  list(config?: RequestConfig): APIRequest<T[]>;

  /**
   * Get a single resource by ID.
   * GET /resource/:id
   */
  get(id: string, config?: RequestConfig): APIRequest<T>;

  /**
   * Create a new resource.
   * POST /resource
   */
  create(data: CreateDTO, config?: RequestConfig): APIRequest<T>;

  /**
   * Update an existing resource.
   * PUT /resource/:id
   */
  update(id: string, data: UpdateDTO, config?: RequestConfig): APIRequest<T>;

  /**
   * Partially update an existing resource.
   * PATCH /resource/:id
   */
  patch(id: string, data: Partial<UpdateDTO>, config?: RequestConfig): APIRequest<T>;

  /**
   * Delete a resource.
   * DELETE /resource/:id
   */
  delete(id: string, config?: RequestConfig): APIRequest<void>;
}

/**
 * Create REST endpoints for a resource.
 *
 * @example
 * ```typescript
 * interface Product {
 *   id: string;
 *   name: string;
 *   price: number;
 * }
 *
 * interface CreateProductDTO {
 *   name: string;
 *   price: number;
 * }
 *
 * const products = createRESTEndpoints<Product, CreateProductDTO>('/api/products');
 *
 * // Usage:
 * const listReq = products.list();              // GET /api/products
 * const getReq = products.get('123');           // GET /api/products/123
 * const createReq = products.create({ ... });   // POST /api/products
 * const updateReq = products.update('123', ...); // PUT /api/products/123
 * const deleteReq = products.delete('123');     // DELETE /api/products/123
 * ```
 */
export function createRESTEndpoints<T, CreateDTO = Partial<T>, UpdateDTO = Partial<T>>(
  basePath: string
): RESTEndpoints<T, CreateDTO, UpdateDTO> {
  return {
    list(config?: RequestConfig): APIRequest<T[]> {
      return {
        method: 'GET',
        url: basePath,
        config
      };
    },

    get(id: string, config?: RequestConfig): APIRequest<T> {
      return {
        method: 'GET',
        url: `${basePath}/${id}`,
        config
      };
    },

    create(data: CreateDTO, config?: RequestConfig): APIRequest<T> {
      return {
        method: 'POST',
        url: basePath,
        config: { ...config, body: data }
      };
    },

    update(id: string, data: UpdateDTO, config?: RequestConfig): APIRequest<T> {
      return {
        method: 'PUT',
        url: `${basePath}/${id}`,
        config: { ...config, body: data }
      };
    },

    patch(id: string, data: Partial<UpdateDTO>, config?: RequestConfig): APIRequest<T> {
      return {
        method: 'PATCH',
        url: `${basePath}/${id}`,
        config: { ...config, body: data }
      };
    },

    delete(id: string, config?: RequestConfig): APIRequest<void> {
      return {
        method: 'DELETE',
        url: `${basePath}/${id}`,
        config
      };
    }
  };
}

// ============================================================================
// Paginated Endpoints
// ============================================================================

/**
 * Pagination parameters.
 */
export interface PaginationParams {
  page?: number;
  pageSize?: number;
  offset?: number;
  limit?: number;
}

/**
 * Paginated response.
 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page?: number;
  pageSize?: number;
  hasMore?: boolean;
}

/**
 * Paginated REST endpoints.
 */
export interface PaginatedEndpoints<T, CreateDTO = Partial<T>, UpdateDTO = Partial<T>>
  extends RESTEndpoints<T, CreateDTO, UpdateDTO> {
  /**
   * List resources with pagination.
   * GET /resource?page=1&pageSize=20
   */
  listPaginated(params: PaginationParams, config?: RequestConfig): APIRequest<PaginatedResponse<T>>;
}

/**
 * Create paginated REST endpoints.
 *
 * @example
 * ```typescript
 * const products = createPaginatedEndpoints<Product>('/api/products');
 *
 * // Usage:
 * const req = products.listPaginated({ page: 1, pageSize: 20 });
 * // GET /api/products?page=1&pageSize=20
 * ```
 */
export function createPaginatedEndpoints<T, CreateDTO = Partial<T>, UpdateDTO = Partial<T>>(
  basePath: string
): PaginatedEndpoints<T, CreateDTO, UpdateDTO> {
  const base = createRESTEndpoints<T, CreateDTO, UpdateDTO>(basePath);

  return {
    ...base,

    listPaginated(params: PaginationParams, config?: RequestConfig): APIRequest<PaginatedResponse<T>> {
      return {
        method: 'GET',
        url: basePath,
        config: {
          ...config,
          params: {
            ...config?.params,
            ...params
          }
        }
      };
    }
  };
}

// ============================================================================
// Search Endpoints
// ============================================================================

/**
 * Search parameters.
 */
export interface SearchParams extends PaginationParams {
  query?: string;
  q?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  filters?: Record<string, string | number | boolean>;
}

/**
 * Search endpoints.
 */
export interface SearchEndpoints<T> {
  /**
   * Search resources.
   * GET /resource/search?q=query&sort=name&order=asc
   */
  search(params: SearchParams, config?: RequestConfig): APIRequest<PaginatedResponse<T>>;
}

/**
 * Create search endpoints.
 *
 * @example
 * ```typescript
 * const productSearch = createSearchEndpoints<Product>('/api/products');
 *
 * // Usage:
 * const req = productSearch.search({
 *   query: 'laptop',
 *   sort: 'price',
 *   order: 'asc',
 *   page: 1,
 *   pageSize: 20
 * });
 * // GET /api/products/search?query=laptop&sort=price&order=asc&page=1&pageSize=20
 * ```
 */
export function createSearchEndpoints<T>(
  basePath: string,
  searchPath: string = '/search'
): SearchEndpoints<T> {
  return {
    search(params: SearchParams, config?: RequestConfig): APIRequest<PaginatedResponse<T>> {
      const { filters, ...otherParams } = params;

      return {
        method: 'GET',
        url: `${basePath}${searchPath}`,
        config: {
          ...config,
          params: {
            ...config?.params,
            ...otherParams,
            ...filters
          }
        }
      };
    }
  };
}

// ============================================================================
// Combined Endpoints
// ============================================================================

/**
 * Full-featured endpoints with REST, pagination, and search.
 */
export interface FullEndpoints<T, CreateDTO = Partial<T>, UpdateDTO = Partial<T>>
  extends PaginatedEndpoints<T, CreateDTO, UpdateDTO>,
    SearchEndpoints<T> {}

/**
 * Create full-featured endpoints (REST + pagination + search).
 *
 * @example
 * ```typescript
 * const products = createFullEndpoints<Product>('/api/products');
 *
 * // All operations available:
 * products.list();                         // GET /api/products
 * products.listPaginated({ page: 1 });    // GET /api/products?page=1
 * products.search({ query: 'laptop' });    // GET /api/products/search?query=laptop
 * products.get('123');                     // GET /api/products/123
 * products.create({ ... });                // POST /api/products
 * products.update('123', { ... });        // PUT /api/products/123
 * products.delete('123');                  // DELETE /api/products/123
 * ```
 */
export function createFullEndpoints<T, CreateDTO = Partial<T>, UpdateDTO = Partial<T>>(
  basePath: string
): FullEndpoints<T, CreateDTO, UpdateDTO> {
  const paginated = createPaginatedEndpoints<T, CreateDTO, UpdateDTO>(basePath);
  const search = createSearchEndpoints<T>(basePath);

  return {
    ...paginated,
    ...search
  };
}
