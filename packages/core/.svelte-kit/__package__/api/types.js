// ============================================================================
// Core API Types
// ============================================================================
/**
 * Type-safe request builder.
 */
export const Request = {
    /**
     * Create a GET request.
     */
    get: (url, config) => ({
        method: 'GET',
        url,
        ...(config !== undefined && { config })
    }),
    /**
     * Create a POST request.
     */
    post: (url, body, config) => ({
        method: 'POST',
        url,
        config: { ...config, body }
    }),
    /**
     * Create a PUT request.
     */
    put: (url, body, config) => ({
        method: 'PUT',
        url,
        config: { ...config, body }
    }),
    /**
     * Create a PATCH request.
     */
    patch: (url, body, config) => ({
        method: 'PATCH',
        url,
        config: { ...config, body }
    }),
    /**
     * Create a DELETE request.
     */
    delete: (url, config) => ({
        method: 'DELETE',
        url,
        ...(config !== undefined && { config })
    }),
    /**
     * Create a HEAD request.
     */
    head: (url, config) => ({
        method: 'HEAD',
        url,
        ...(config !== undefined && { config })
    })
};
