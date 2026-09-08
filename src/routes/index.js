import { Router } from 'express';
import healthRoute from './health.route.js';
import authRoute from './auth.route.js';
import shopsRoute from './shops.route.js';
import reportsRoute from './reports.route.js';

const router = Router();

router.use('/health', healthRoute);
router.use('/auth', authRoute);
router.use('/shops', shopsRoute);
router.use('/reports', reportsRoute);

// Stage 7-9: /shops/:shopId/... (generic entity proxy, summaries, reports)

export default router;
