import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { validateQuery } from '../../src/middleware/validate.js';

const schema = z.object({ limit: z.coerce.number().int().positive().default(20) });

describe('validateQuery', () => {
  it('parses and defaults valid query params onto req.validatedQuery', () => {
    const req = { query: {} };
    const next = vi.fn();
    validateQuery(schema)(req, {}, next);

    expect(req.validatedQuery).toEqual({ limit: 20 });
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects an invalid query with a 400 AppError', () => {
    const req = { query: { limit: 'not-a-number' } };
    const next = vi.fn();
    validateQuery(schema)(req, {}, next);

    expect(next.mock.calls[0][0].statusCode).toBe(400);
    expect(req.validatedQuery).toBeUndefined();
  });
});
