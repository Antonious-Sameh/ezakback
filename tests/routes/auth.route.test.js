import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';

describe('POST /api/auth/login', () => {
  it('returns a token for the correct password', async () => {
    const app = createApp();
    const res = await request(app).post('/api/auth/login').send({ password: 'test-password-123' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.token).toBe('string');
  });

  it('returns a flat { success: false, message } for a wrong password — matching the frontend contract', async () => {
    const app = createApp();
    const res = await request(app).post('/api/auth/login').send({ password: 'nope' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(typeof res.body.message).toBe('string');
    expect(res.body.token).toBeUndefined();
  });

  it('returns 400 for a missing password', async () => {
    const app = createApp();
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
  });
});
