import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.js';
import { validateQuery } from '../middleware/validate.js';
import * as reportsController from '../controllers/reports.controller.js';

const router = Router();

router.use(requireAuth);

// Same reasoning as shops.route.js: /compare fans out to 8 outbound
// requests (2 per shop) per call.
router.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

router.get('/compare', validateQuery(reportsController.compareQuerySchema), reportsController.compare);

export default router;
