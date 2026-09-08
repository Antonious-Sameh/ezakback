import { describe, it, expect, vi, afterEach } from 'vitest';
import { login } from '../../src/services/auth.service.js';

describe('auth.service login', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('returns a token for the correct password', async () => {
    const { token } = await login('test-password-123');
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3); // looks like a JWT
  });

  it('rejects an incorrect password with 401', async () => {
    await expect(login('wrong-password')).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejects a missing password with 400', async () => {
    await expect(login('')).rejects.toMatchObject({ statusCode: 400 });
    await expect(login(undefined)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('returns 503 when OWNER_PASSWORD_HASH is not configured', async () => {
    const original = process.env.OWNER_PASSWORD_HASH;
    process.env.OWNER_PASSWORD_HASH = '';
    vi.resetModules();
    const { login: loginFresh } = await import('../../src/services/auth.service.js');

    await expect(loginFresh('anything')).rejects.toMatchObject({ statusCode: 503 });

    process.env.OWNER_PASSWORD_HASH = original;
  });
});
