// ============================================================================
// Common Endpoint Patterns
// ============================================================================
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
export function createRESTEndpoints(basePath) {
    return {
        list(config) {
            return {
                method: 'GET',
                url: basePath,
                ...(config !== undefined && { config })
            };
        },
        get(id, config) {
            return {
                method: 'GET',
                url: `${basePath}/${id}`,
                ...(config !== undefined && { config })
            };
        },
        create(data, config) {
            return {
                method: 'POST',
                url: basePath,
                config: { ...config, body: data }
            };
        },
        update(id, data, config) {
            return {
                method: 'PUT',
                url: `${basePath}/${id}`,
                config: { ...config, body: data }
            };
        },
        patch(id, data, config) {
            return {
                method: 'PATCH',
                url: `${basePath}/${id}`,
                config: { ...config, body: data }
            };
        },
        delete(id, config) {
            return {
                method: 'DELETE',
                url: `${basePath}/${id}`,
                ...(config !== undefined && { config })
            };
        }
    };
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
export function createPaginatedEndpoints(basePath) {
    const base = createRESTEndpoints(basePath);
    return {
        ...base,
        listPaginated(params, config) {
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
export function createSearchEndpoints(basePath, searchPath = '/search') {
    return {
        search(params, config) {
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
export function createFullEndpoints(basePath) {
    const paginated = createPaginatedEndpoints(basePath);
    const search = createSearchEndpoints(basePath);
    return {
        ...paginated,
        ...search
    };
}
