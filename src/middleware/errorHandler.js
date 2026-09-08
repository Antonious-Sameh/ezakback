import { logger } from '../config/logger.js';
import env from '../config/env.js';

/**
 * Throw this (or a subclass) for any expected/handled error. `isOperational:
 * true` tells the error handler it's safe to show `message` to the client
 * as-is; anything else is treated as internal and hidden in production.
 *
 * Response shape is deliberately `{ success: false, message }` — flat, no
 * nested `error` object — because that's exactly what the already-built
 * System 5 frontend's `lib/api.js` reads (`payload?.message`). Shops 1-4
 * nest theirs under `error.message`; System 5 is its own service with its
 * own contract, authored to match the frontend that already exists.
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
  }
}

export function notFoundHandler(req, res, next) {
  next(new AppError(`المسار غير موجود: ${req.method} ${req.originalUrl}`, 404));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const statusCode = Number.isInteger(err.statusCode) ? err.statusCode : 500;
  const isOperational = err.isOperational === true;

  logger.error(
    { err, statusCode, path: req.originalUrl, method: req.method },
    err.message || 'Unhandled error',
  );

  res.status(statusCode).json({
    success: false,
    message: isOperational ? err.message : 'حدث خطأ غير متوقع في الخادم',
    ...(isOperational && err.details ? { details: err.details } : {}),
    ...(env.NODE_ENV !== 'production' && !isOperational ? { stack: err.stack } : {}),
  });
}
