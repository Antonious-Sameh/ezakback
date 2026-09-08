import env from '../config/env.js';
import { signOwnerToken } from '../config/jwt.js';
import { comparePassword } from '../utils/password.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * Verifies the owner's password against OWNER_PASSWORD_HASH and returns a
 * fresh token. Same message for "not configured" and "wrong password" would
 * be confusing to debug during setup, so those stay distinct — but a wrong
 * password on a *configured* system never reveals more than "wrong",
 * matching the shop systems' own login behavior.
 */
export async function login(password) {
  if (!env.OWNER_PASSWORD_HASH) {
    throw new AppError('تسجيل الدخول غير مُفعّل على هذا الخادم بعد', 503);
  }
  if (!password || typeof password !== 'string') {
    throw new AppError('كلمة السر مطلوبة', 400);
  }

  const isValid = await comparePassword(password, env.OWNER_PASSWORD_HASH);
  if (!isValid) {
    throw new AppError('كلمة السر غير صحيحة', 401);
  }

  return { token: signOwnerToken() };
}
