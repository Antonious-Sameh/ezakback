import { AppError } from './errorHandler.js';
import { verifyOwnerToken } from '../config/jwt.js';

/**
 * Protects every dashboard route with the owner's own token — completely
 * separate from ADMIN_READONLY_KEY (that's this server's credential *to*
 * each shop, never handed to the browser) and from the shops' own login.
 * The frontend sends this as `Authorization: Bearer <token>`.
 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;

  if (!token) {
    next(new AppError('تسجيل الدخول مطلوب', 401));
    return;
  }

  try {
    verifyOwnerToken(token);
  } catch {
    next(new AppError('انتهت الجلسة، سجل الدخول من جديد', 401));
    return;
  }

  next();
}

export default requireAuth;
