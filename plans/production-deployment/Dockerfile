# Optimized Multi-Stage Dockerfile for Composable Svelte SSR
# Target: <150MB final image size

# =============================================================================
# Stage 1: Dependencies (Production Only)
# =============================================================================
FROM node:20-alpine AS deps

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@9

# Copy package files for dependency installation
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json ./packages/core/
COPY examples/ssr-server/package.json ./examples/ssr-server/

# Install ONLY production dependencies
# This layer is cached unless package.json changes
RUN pnpm install --frozen-lockfile --prod

# =============================================================================
# Stage 2: Builder (Development Dependencies + Build)
# =============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm and build tools
RUN npm install -g pnpm@9

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json ./packages/core/
COPY examples/ssr-server/package.json ./examples/ssr-server/

# Install ALL dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/core ./packages/core
COPY examples/ssr-server ./examples/ssr-server

# Build @composable-svelte/core package
WORKDIR /app/packages/core
RUN pnpm run build

# Build SSR application (client + server bundles)
WORKDIR /app/examples/ssr-server
RUN pnpm run build

# Remove source maps and unnecessary files to reduce size
RUN find dist -name "*.map" -type f -delete

# =============================================================================
# Stage 3: Production Runtime (Minimal)
# =============================================================================
FROM node:20-alpine AS runner

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy production dependencies from deps stage
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=deps --chown=nodejs:nodejs /app/packages/core/node_modules ./packages/core/node_modules

# Copy built application from builder stage
COPY --from=builder --chown=nodejs:nodejs /app/examples/ssr-server/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/packages/core/dist ./packages/core/dist

# Copy package.json files for runtime metadata and module resolution
COPY --from=builder --chown=nodejs:nodejs /app/examples/ssr-server/package.json ./package.json
COPY --from=builder --chown=nodejs:nodejs /app/packages/core/package.json ./packages/core/package.json
COPY --from=builder --chown=nodejs:nodejs /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

# Switch to non-root user
USER nodejs

# Set production environment
ENV NODE_ENV=production \
    PORT=3000 \
    NODE_OPTIONS="--max-old-space-size=512"

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start server
CMD ["node", "dist/server/index.js"]
