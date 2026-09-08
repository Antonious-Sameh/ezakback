import { describe, it, expect, vi } from 'vitest';
import { requireAuth } from '../../src/middleware/auth.js';
import { signOwnerToken } from '../../src/config/jwt.js';

function mockReq(headers = {}) {
  return { headers };
}

describe('requireAuth', () => {
  it('rejects a missing Authorization header', () => {
    const next = vi.fn();
    requireAuth(mockReq({}), {}, next);
    expect(next.mock.calls[0][0].statusCode).toBe(401);
  });

  it('rejects a header without the Bearer prefix', () => {
    const next = vi.fn();
    requireAuth(mockReq({ authorization: signOwnerToken() }), {}, next);
    expect(next.mock.calls[0][0].statusCode).toBe(401);
  });

  it('rejects an invalid/garbage token', () => {
    const next = vi.fn();
    requireAuth(mockReq({ authorization: 'Bearer not-a-real-token' }), {}, next);
    expect(next.mock.calls[0][0].statusCode).toBe(401);
  });

  it('calls next() with no error for a valid token', () => {
    const token = signOwnerToken();
    const next = vi.fn();
    requireAuth(mockReq({ authorization: `Bearer ${token}` }), {}, next);
    expect(next).toHaveBeenCalledWith();
  });
});
