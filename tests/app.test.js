import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';

const ORIGINAL_CORS_ORIGINS = process.env.CORS_ORIGINS;

describe('CORS', () => {
  afterEach(() => {
    process.env.CORS_ORIGINS = ORIGINAL_CORS_ORIGINS;
    vi.resetModules();
  });

  it('allows a request from an origin on the allowlist', async () => {
    process.env.CORS_ORIGINS = 'https://system5-frontend.example.com';
    vi.resetModules();
    const { createApp } = await import('../src/app.js');

    const app = createApp();
    const res = await request(app).get('/api/health').set('Origin', 'https://system5-frontend.example.com');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://system5-frontend.example.com');
  });

  it('rejects a request from an origin NOT on the allowlist', async () => {
    process.env.CORS_ORIGINS = 'https://system5-frontend.example.com';
    vi.resetModules();
    const { createApp } = await import('../src/app.js');

    const app = createApp();
    const res = await request(app).get('/api/health').set('Origin', 'https://evil.example.com');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('allows requests with no Origin header at all (server-to-server / health checks)', async () => {
    process.env.CORS_ORIGINS = 'https://system5-frontend.example.com';
    vi.resetModules();
    const { createApp } = await import('../src/app.js');

    const app = createApp();
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
  });

  it('allows any origin when CORS_ORIGINS is left empty (no allowlist configured)', async () => {
    process.env.CORS_ORIGINS = '';
    vi.resetModules();
    const { createApp } = await import('../src/app.js');

    const app = createApp();
    const res = await request(app).get('/api/health').set('Origin', 'https://anything.example.com');

    expect(res.status).toBe(200);
  });
});

describe('unknown routes', () => {
  it('404s cleanly for a path under /api that matches nothing', async () => {
    const { createApp } = await import('../src/app.js');
    const app = createApp();

    const res = await request(app).get('/api/totally/made/up');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('404s for a path outside /api entirely', async () => {
    const { createApp } = await import('../src/app.js');
    const app = createApp();

    const res = await request(app).get('/not-an-api-path');

    expect(res.status).toBe(404);
  });
});
