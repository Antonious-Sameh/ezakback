import { describe, it, expect, vi } from 'vitest';
import { AppError, errorHandler, notFoundHandler } from '../../src/middleware/errorHandler.js';

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('AppError', () => {
  it('is operational and carries the given statusCode/message/details', () => {
    const err = new AppError('رسالة واضحة', 400, { field: 'مطلوب' });
    expect(err.isOperational).toBe(true);
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe('رسالة واضحة');
    expect(err.details).toEqual({ field: 'مطلوب' });
  });

  it('defaults to statusCode 500', () => {
    expect(new AppError('خطأ').statusCode).toBe(500);
  });
});

describe('notFoundHandler', () => {
  it('forwards a 404 AppError naming the missing route', () => {
    const req = { method: 'GET', originalUrl: '/api/nope' };
    const next = vi.fn();
    notFoundHandler(req, {}, next);

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(404);
    expect(err.message).toContain('/api/nope');
  });
});

describe('errorHandler', () => {
  it('returns the flat { success: false, message } shape for an operational error', () => {
    const req = { originalUrl: '/api/x', method: 'GET' };
    const res = mockRes();
    errorHandler(new AppError('كلمة السر غير صحيحة', 401), req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, message: 'كلمة السر غير صحيحة' }));
  });

  it('includes details when present on an operational error', () => {
    const req = { originalUrl: '/api/x', method: 'GET' };
    const res = mockRes();
    errorHandler(new AppError('طلب غير صالح', 400, { limit: 'رقم غير صالح' }), req, res, vi.fn());

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ details: { limit: 'رقم غير صالح' } }),
    );
  });

  it('hides the real message behind a generic one for a non-operational (bug) error', () => {
    const req = { originalUrl: '/api/x', method: 'GET' };
    const res = mockRes();
    errorHandler(new Error('TypeError: cannot read property of undefined'), req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.message).not.toContain('TypeError');
    expect(body.message).toBe('حدث خطأ غير متوقع في الخادم');
  });

  it('never includes a stack trace in production, even for a non-operational error', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    process.env.OWNER_JWT_SECRET = process.env.OWNER_JWT_SECRET || 'x';
    process.env.OWNER_PASSWORD_HASH = process.env.OWNER_PASSWORD_HASH || 'x';
    vi.resetModules();
    const { errorHandler: prodErrorHandler } = await import('../../src/middleware/errorHandler.js');

    const req = { originalUrl: '/api/x', method: 'GET' };
    const res = mockRes();
    prodErrorHandler(new Error('boom'), req, res, vi.fn());

    expect(res.json.mock.calls[0][0].stack).toBeUndefined();

    process.env.NODE_ENV = originalEnv;
    vi.resetModules();
  });
});
