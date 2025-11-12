# Production Deployment Plan

**Status**: 📝 Draft
**Priority**: High
**Target**: Fly.io deployment for Composable Svelte SSR apps

---

## Overview

Production deployment strategy for Composable Svelte applications with Server-Side Rendering (SSR), integrating with Composable Rust backend on Fly.io.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Fly.io                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌────────────────────────┐    ┌──────────────────────┐   │
│  │  Composable Svelte     │    │  Composable Rust     │   │
│  │  SSR Frontend          │◄──►│  Backend API         │   │
│  │  ─────────────────     │    │  ────────────────    │   │
│  │  • Fastify Server      │    │  • Axum/Actix        │   │
│  │  • Composable Stores   │    │  • PostgreSQL        │   │
│  │  • Effect System       │    │  • Business Logic    │   │
│  │  • SSR/Hydration       │    │  • Authentication    │   │
│  │  • i18n (Phase 17)     │    │                      │   │
│  └────────────────────────┘    └──────────────────────┘   │
│           ↓                              ↓                  │
│    Docker Container              Docker Container          │
│    (Node 20 Alpine)              (Rust Distroless)         │
│                                                             │
│    Internal Network: .internal domain (6PN)                │
└─────────────────────────────────────────────────────────────┘
         ↓                                  ↓
    CDN (Optional)                  Database (Postgres)
    Cloudflare                      Fly Postgres/Supabase
```

---

## Key Decisions

### 1. **Framework: Fastify + Composable Architecture** ✅
- **Not SvelteKit**: Incompatible with Composable Architecture patterns
- Use our own SSR system (`@composable-svelte/core/ssr`)
- Reducer-based state management on both client and server
- Effect system for async operations

### 2. **Container Strategy: Multi-Stage Docker**
- Separate build and production stages
- Minimize final image size (<150MB target)
- Only ship production dependencies
- Use Alpine Linux for minimal footprint

### 3. **Deployment Platform: Fly.io**
- Low latency, global edge deployment
- Internal networking (6PN) for frontend ↔ backend
- Docker-first deployment
- Easy scaling with `fly scale`

---

## Production Concerns

### Performance
- [ ] Bundle size optimization (code splitting)
- [ ] Server-side caching (Redis optional)
- [ ] CDN for static assets
- [ ] Compression (gzip/brotli)
- [ ] HTTP/2 support

### Security
- [ ] Content Security Policy (CSP) headers
- [ ] CORS configuration for Rust backend
- [ ] Rate limiting (per IP)
- [ ] Secrets management (Fly secrets)
- [ ] HTTPS/TLS (automatic via Fly)

### Monitoring
- [ ] Fly.io metrics (CPU, memory, requests)
- [ ] Error tracking (Sentry optional)
- [ ] Performance monitoring (Web Vitals)
- [ ] Uptime monitoring (health checks)

### Scalability
- [ ] Horizontal scaling (multiple instances)
- [ ] Database connection pooling
- [ ] Session storage (stateless or Redis)
- [ ] Load balancing (automatic via Fly)

---

## Important Notes

### Monorepo vs Standalone Apps

The provided `Dockerfile` is designed for deploying from **this monorepo** (specifically the `examples/ssr-server` example). If you're deploying a **standalone Composable Svelte app**:

**Required Adjustments**:
1. **Simplify Dockerfile**: Remove workspace-specific logic (no `packages/core` references)
2. **Standard Dependencies**: Install dependencies normally (no workspace: protocol)
3. **Adjust Build Paths**: Change from monorepo paths to your project structure
4. **Use Any Package Manager**: npm, yarn, or pnpm (workspace features not needed)

**Example Standalone Dockerfile** (simplified):
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
CMD ["node", "dist/server/index.js"]
```

See `DEPLOYMENT-GUIDE.md` Section 1.3 for complete standalone configuration.

---

## Files in This Plan

- **`README.md`** - This overview document
- **`Dockerfile`** - Optimized multi-stage build for SSR apps
- **`fly.toml`** - Fly.io deployment configuration
- **`docker-compose.yml`** - Local development environment
- **`DEPLOYMENT-GUIDE.md`** - Step-by-step deployment instructions
- **`OPTIMIZATION.md`** - Performance optimization strategies
- **`SECURITY.md`** - Security hardening checklist

---

## Next Steps

1. ✅ Create optimized Dockerfile
2. ✅ Create Fly.io configuration
3. ⏳ Test deployment workflow
4. ⏳ Add CI/CD pipeline (GitHub Actions)
5. ⏳ Create production example app
6. ⏳ Document rollback procedures

---

## Related Documentation

- [SSR Implementation](../../packages/core/src/lib/ssr/README.md)
- [i18n Production Guide](../phase-17/README.md)
- [API Client Documentation](../../packages/core/src/lib/api/README.md)

---

**Status**: Ready for implementation
**Owner**: TBD
**Review Date**: TBD
