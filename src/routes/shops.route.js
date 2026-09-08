import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.js';
import { resolveShop } from '../middleware/resolveShop.js';
import { validateQuery } from '../middleware/validate.js';
import * as shopsController from '../controllers/shops.controller.js';
import * as shopDetailsController from '../controllers/shopDetails.controller.js';
import * as shopReportsController from '../controllers/shopReports.controller.js';
import * as shopEntitiesController from '../controllers/shopEntities.controller.js';

const router = Router();

router.use(requireAuth);

// Every route below fans out to 1-7 requests against a shop's own backend
// (see shopSummary/shopOverview/compareReport services) — much heavier per
// call than a typical request, so a tighter cap than the app-wide limiter
// in app.js both protects the shops themselves from being hammered via
// System 5 and keeps this service's own outbound request volume sane.
router.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

router.get('/', shopsController.list);

// Fixed-second-segment routes MUST be registered above the generic
// /:shopId/:entity routes at the bottom of this file — see the note there.
router.get('/:shopId/overview', resolveShop, shopDetailsController.overview);
router.get('/:shopId/cashbox/summary', resolveShop, shopDetailsController.cashboxSummary);
router.get('/:shopId/expenses/summary', resolveShop, shopDetailsController.expensesSummary);
router.get(
  '/:shopId/reports/:type',
  resolveShop,
  validateQuery(shopReportsController.reportQuerySchema),
  shopReportsController.report,
);

// Generic per-entity list/detail proxy (Stage 7). Anything with a fixed
// second path segment (overview, reports/:type, cashbox/summary, ...) must
// be registered ABOVE this point, or :entity would swallow it — e.g.
// without the routes above, a request to /:shopId/overview would arrive
// here with entity="overview", which isn't in ALLOWED_ENTITIES, and 404.
router.get(
  '/:shopId/:entity',
  resolveShop,
  validateQuery(shopEntitiesController.entityListQuerySchema),
  shopEntitiesController.list,
);
router.get('/:shopId/:entity/:id', resolveShop, shopEntitiesController.item);

export default router;
