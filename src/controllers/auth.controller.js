import { asyncHandler } from '../middleware/asyncHandler.js';
import * as authService from '../services/auth.service.js';

/** POST /api/auth/login — { password } -> { success, token } */
export const login = asyncHandler(async (req, res) => {
  const { token } = await authService.login(req.body?.password);
  res.json({ success: true, token });
});
