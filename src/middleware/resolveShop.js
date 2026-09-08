import { AppError } from './errorHandler.js';
import { getShopById } from '../config/shops.js';

/** Looks up req.params.shopId and attaches the shop config as req.shop, or 404s. */
export function resolveShop(req, res, next) {
  const shop = getShopById(req.params.shopId);
  if (!shop) {
    next(new AppError('المحل غير موجود', 404));
    return;
  }
  req.shop = shop;
  next();
}

export default resolveShop;
