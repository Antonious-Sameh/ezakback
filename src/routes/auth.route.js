import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as authController from '../controllers/auth.controller.js';

const router = Router();

// There is exactly one password for the whole server, so a much tighter cap
// than the app-wide limiter — this materially slows down anyone guessing it.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', loginLimiter, authController.login);

export default router;
