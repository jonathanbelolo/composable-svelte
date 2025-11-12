# Security Hardening Guide

Security best practices for production Composable Svelte SSR deployments.

---

## Docker Security

### Non-Root User ✅

Our Dockerfile runs as non-root user:

```dockerfile
# Create user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set ownership
COPY --chown=nodejs:nodejs /app/dist ./dist

# Switch to non-root
USER nodejs
```

**Why**: Prevents privilege escalation if container is compromised.

### Minimal Base Image ✅

Using `node:20-alpine`:
- Smaller attack surface
- Fewer CVEs than full Debian/Ubuntu
- <50MB base image

### Read-Only Filesystem (Optional)

```toml
# fly.toml
[[vm]]
  read_only = true  # Filesystem immutable

[[mounts]]
  source = "logs"
  destination = "/app/logs"  # Only writable directory
```

---

## Secrets Management

### ❌ NEVER Commit Secrets

```bash
# ✅ GOOD: Use Fly secrets
fly secrets set SESSION_SECRET=$(openssl rand -hex 32)

# ❌ BAD: Environment variables in fly.toml
[env]
  SESSION_SECRET = "abc123"  # NEVER DO THIS
```

### Secret Rotation

```bash
# Rotate secrets periodically
fly secrets set SESSION_SECRET=$(openssl rand -hex 32)

# List current secrets (values hidden)
fly secrets list

# Remove old secrets
fly secrets unset OLD_SECRET
```

### Access Control

```typescript
// Validate secrets at startup
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  throw new Error('SESSION_SECRET must be at least 32 characters');
}
```

---

## HTTP Security Headers

### Content Security Policy (CSP)

```typescript
// Implemented in @composable-svelte/core/ssr
import { fastifySecurityHeaders } from '@composable-svelte/core/ssr';

fastifySecurityHeaders(app, {
  contentSecurityPolicy: [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",  // Remove 'unsafe-inline' if possible
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self' https://your-backend.fly.dev",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; '),

  // X-Frame-Options
  frameOptions: 'DENY',

  // X-Content-Type-Options
  noSniff: true,

  // Referrer-Policy
  referrerPolicy: 'strict-origin-when-cross-origin',

  // HSTS
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});
```

### Test CSP

```bash
# Check headers
curl -I https://your-app.fly.dev

# Should see:
# Content-Security-Policy: default-src 'self'; ...
# X-Frame-Options: DENY
# Strict-Transport-Security: max-age=31536000
```

---

## Rate Limiting

### Per-IP Rate Limiting ✅

```typescript
import { fastifyRateLimit } from '@composable-svelte/core/ssr';

fastifyRateLimit(app, {
  max: 100,        // 100 requests
  windowMs: 60000, // per minute
  message: 'Too many requests from this IP'
});
```

### Per-Route Rate Limiting

```typescript
app.get('/api/expensive', {
  config: {
    rateLimit: {
      max: 10,       // 10 requests
      timeWindow: 60000  // per minute
    }
  }
}, async (request, reply) => {
  // Expensive operation
});
```

### DDoS Protection

Fly.io provides DDoS protection at the edge. For additional protection:

```bash
# Use Cloudflare in front of Fly.io
# - Rate limiting
# - Bot detection
# - WAF rules
```

---

## Authentication & Authorization

### Session Security

```typescript
import session from '@fastify/session';
import cookie from '@fastify/cookie';

app.register(cookie);
app.register(session, {
  secret: process.env.SESSION_SECRET,
  cookie: {
    secure: true,       // HTTPS only
    httpOnly: true,     // Not accessible via JavaScript
    sameSite: 'strict', // CSRF protection
    maxAge: 3600000     // 1 hour
  }
});
```

### JWT Security

```typescript
import jwt from '@fastify/jwt';

app.register(jwt, {
  secret: process.env.JWT_SECRET,
  sign: {
    expiresIn: '1h'  // Short expiration
  }
});

// Verify JWT on protected routes
app.addHook('preHandler', async (request, reply) => {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.code(401).send({ error: 'Unauthorized' });
  }
});
```

### Password Hashing

Never store plain passwords. Use Argon2 or bcrypt:

```typescript
import argon2 from 'argon2';

// Hash password
const hash = await argon2.hash(password);

// Verify password
const isValid = await argon2.verify(hash, password);
```

---

## CORS Configuration

### Strict CORS

```typescript
import cors from '@fastify/cors';

app.register(cors, {
  origin: [
    'https://your-app.fly.dev',
    process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : null
  ].filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE']
});
```

### Preflight Caching

```typescript
app.register(cors, {
  // ... other options
  preflight: true,
  preflightContinue: false,
  optionsSuccessStatus: 204,
  maxAge: 86400  // Cache preflight for 24 hours
});
```

---

## Input Validation

### Server-Side Validation

Always validate input on the server (never trust client):

```typescript
import { z } from 'zod';

const PostSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(10000),
  tags: z.array(z.string()).max(10)
});

app.post('/api/posts', async (request, reply) => {
  try {
    const validated = PostSchema.parse(request.body);
    // Use validated data
  } catch (err) {
    return reply.code(400).send({ error: 'Invalid input' });
  }
});
```

### SQL Injection Prevention

Use parameterized queries:

```typescript
// ✅ GOOD: Parameterized query
const result = await pool.query(
  'SELECT * FROM posts WHERE id = $1',
  [postId]
);

// ❌ BAD: String concatenation
const result = await pool.query(
  `SELECT * FROM posts WHERE id = ${postId}`  // VULNERABLE
);
```

### XSS Prevention

Svelte automatically escapes HTML by default:

```svelte
<!-- ✅ SAFE: Auto-escaped -->
<div>{userContent}</div>

<!-- ❌ DANGEROUS: Unescaped HTML -->
<div>{@html userContent}</div>

<!-- ✅ SAFE: Sanitize first -->
<div>{@html sanitizeHTML(userContent)}</div>
```

---

## Dependency Security

### Regular Updates

```bash
# Check for vulnerabilities
pnpm audit

# Fix vulnerabilities
pnpm audit --fix

# Update dependencies
pnpm update
```

### Automated Scanning

Add Dependabot to GitHub:

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
```

### Lock File

Always commit `pnpm-lock.yaml`:

```bash
# Install exact versions from lockfile
pnpm install --frozen-lockfile
```

---

## Logging Security

### Don't Log Sensitive Data

```typescript
// ❌ BAD: Logs password
console.log('User login:', { email, password });

// ✅ GOOD: Redact sensitive fields
console.log('User login:', { email });
```

### Structured Logging

```typescript
import pino from 'pino';

const logger = pino({
  redact: ['req.headers.authorization', 'req.body.password']
});

app.log.info({ user: userId }, 'User logged in');
```

---

## Database Security

### Connection Security

```typescript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: true  // Verify SSL certificate
  }
});
```

### Principle of Least Privilege

```sql
-- Create read-only user for analytics
CREATE ROLE analytics_user WITH LOGIN PASSWORD 'secure-password';
GRANT CONNECT ON DATABASE myapp TO analytics_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO analytics_user;
```

---

## Monitoring & Alerts

### Error Tracking

```typescript
import * as Sentry from '@sentry/node';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1
  });
}
```

### Security Alerts

Set up alerts for:
- Unusual error rates
- Failed authentication attempts
- Rate limit breaches
- Unauthorized access attempts

---

## Security Checklist

### Pre-Deployment
- [ ] All secrets in `fly secrets` (not env vars)
- [ ] Security headers configured (CSP, HSTS, etc.)
- [ ] Rate limiting enabled
- [ ] Input validation on all endpoints
- [ ] CORS properly configured
- [ ] Dependencies audited (`pnpm audit`)
- [ ] Non-root user in Docker
- [ ] HTTPS enforced

### Post-Deployment
- [ ] Security headers verified (curl -I)
- [ ] Rate limiting tested
- [ ] Error tracking configured
- [ ] Monitoring/alerts set up
- [ ] Backup/recovery tested
- [ ] Incident response plan documented

### Ongoing
- [ ] Weekly dependency updates
- [ ] Monthly security review
- [ ] Quarterly penetration testing
- [ ] Annual security audit

---

## Incident Response

### If Compromised

1. **Isolate**: Scale to 0 instances (`fly scale count 0`)
2. **Investigate**: Review logs (`fly logs`)
3. **Rotate**: Change all secrets
4. **Patch**: Fix vulnerability
5. **Redeploy**: Deploy patched version
6. **Monitor**: Watch for suspicious activity

### Security Contacts

- Fly.io: security@fly.io
- Composable Svelte: [file GitHub security advisory]

---

## Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Fly.io Security Docs](https://fly.io/docs/reference/security/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)

---

**Next**: Review [OPTIMIZATION.md](./OPTIMIZATION.md) for performance tuning.
