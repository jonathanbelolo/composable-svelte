# Deployment Guide

Complete step-by-step guide for deploying Composable Svelte SSR applications to production on Fly.io.

---

## Prerequisites

### Required
- [Fly CLI](https://fly.io/docs/hands-on/install-flyctl/) installed
- Fly.io account (sign up at https://fly.io)
- Docker installed locally (for testing builds)
- Composable Rust backend deployed on Fly.io

### Optional
- GitHub account (for CI/CD)
- Sentry account (for error tracking)
- Cloudflare account (for CDN)

---

## Phase 1: Prepare Your Application

### 1.1 Add Health Check Endpoint

Ensure your Fastify server has a health check endpoint:

```typescript
// src/server/index.ts
app.get('/health', async (request, reply) => {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  };
});
```

### 1.2 Environment Variables

Update your app to use environment variables:

```typescript
// src/server/index.ts
const PORT = parseInt(process.env.PORT || '3000', 10);
const BACKEND_URL = process.env.COMPOSABLE_RUST_BACKEND_URL || 'http://localhost:8080';

// Use in API client
export const backendAPI = createAPIClient({
  baseURL: BACKEND_URL,
  timeout: 30000
});
```

### 1.3 Configure Vite for SSR

Ensure your `vite.config.ts` is configured for SSR builds:

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],

  build: {
    // Client build by default
    outDir: 'dist/client',
    rollupOptions: {
      input: 'src/client/index.ts'
    }
  },

  // SSR build (when --ssr flag is used)
  ssr: {
    noExternal: ['@composable-svelte/core']
  }
});
```

Update `package.json` scripts:

```json
{
  "scripts": {
    "build": "vite build && vite build --ssr",
    "build:client": "vite build",
    "build:server": "vite build --ssr src/server/index.ts --outDir dist/server",
    "start": "NODE_ENV=production node dist/server/index.js"
  }
}
```

### 1.4 Copy Deployment Files

Copy the deployment files to your project root:

```bash
# From composable-svelte repo
cp plans/production-deployment/Dockerfile ./Dockerfile
cp plans/production-deployment/fly.toml ./fly.toml
cp plans/production-deployment/.dockerignore ./.dockerignore
```

### 1.5 Update fly.toml

Edit `fly.toml` and set:
- `app` name (must be globally unique on Fly.io)
- `primary_region` (closest to your users)
- `COMPOSABLE_RUST_BACKEND_URL` (your backend's .internal address)

---

## Phase 2: Local Testing

### 2.1 Test Docker Build Locally

```bash
# Build the Docker image
docker build -t my-composable-app .

# Check image size (should be <150MB)
docker images my-composable-app

# Run locally
docker run -p 3000:3000 \
  -e COMPOSABLE_RUST_BACKEND_URL=http://localhost:8080 \
  my-composable-app

# Test health check
curl http://localhost:3000/health
```

### 2.2 Load Testing (Optional)

```bash
# Install autocannon
npm install -g autocannon

# Run load test
autocannon -c 100 -d 30 http://localhost:3000
```

---

## Phase 3: Deploy to Fly.io

### 3.1 Login to Fly

```bash
fly auth login
```

### 3.2 Create Fly App

```bash
# Launch app (creates app on Fly.io)
fly launch

# This will:
# - Create app in your Fly.io account
# - Provision a free tier VM
# - Deploy from Dockerfile
# - Assign a URL: https://my-composable-app.fly.dev
```

**Important**: Answer "No" when asked to deploy immediately. We need to set secrets first.

### 3.3 Set Secrets

```bash
# Set secrets (never commit these!)
fly secrets set \
  SESSION_SECRET=$(openssl rand -hex 32) \
  JWT_SECRET=$(openssl rand -hex 32) \
  BACKEND_API_KEY=your-backend-api-key-here

# Verify secrets are set
fly secrets list
```

### 3.4 Deploy

```bash
# Deploy the app
fly deploy

# Follow deployment logs
fly logs

# Check status
fly status
```

### 3.5 Verify Deployment

```bash
# Test health endpoint
curl https://my-composable-app.fly.dev/health

# Open in browser
fly open
```

---

## Phase 4: Connect to Rust Backend

### 4.1 Internal Networking

Fly.io's 6PN (IPv6 Private Network) allows apps to communicate privately:

```bash
# Get your Rust backend's internal address
fly status -a my-rust-backend

# You should see: my-rust-backend.internal
```

### 4.2 Update Frontend Config

Your `fly.toml` should have:

```toml
[env]
  COMPOSABLE_RUST_BACKEND_URL = "http://my-rust-backend.internal:8080"
```

This uses Fly's internal network (no internet egress, faster, free).

### 4.3 CORS Configuration

Update your Rust backend to allow requests from your frontend:

```rust
// In your Rust backend
let cors = CorsLayer::new()
    .allow_origin("https://my-composable-app.fly.dev".parse::<HeaderValue>().unwrap())
    .allow_methods([Method::GET, Method::POST])
    .allow_headers([AUTHORIZATION, CONTENT_TYPE]);
```

---

## Phase 5: Scaling

### 5.1 Horizontal Scaling

```bash
# Scale to 2 instances
fly scale count 2

# Scale to 2 in San Jose, 1 in London
fly scale count 2 --region sjc
fly scale count 1 --region lhr

# Check current scale
fly status
```

### 5.2 Vertical Scaling

```bash
# Increase memory to 1GB
fly scale memory 1024

# Increase CPU to 2 cores
fly scale vm shared-cpu-2x
```

### 5.3 Autoscaling (Paid)

Edit `fly.toml`:

```toml
[auto_scaling]
  min_instances = 1
  max_instances = 10

  [[auto_scaling.metrics]]
    type = "requests"
    target = 500
```

---

## Phase 6: Monitoring

### 6.1 Fly.io Dashboard

Visit: https://fly.io/apps/my-composable-app

Monitor:
- Request rate
- Response time
- Error rate
- CPU/Memory usage

### 6.2 Real-time Logs

```bash
# Stream logs
fly logs

# Filter errors only
fly logs | grep ERROR
```

### 6.3 SSH into Instance

```bash
# Open console in running instance
fly ssh console

# Check processes
ps aux

# Check memory
free -m

# Exit
exit
```

---

## Phase 7: Rollback

If deployment fails, rollback to previous version:

```bash
# List releases
fly releases

# Rollback to previous release
fly releases rollback

# Or rollback to specific version
fly releases rollback v3
```

---

## Phase 8: CI/CD (GitHub Actions)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Fly.io

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: superfly/flyctl-actions/setup-flyctl@master

      - run: flyctl deploy --remote-only
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

Get FLY_API_TOKEN:
```bash
fly tokens create deploy
# Add to GitHub Secrets: FLY_API_TOKEN
```

---

## Troubleshooting

### App Won't Start

```bash
# Check logs
fly logs

# Common issues:
# - Missing environment variables
# - Port mismatch (must use PORT env var)
# - Build failed (check Dockerfile)
```

### Health Check Failing

```bash
# Test locally first
docker run -p 3000:3000 my-composable-app
curl http://localhost:3000/health

# Check health check path in fly.toml matches your endpoint
```

### Backend Connection Issues

```bash
# Verify internal network
fly ssh console
wget http://my-rust-backend.internal:8080/health

# If fails, check:
# - Backend is running
# - Backend app name is correct
# - Firewall rules (Fly apps can communicate by default)
```

### High Memory Usage

```bash
# Increase memory
fly scale memory 1024

# Or optimize Node.js
NODE_OPTIONS="--max-old-space-size=512"
```

---

## Cost Optimization

### Free Tier Limits
- 3 shared-cpu-1x VMs (256MB RAM)
- 160GB outbound data transfer
- No cost for internal network traffic

### Recommendations
- **Development**: Use scale-to-zero (`min_machines_running = 0`)
- **Production**: Keep at least 1 instance running
- **High Traffic**: Use autoscaling with proper limits

---

## Security Checklist

- [ ] Secrets set via `fly secrets set` (not environment variables)
- [ ] HTTPS enabled (automatic on Fly.io)
- [ ] CSP headers configured
- [ ] Rate limiting enabled
- [ ] CORS configured correctly
- [ ] Non-root user in Docker (nodejs:nodejs)
- [ ] No sensitive data in logs
- [ ] Regular security updates (`fly deploy` with latest base image)

---

## Next Steps

1. Set up monitoring (Sentry, Datadog, etc.)
2. Configure CDN for static assets (Cloudflare)
3. Add database backups (if using Fly Postgres)
4. Set up staging environment
5. Document runbooks for common operations

---

**Questions?** Check the Fly.io docs or the Composable Svelte community.
