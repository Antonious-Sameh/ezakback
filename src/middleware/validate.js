import { AppError } from './errorHandler.js';

/**
 * Validates req.query against a zod schema and stores the parsed/defaulted
 * result on req.validatedQuery, so handlers never touch the raw (unparsed,
 * un-defaulted, string-only) req.query directly.
 */
export function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(new AppError('طلب غير صالح', 400, result.error.flatten().fieldErrors));
      return;
    }
    req.validatedQuery = result.data;
    next();
  };
}

export default validateQuery;
